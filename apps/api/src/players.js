// Player data access and the response objects the PWA expects (stats and player infos).

const crypto = require('crypto');
const { EmptyPlayerStats, sanitizeLoadout, engine, StarterKit } = require('@battlechoc/battlechoc-shared-functions');
const { resultOf, xpOf } = require('./xp');
const { isValidUsername, randomName } = require('./names');
const pantry = require('./pantry');
const { withTransaction, count } = require('./db');

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

/** The crafted items of a player, newest first. */
const itemsOf = async (db, playerId) => {
    const { rows } = await db.query(
        `SELECT i.id, i.item_key, i.serial, i.crafted_by, i.created_at, p.username AS crafter
         FROM items i LEFT JOIN players p ON p.id = i.crafted_by WHERE i.player_id = $1`, [playerId]);
    return rows
        .map(row => ({
            id: row.id,
            item: row.item_key,
            serial: Number(row.serial),
            craftedBy: row.crafter || EmptyPlayerStats.username,
            createdAt: new Date(row.created_at).getTime(),
        }))
        .sort((a, b) => b.createdAt - a.createdAt || b.serial - a.serial);
};

// slots of item ids per building type: { [entityType]: [itemId | null, itemId | null] }
const equipmentOf = player => (player.equipment && typeof player.equipment === 'object' ? player.equipment : {});

/** The item types in a player's slots, as the engine takes them (only owned items, within the rules). */
const loadoutOf = (player, items) => {
    const keyOf = new Map(items.map(entry => [entry.id, entry.item]));
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

/** The stats of a player row that is already loaded: three more queries (pantry, items, results). */
const statsOf = async (pool, player) => {
    const { totals: pantryTotals, spoiling } = await pantry.contents(pool, player.id, Date.now());
    const items = await itemsOf(pool, player.id);
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

// Every named player is on the highscore list. Its order: the shown score (the rating after
// rated matches, 0 before), then who joined first; so every player has a rank of their own,
// also the only player or several with 0.
const score = table => `CASE WHEN ${table}.rated_matches > 0 THEN ${table}.rating ELSE 0 END`;
const ORDER = `${score('players')} DESC, created_at ASC, id ASC`;
const scoreOf = player => (Number(player.rated_matches) > 0 ? Number(player.rating) : 0);
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
        // what others see is the rating (verified matches only), never the XP, which offline matches feed
        score: Math.round(scoreOf(player)),
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

/** Player infos of up to `limit` players whose name contains `text`, the best rated first. */
const searchByName = async (db, text, limit) => {
    // the characters LIKE gives a meaning are taken out of the text
    const pattern = String(text || '').toLowerCase().replace(/[%_\\]/g, '');
    if (pattern.length === 0) {
        return [];
    }
    const { rows } = await db.query(
        'SELECT * FROM players WHERE username_lower LIKE $1 ORDER BY rating DESC LIMIT $2', [`%${pattern}%`, limit]);
    return playerInfos(db, rows);
};

/** The player info of a random named player with XP other than `playerId`; undefined when there is none. */
const randomOpponent = async (db, playerId) => {
    const total = await count(db, 'SELECT COUNT(*) AS n FROM players WHERE username IS NOT NULL AND xp > 0 AND id <> $1', [playerId]);
    if (total === 0) {
        return undefined;
    }
    const { rows } = await db.query(
        'SELECT * FROM players WHERE username IS NOT NULL AND xp > 0 AND id <> $1 ORDER BY id LIMIT 1 OFFSET $2',
        [playerId, crypto.randomInt(total)]);
    return playerInfo(db, rows[0]);
};

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

module.exports = {
    findPlayer, findPlayerByName, setUsername, setLanguage, setTutorialStep, mergeTutorialFlags, freeRandomName, assignRandomName,
    createPlayer, stats, statsOf, results, ladderOf, advanceAiLadder, finishTutorial, rankOf, playerInfo, highscore, friendsOf, addFriend,
    removeFriend, searchByName, randomOpponent, addTrackRecords, levelOf, itemsOf, equipmentOf, loadoutOf,
};
