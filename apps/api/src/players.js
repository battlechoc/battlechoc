// Player data access and the response objects the PWA expects (stats and player infos).

const crypto = require('crypto');
const { EmptyPlayerStats, sanitizeLoadout, engine, StarterKit, starsOf, STARS_DEVIATIONS } = require('@battlechoc/battlechoc-shared-functions');
const { resultOf, xpOf } = require('./xp');
const { isValidUsername, randomName } = require('./names');
const pantry = require('./pantry');
const { withTransaction, count } = require('./db');
const { MAX_SUBJECTS, linkedPlayers } = require('./chain/hopWait');
const { OPEN_IN } = require('./chain/ops');

const findPlayer = async (pool, playerId) => (await pool.query('SELECT * FROM players WHERE id = $1', [playerId])).rows[0];

const findPlayerByName = async (pool, name) => (typeof name === 'string'
    ? (await pool.query('SELECT * FROM players WHERE username_lower = $1', [name.toLowerCase()])).rows[0]
    : undefined);

/** Gives a player a name; rejects when another player has it (the unique index on the lower-case name decides a race). */
const setUsername = (db, playerId, username) => db.query(
    'UPDATE players SET username = $1, username_lower = $2 WHERE id = $3', [username, username.toLowerCase(), playerId]);

const setLanguage = (db, playerId, language) => db.query('UPDATE players SET language = $1 WHERE id = $2', [language, playerId]);

/** The tutorial was started (again) or skipped; the one flag clears the other. */
const setTutorialStep = (db, playerId, { started, skipped }) => db.query(
    'UPDATE players SET tutorial_started = $1, tutorial_skipped = $2 WHERE id = $3', [started, skipped, playerId]);

/** Takes over the tutorial flags of an offline profile: they are only ever set, never cleared. */
const mergeTutorialFlags = (db, playerId, { started, skipped }) => db.query(
    `UPDATE players SET
        tutorial_started = tutorial_started OR $1,
        tutorial_skipped = tutorial_skipped OR $2 WHERE id = $3`,
    [started, skipped, playerId]);

/** A random player name nobody has yet; the placeholder name when 20 tries found none. */
const freeRandomName = async pool => {
    for (let attempt = 0; attempt < 20; attempt++) {
        const candidate = randomName();
        if (isValidUsername(candidate) && !(await findPlayerByName(pool, candidate))) {
            return candidate;
        }
    }
    return EmptyPlayerStats.username;
};

/** Gives a player without a name a random one (a newcomer opening a challenge link); resolves with their name. */
const assignRandomName = async (pool, playerId) => {
    for (let attempt = 0; attempt < 3; attempt++) {
        const player = await findPlayer(pool, playerId);
        if (!player || player.username) {
            return player ? player.username : null;
        }
        const name = await freeRandomName(pool);
        if (name === EmptyPlayerStats.username) {
            return null;
        }
        try {
            await pool.query('UPDATE players SET username = $1, username_lower = $2 WHERE id = $3 AND username IS NULL',
                [name, name.toLowerCase(), playerId]);
        } catch {
            // lost a race for the name: try another
        }
    }
    const player = await findPlayer(pool, playerId);
    return player ? player.username : null;
};

// a player and their device identity exist together or not at all
const createPlayer = pool => withTransaction(pool, async client => {
    const id = crypto.randomUUID();
    await client.query('INSERT INTO players (id, level) VALUES ($1, $2)', [id, JSON.stringify(EmptyPlayerStats.level)]);
    await client.query('INSERT INTO identities (provider, subject, player_id) VALUES ($1, $2, $3)', ['device', id, id]);
    return id;
});

// $1, $2, … for a list of values (pg-mem does not take an array with = ANY)
const placeholders = values => values.map((value, i) => `$${i + 1}`).join(', ');

const RESULT_KEYS = { won: 'winnings', draw: 'drawn', lost: 'losses' };

/** Won, drawn and lost matches of several players with one query: Map of player id → { winnings, drawn, losses }. */
const resultsOf = async (db, playerIds) => {
    const byPlayer = new Map(playerIds.map(id => [id, { winnings: 0, drawn: 0, losses: 0 }]));
    if (playerIds.length > 0) {
        const { rows } = await db.query(
            `SELECT player_id, result, COUNT(*) AS n FROM track_records WHERE player_id IN (${placeholders(playerIds)})
             GROUP BY player_id, result`, playerIds);
        rows.filter(row => RESULT_KEYS[row.result]).forEach(row => {
            byPlayer.get(row.player_id)[RESULT_KEYS[row.result]] = Number(row.n);
        });
    }
    return byPlayer;
};

const results = async (pool, playerId) => (await resultsOf(pool, [playerId])).get(playerId);

const levelOf = player => ({ ...EmptyPlayerStats.level, ...(player.level || {}) });

// the states of a burn operation that make its item burning: signed and sent, or in a block
const BURNING_STATES = ['submitted', 'included'];

/**
 * The mark of an item (GET /user's `minted`):
 * - its mint is in a block (asset name and minted_at set) and it is not burned (plan C):
 *   - burning (plan E): a burn of its token the ownership sync sees (items.burn_tx, also one made
 *     outside the game) or its open burn operation is submitted or included:
 *     { assetName, state: 'burning', operationId } (the open burn operation's id, null without one);
 *   - a prepared burn (nothing signed yet): still usable, { assetName, state: 'minted',
 *     operationId, signing: true, kind: 'burn' };
 *   - else { assetName, state: 'minted' };
 * - else, while a mint of it is open (plan D: prepared or submitted, the asset name still null):
 *   { assetName, state: 'minting', operationId, signing } (`signing`: it waits for the wallet's
 *   signature);
 * - else null.
 */
const mintedOf = row => {
    if (row.asset_name && row.minted_at && !row.burned_at) {
        const burn = row.op_kind === 'burn';
        if (row.burn_tx || (burn && BURNING_STATES.includes(row.op_state))) {
            return { assetName: row.asset_name, state: 'burning', operationId: burn ? row.op_id : null };
        }
        if (burn && row.op_state === 'prepared') {
            return { assetName: row.asset_name, state: 'minted', operationId: row.op_id, signing: true, kind: 'burn' };
        }
        return { assetName: row.asset_name, state: 'minted' };
    }
    if (row.op_kind === 'mint') {
        return { assetName: row.op_asset_name, state: 'minting', operationId: row.op_id, signing: row.op_state === 'prepared' };
    }
    return null;
};

/**
 * The crafted items of a player, newest first: one statement. An item has at most one open
 * operation (ops.insertPrepared; on Postgres also the partial unique index on chain_ops (item_id),
 * which serves the join); a player who never minted joins nothing. A burned item (burned_at set:
 * its burn was credited, plan E) is no item of anybody's any more, also of the player it was
 * credited to.
 */
const itemsOf = async (db, playerId) => {
    const { rows } = await db.query(
        `SELECT i.id, i.item_key, i.serial, i.crafted_by, i.created_at, i.asset_name, i.minted_at, i.burned_at, i.burn_tx, p.username AS crafter,
            o.id AS op_id, o.kind AS op_kind, o.state AS op_state, o.asset_name AS op_asset_name
         FROM items i LEFT JOIN players p ON p.id = i.crafted_by
         LEFT JOIN chain_ops o ON o.item_id = i.id AND o.state IN ${OPEN_IN}
         WHERE i.player_id = $1 AND i.burned_at IS NULL`, [playerId]);
    return rows
        .map(row => ({
            id: row.id,
            item: row.item_key,
            serial: Number(row.serial),
            craftedBy: row.crafter || EmptyPlayerStats.username,
            createdAt: new Date(row.created_at).getTime(),
            minted: mintedOf(row),
        }))
        .sort((a, b) => b.createdAt - a.createdAt || b.serial - a.serial);
};

/** The most notices the stats carry: a player works through them oldest first. */
const MAX_NOTICES = 20;

/**
 * The unseen notices of a player (minted items that arrived in or departed from their wallets, and
 * burned items whose ingredients they got), oldest first, at most MAX_NOTICES: [{ id, kind, item:
 * { id, item, serial }, building, at }], and for kind 'salvaged' also `returned` ({ ingredient:
 * amount }, {} for an item without a recipe), read from the credit (salvage_credits, by the item's
 * asset name). The item's key and serial are read from items, whoever holds it now; a notice whose
 * item row is gone is left out.
 */
const noticesOf = async (db, playerId) => {
    const { rows } = await db.query(
        `SELECT n.id, n.kind, n.building, n.created_at, i.id AS item_id, i.item_key, i.serial, c.returned
         FROM item_notices n JOIN items i ON i.id = n.item_id
         LEFT JOIN salvage_credits c ON c.asset_name = i.asset_name
         WHERE n.player_id = $1 AND n.seen_at IS NULL ORDER BY n.created_at ASC, n.id ASC LIMIT ${MAX_NOTICES}`, [playerId]);
    return rows.map(row => ({
        id: row.id,
        kind: row.kind,
        item: { id: row.item_id, item: row.item_key, serial: Number(row.serial) },
        building: row.building,
        at: new Date(row.created_at).toISOString(),
        ...(row.kind === 'salvaged' ? { returned: (typeof row.returned === 'string' ? JSON.parse(row.returned) : row.returned) ?? {} } : {}),
    }));
};

/**
 * Marks those of `ids` that are unseen notices of the player as seen at `now` (ms); ids of other
 * players' notices, unknown and seen ones change nothing. Resolves with the number marked.
 */
const markNoticesSeen = async (db, playerId, ids, now) => {
    if (ids.length === 0) {
        return 0;
    }
    const { rows } = await db.query(
        `UPDATE item_notices SET seen_at = $1 WHERE player_id = $2 AND seen_at IS NULL AND id IN (${ids.map((id, i) => `$${i + 3}`).join(', ')})
         RETURNING id`, [new Date(now), playerId, ...ids]);
    return rows.length;
};

// slots of item ids per building type: { [entityType]: [itemId | null, itemId | null] }
const equipmentOf = player => (player.equipment && typeof player.equipment === 'object' ? player.equipment : {});

/**
 * `equipment` (equipmentOf's) with `itemId` taken out of every slot: its slots empty, a building
 * whose slots are then all empty left out, as /user/equipment stores it. A new object; plain salvage
 * and the credit of a burned item (chain/credit.js) write it.
 */
const equipmentWithout = (equipment, itemId) => {
    const kept = {};
    Object.entries(equipment).forEach(([entityType, slots]) => {
        const left = (Array.isArray(slots) ? slots : []).map(id => (id === itemId ? null : id));
        if (left.some(id => id !== null)) {
            kept[entityType] = left;
        }
    });
    return kept;
};

/**
 * Whether an item of itemsOf's list can be played: every item but a burning one (plan E), which
 * is out of the loadout and cannot be equipped until its burn is undone (a rollback, an expiry).
 */
const isUsable = entry => !entry.minted || entry.minted.state !== 'burning';

/**
 * The item types in a player's slots, as the engine takes them (only owned, usable items, within
 * the rules). A burning item keeps its slot, as a token that left does (plan C), and is in the
 * loadout again once its burn is undone; a match takes the loadout at its start.
 */
const loadoutOf = (player, items) => {
    const keyOf = new Map(items.filter(isUsable).map(entry => [entry.id, entry.item]));
    const loadout = {};
    Object.entries(equipmentOf(player)).forEach(([entityType, slots]) => {
        const keys = (Array.isArray(slots) ? slots : []).filter(id => keyOf.has(id)).map(id => keyOf.get(id));
        if (keys.length > 0) {
            loadout[entityType] = keys;
        }
    });
    return sanitizeLoadout(loadout);
};

// the AI ladder of a player (stats.aiLadder); before their first match since the ladder came, from their XP
const ladderOf = player => engine.aiLadderOf({
    score: Number(player.xp) || 0,
    aiLadder: typeof player.ai_ladder === 'string' ? JSON.parse(player.ai_ladder) : player.ai_ladder,
});

/** Moves a player's AI ladder after a match against the AI: outcome 'won', 'lost' or 'draw'. */
const advanceAiLadder = async (db, playerId, outcome) => {
    const player = await findPlayer(db, playerId);
    if (player) {
        await db.query('UPDATE players SET ai_ladder = $1 WHERE id = $2',
            [JSON.stringify(engine.nextAiLadder(ladderOf(player), outcome)), playerId]);
    }
};

/**
 * The tutorial is finished: 100 XP and the starter kit, once per player (also when the device
 * reports it later, after a tutorial without the server).
 */
const finishTutorial = (pool, playerId) => withTransaction(pool, async client => {
    // The flag is set by the statement that checks it: of several requests that arrive together
    // (the game reports the tutorial and syncs the offline profile) only one gets a row back.
    const { rows } = await client.query(
        `UPDATE players SET xp = xp + 100, tutorial_started = TRUE, tutorial_skipped = FALSE, tutorial_finished = TRUE
         WHERE id = $1 AND tutorial_finished = FALSE RETURNING id`, [playerId]);
    if (rows.length > 0) {
        await pantry.add(client, playerId, Object.entries(StarterKit).map(([ingredient, amount]) => ({ ingredient, amount })), Date.now());
    } else {
        await client.query('UPDATE players SET tutorial_started = TRUE, tutorial_skipped = FALSE WHERE id = $1', [playerId]);
    }
});

/** The stats of a player row that is already loaded: four more queries (pantry, items, notices, results). */
const statsOf = async (pool, player) => {
    const { totals: pantryTotals, spoiling } = await pantry.contents(pool, player.id, Date.now());
    const items = await itemsOf(pool, player.id);
    const notices = await noticesOf(pool, player.id);
    return {
        id: player.id,
        username: player.username || EmptyPlayerStats.username,
        // score is the XP (private progress); coins is the cocoa, for clients from before the pantry
        coins: pantryTotals.COCOA || 0,
        score: player.xp,
        xp: player.xp,
        // the part of the XP from challenge matches
        challengeXp: player.challenge_xp,
        // the opponent and board of the next match against the AI
        aiLadder: ladderOf(player),
        rating: Math.round(player.rating),
        ratedMatches: player.rated_matches,
        pantry: pantryTotals,
        spoiling,
        items,
        equipment: equipmentOf(player),
        loadout: loadoutOf(player, items),
        // minted items that arrived in or left the player's wallets, and burned ones credited to them, not seen yet
        notices,
        tutorialStarted: player.tutorial_started,
        tutorialSkipped: player.tutorial_skipped,
        tutorialFinished: player.tutorial_finished,
        awards: [],
        trackRecord: [],
        ...(await results(pool, player.id)),
    };
};

/** The stats of a player by id (after a change: the row is read again); undefined when there is none. */
const stats = async (pool, playerId) => {
    const player = await findPlayer(pool, playerId);
    return player ? statsOf(pool, player) : undefined;
};

// Every named player is on the highscore list. Its order: the shown score (the stars: the rating
// minus twice its deviation after rated matches, never below 0; 0 before), then who joined first;
// so every player has a rank of their own, also the only player or several with 0.
const cautious = table => `${table}.rating - ${STARS_DEVIATIONS} * ${table}.rating_deviation`;
const score = table => `CASE WHEN ${table}.rated_matches > 0 AND ${cautious(table)} > 0 THEN ${cautious(table)} ELSE 0 END`;
const ORDER = `${score('players')} DESC, created_at ASC, id ASC`;
const scoreOf = player => starsOf({
    rating: Number(player.rating),
    deviation: Number(player.rating_deviation),
    ratedMatches: Number(player.rated_matches),
});
const HIGHSCORE_PAGE_SIZE = 10;

/**
 * The ranks of several players with one query: Map of player id → rank, null while a player has no
 * name (unnamed players are not listed). Compared with the players' own rows in SQL: timestamps
 * there are finer than in JavaScript. A join with a GROUP BY, because pg-mem knows neither window
 * functions nor correlated subqueries.
 */
const ranksOf = async (db, rows) => {
    const ranks = new Map(rows.map(player => [player.id, player.username ? 1 : null]));
    const named = rows.filter(player => player.username).map(player => player.id);
    if (named.length > 0) {
        // counts the listed players before each one; nobody before them: no row, the rank stays 1
        const { rows: before } = await db.query(
            `SELECT me.id, COUNT(*) AS n FROM players other, players me
             WHERE me.id IN (${placeholders(named)}) AND other.username IS NOT NULL
             AND (${score('other')} > ${score('me')} OR (${score('other')} = ${score('me')}
             AND (other.created_at < me.created_at OR (other.created_at = me.created_at AND other.id < me.id))))
             GROUP BY me.id`, named);
        before.forEach(row => ranks.set(row.id, 1 + Number(row.n)));
    }
    return ranks;
};

/** The rank of a player, null while they have no name. */
const rankOf = async (pool, player) => (await ranksOf(pool, [player])).get(player.id);

/**
 * What others see of several players, in the order of `rows`: two queries whatever their number
 * (results, ranks), one when the caller knows the ranks.
 */
const playerInfos = async (db, rows, ranks) => {
    const results = await resultsOf(db, rows.map(player => player.id));
    const ranking = ranks || await ranksOf(db, rows);
    return rows.map(player => ({
        name: player.username || EmptyPlayerStats.username,
        // what others see is the stars (verified matches only), never the XP, which offline matches feed
        score: scoreOf(player),
        rating: Math.round(player.rating),
        ...results.get(player.id),
        ranking: ranking.get(player.id),
    }));
};

const playerInfo = async (pool, player) => (await playerInfos(pool, [player]))[0];

/**
 * A page of the highscore list for a player: `requested` is the page asked for (anything that is
 * no number: the page the player is on), `own` the player's own entry (null without a name).
 */
const highscore = async (db, player, requested) => {
    const total = await count(db, 'SELECT COUNT(*) AS n FROM players WHERE username IS NOT NULL', []);
    const lastPage = Math.max(1, Math.ceil(total / HIGHSCORE_PAGE_SIZE));
    const own = player.username ? await playerInfo(db, player) : null;
    let page = Number.parseInt(requested, 10);
    if (!Number.isInteger(page)) {
        page = own && own.ranking !== null ? Math.ceil(own.ranking / HIGHSCORE_PAGE_SIZE) : 1;
    }
    page = Math.min(Math.max(1, page), lastPage);
    const offset = (page - 1) * HIGHSCORE_PAGE_SIZE;
    const { rows } = await db.query(
        `SELECT * FROM players WHERE username IS NOT NULL ORDER BY ${ORDER} LIMIT $1 OFFSET $2`, [HIGHSCORE_PAGE_SIZE, offset]);
    // the list is in the order of the ranks, so a row's rank is its place
    const ranks = new Map(rows.map((row, index) => [row.id, offset + index + 1]));
    return { page, lastPage, total, list: await playerInfos(db, rows, ranks), own };
};

/** The friends of a player as player infos, by name. */
const friendsOf = async (db, playerId) => {
    const { rows } = await db.query(
        'SELECT p.* FROM friends f JOIN players p ON p.id = f.friend_id WHERE f.player_id = $1 ORDER BY p.username_lower', [playerId]);
    return playerInfos(db, rows);
};

// adding a friend twice is fine: the second time changes nothing
const addFriend = (db, playerId, friendId) => db.query(
    'INSERT INTO friends (player_id, friend_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [playerId, friendId]);

const removeFriend = (db, playerId, friendId) => db.query(
    'DELETE FROM friends WHERE player_id = $1 AND friend_id = $2', [playerId, friendId]);

// stores finished offline matches once (by record id) and credits the XP computed on the server;
// they never give ingredients and never change the rating
const addTrackRecords = async (pool, playerId, records) => {
    // one row per record id: an id that repeats within the request counts once, like a stored one
    const rows = new Map();
    for (const record of records) {
        if (!record || typeof record !== 'object') {
            continue;
        }
        const id = typeof record.id === 'string' && record.id.length <= 64 ? record.id : crypto.randomUUID();
        if (!rows.has(`${playerId}:${id}`)) {
            const result = resultOf(record);
            rows.set(`${playerId}:${id}`, { record, result, xp: xpOf(record, result) });
        }
    }
    if (rows.size === 0) {
        return 0;
    }
    const entries = [...rows.entries()];
    // The records, their XP and the ladder are written together or not at all: records stored
    // without their XP would never be credited, because the next request skips them as known.
    return withTransaction(pool, async client => {
        // the lock makes two requests of one player take turns (the ladder is read, then written)
        const player = (await client.query('SELECT * FROM players WHERE id = $1 FOR UPDATE', [playerId])).rows[0];
        const values = entries.map((entry, i) => `($${i * 4 + 2}, $1, $${i * 4 + 3}, $${i * 4 + 4}, 0, $${i * 4 + 5})`);
        // one statement for all records; it returns the ids that were new (no conflict target:
        // with one, pg-mem also returns the rows that existed)
        const inserted = await client.query(
            `INSERT INTO track_records (id, player_id, record, result, coins, xp) VALUES ${values.join(', ')}
             ON CONFLICT DO NOTHING RETURNING id`,
            [playerId, ...entries.flatMap(([id, { record, result, xp }]) => [id, JSON.stringify(record), result, xp])]);
        const stored = new Set(inserted.rows.map(row => row.id));
        let credited = 0;
        let ladder = null;
        for (const [id, { result, xp }] of entries) {
            if (stored.has(id)) {
                credited += xp;
                // a match played without the server is one against the AI: it moves the ladder too
                // (like the XP, a faked one only changes the player's own opponents)
                if (result !== 'open') {
                    ladder = engine.nextAiLadder(ladder || ladderOf(player), result);
                }
            }
        }
        if (ladder !== null) {
            await client.query('UPDATE players SET xp = xp + $1, ai_ladder = $2 WHERE id = $3', [credited, JSON.stringify(ladder), playerId]);
        }
        return credited;
    });
};

/**
 * How many of the player's minted items each of their `subjects` holds: Map subject → count. Each
 * item counts for the key that makes the player its owner, as the ownership sync decides
 * (chain/ownership.js decideOwner): its holder_subject (the stake key of the address that holds
 * the token, else its payment key) when that is one of the player's, else its holder_pay (the
 * payment key of that address: its stake key is linked to nobody) when that is one of theirs,
 * else no key (a key removed since the last sync, or no sync yet). Minted means minted_at set (it is
 * only set with the asset name); no `asset_name IS NOT NULL` beside the player: pg-mem, which every
 * API and browser test runs on, then finds no rows once other players' items are minted too.
 */
const mintedItemsBySubject = async (db, playerId, subjects) => {
    const counts = new Map(subjects.map(subject => [subject, 0]));
    const { rows } = await db.query(
        `SELECT holder_subject, holder_pay FROM items WHERE player_id = $1 AND minted_at IS NOT NULL AND burned_at IS NULL`, [playerId]);
    rows.forEach(({ holder_subject: holder, holder_pay: holderPay }) => {
        const key = [holder, holderPay].find(subject => subject !== null && counts.has(subject));
        if (key) {
            counts.set(key, counts.get(key) + 1);
        }
    });
    return counts;
};

/**
 * The Cardano keys linked to a player (the device identity is not listed), oldest first:
 * { provider, subject, createdAt, wallet, items, waitUntil }. `wallet`: the CIP-30 name it was
 * connected with (null: words, or a name the game did not know); `items`: the player's minted
 * items it holds; `waitUntil` (ISO): the end of the wallet hop wait while that is ahead of `now`
 * (ms), else null. From the game's own tables only.
 */
const identitiesOf = async (pool, playerId, { now = Date.now() } = {}) => {
    const { rows } = await pool.query(
        "SELECT provider, subject, created_at, wallet FROM identities WHERE player_id = $1 AND provider = 'cardano' ORDER BY created_at ASC, subject ASC",
        [playerId]);
    const subjects = rows.map(row => row.subject);
    const items = await mintedItemsBySubject(pool, playerId, subjects);
    const linked = new Map();
    for (let start = 0; start < subjects.length; start += MAX_SUBJECTS) {
        (await linkedPlayers(pool, subjects.slice(start, start + MAX_SUBJECTS), now)).forEach((link, subject) => linked.set(subject, link));
    }
    return rows.map(row => {
        const link = linked.get(row.subject);
        return {
            provider: row.provider,
            subject: row.subject,
            createdAt: new Date(row.created_at).toISOString(),
            wallet: row.wallet,
            items: items.get(row.subject),
            waitUntil: link && link.waitUntil !== null ? new Date(link.waitUntil).toISOString() : null,
        };
    });
};

/**
 * Removes one of a player's Cardano keys: false when the player has no such key, LastIdentityError
 * when it is their last one (they could not sign in anywhere else any more). `keepSession`: the
 * session that removes it stays, also when that key signed it in. The key's open identity_history
 * row is closed at `now()` (the app's clock).
 */
class LastIdentityError extends Error {}
const removeIdentity = (pool, playerId, subject, { keepSession = null, now = Date.now } = {}) => withTransaction(pool, async client => {
    // the player's row is locked: two removals at once (also from two API processes) wait for each other
    await client.query('SELECT id FROM players WHERE id = $1 FOR UPDATE', [playerId]);
    const keys = await count(client, "SELECT COUNT(*) AS n FROM identities WHERE player_id = $1 AND provider = 'cardano'", [playerId]);
    const owned = await count(client, "SELECT COUNT(*) AS n FROM identities WHERE player_id = $1 AND provider = 'cardano' AND subject = $2",
        [playerId, subject]);
    if (owned === 0) {
        return false;
    }
    if (keys <= 1) {
        throw new LastIdentityError();
    }
    await client.query("DELETE FROM identities WHERE player_id = $1 AND provider = 'cardano' AND subject = $2", [playerId, subject]);
    await client.query('UPDATE identity_history SET unlinked_at = $3 WHERE subject = $1 AND player_id = $2 AND unlinked_at IS NULL',
        [subject, playerId, new Date(now())]);
    // the words of that key are no use any more: its passkey backups go with it, and so do the
    // sessions it signed in (words that leaked must not keep a way in)
    await client.query('DELETE FROM passkey_backups WHERE player_id = $1 AND subject = $2', [playerId, subject]);
    // (but not the session that removes it: that device proved it holds another key)
    await client.query("UPDATE sessions SET revoked = TRUE, revoked_reason = 'key-removed' WHERE player_id = $1 AND subject = $2 AND id <> $3",
        [playerId, subject, keepSession || '']);
    await client.query('UPDATE sessions SET subject = NULL WHERE id = $1', [keepSession || '']);
    return true;
});

/**
 * Whether an account has progress of its own on the server: a finished match (verified, or
 * played offline and reported: its XP and AI ladder would stay behind otherwise; owner,
 * 2026-11-08), an item or a recipe discovery. The tutorial (its XP and starter kit) and a name do
 * not count: a device that only did the tutorial switches to a saved account without being asked.
 */
const hasProgress = async (pool, playerId) => {
    const checks = [
        "SELECT COUNT(*) AS n FROM track_records WHERE player_id = $1 AND result <> 'open'",
        'SELECT COUNT(*) AS n FROM items WHERE player_id = $1 AND burned_at IS NULL',
        'SELECT COUNT(*) AS n FROM recipe_discoveries WHERE player_id = $1',
    ];
    for (const sql of checks) {
        if (await count(pool, sql, [playerId]) > 0) {
            return true;
        }
    }
    return false;
};

module.exports = {
    identitiesOf,
    removeIdentity,
    LastIdentityError,
    hasProgress,
    findPlayer, findPlayerByName, setUsername, setLanguage, setTutorialStep, mergeTutorialFlags, freeRandomName, assignRandomName,
    createPlayer, stats, statsOf, results, ladderOf, advanceAiLadder, finishTutorial, rankOf, playerInfo, highscore, friendsOf, addFriend,
    removeFriend, addTrackRecords, levelOf, itemsOf, noticesOf, markNoticesSeen, equipmentOf, equipmentWithout, isUsable, loadoutOf,
};
