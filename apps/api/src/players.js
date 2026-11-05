// Player data access and the response objects the PWA expects (stats and player infos).

const crypto = require('crypto');
const { EmptyPlayerStats, sanitizeLoadout, engine, StarterKit } = require('@battlechoc/battlechoc-shared-functions');
const { resultOf, xpOf } = require('./xp');
const { isValidUsername, randomName } = require('./names');
const pantry = require('./pantry');

const count = async (pool, sql, params) => Number((await pool.query(sql, params)).rows[0].n);

const findPlayer = async (pool, playerId) => (await pool.query('SELECT * FROM players WHERE id = $1', [playerId])).rows[0];

const findPlayerByName = async (pool, name) => (typeof name === 'string'
    ? (await pool.query('SELECT * FROM players WHERE username_lower = $1', [name.toLowerCase()])).rows[0]
    : undefined);

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

const createPlayer = async pool => {
    const id = crypto.randomUUID();
    await pool.query('INSERT INTO players (id, level) VALUES ($1, $2)', [id, JSON.stringify(EmptyPlayerStats.level)]);
    await pool.query('INSERT INTO identities (provider, subject, player_id) VALUES ($1, $2, $3)', ['device', id, id]);
    return id;
};

const results = async (pool, playerId) => {
    const { rows } = await pool.query('SELECT result, COUNT(*) AS n FROM track_records WHERE player_id = $1 GROUP BY result', [playerId]);
    const byResult = Object.fromEntries(rows.map(row => [row.result, Number(row.n)]));
    return { winnings: byResult.won || 0, drawn: byResult.draw || 0, losses: byResult.lost || 0 };
};

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
const finishTutorial = async (pool, playerId) => {
    const { rows } = await pool.query(
        'UPDATE players SET xp = xp + 100 WHERE id = $1 AND tutorial_finished = FALSE RETURNING id', [playerId]);
    if (rows.length > 0) {
        await pantry.add(pool, playerId, Object.entries(StarterKit).map(([ingredient, amount]) => ({ ingredient, amount })), Date.now());
    }
    await pool.query('UPDATE players SET tutorial_started = TRUE, tutorial_skipped = FALSE, tutorial_finished = TRUE WHERE id = $1', [playerId]);
};

const stats = async (pool, playerId) => {
    const player = await findPlayer(pool, playerId);
    if (!player) {
        return undefined;
    }
    const now = Date.now();
    const pantryTotals = await pantry.totals(pool, playerId, now);
    const items = await itemsOf(pool, playerId);
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
        spoiling: await pantry.spoiling(pool, playerId, now),
        items,
        equipment: equipmentOf(player),
        loadout: loadoutOf(player, items),
        tutorialStarted: player.tutorial_started,
        tutorialSkipped: player.tutorial_skipped,
        tutorialFinished: player.tutorial_finished,
        awards: [],
        trackRecord: [],
        ...(await results(pool, playerId)),
    };
};

// Every named player is on the highscore list. Its order: the shown score (the rating after
// rated matches, 0 before), then who joined first; so every player has a rank of their own,
// also the only player or several with 0.
const score = table => `CASE WHEN ${table}.rated_matches > 0 THEN ${table}.rating ELSE 0 END`;
const ORDER = `${score('players')} DESC, created_at ASC, id ASC`;
const scoreOf = player => (Number(player.rated_matches) > 0 ? Number(player.rating) : 0);

// compared with the player's own row in SQL: timestamps there are finer than in JavaScript
const ranking = async (pool, player) => 1 + await count(pool,
    `SELECT COUNT(*) AS n FROM players other, players me WHERE me.id = $1 AND other.username IS NOT NULL
     AND (${score('other')} > ${score('me')} OR (${score('other')} = ${score('me')}
     AND (other.created_at < me.created_at OR (other.created_at = me.created_at AND other.id < me.id))))`,
    [player.id]);

/** The rank of a player, null while they have no name (unnamed players are not listed). */
const rankOf = async (pool, player) => (player.username ? ranking(pool, player) : null);

const playerInfo = async (pool, player) => ({
    name: player.username || EmptyPlayerStats.username,
    // what others see is the rating (verified matches only), never the XP, which offline matches feed
    score: Math.round(scoreOf(player)),
    rating: Math.round(player.rating),
    ...(await results(pool, player.id)),
    ranking: await rankOf(pool, player),
});

// stores finished offline matches once (by record id) and credits the XP computed on the server;
// they never give ingredients and never change the rating
const addTrackRecords = async (pool, playerId, records) => {
    let credited = 0;
    for (const record of records) {
        if (!record || typeof record !== 'object') {
            continue;
        }
        const id = typeof record.id === 'string' && record.id.length <= 64 ? record.id : crypto.randomUUID();
        const exists = await count(pool, 'SELECT COUNT(*) AS n FROM track_records WHERE id = $1', [`${playerId}:${id}`]);
        if (exists > 0) {
            continue;
        }
        const result = resultOf(record);
        const xp = xpOf(record, result);
        await pool.query('INSERT INTO track_records (id, player_id, record, result, coins, xp) VALUES ($1, $2, $3, $4, 0, $5)',
            [`${playerId}:${id}`, playerId, JSON.stringify(record), result, xp]);
        credited += xp;
        // a match played without the server is one against the AI: it moves the ladder too (like
        // the XP, a faked one only changes the player's own opponents)
        if (result !== 'open') {
            await advanceAiLadder(pool, playerId, result);
        }
    }
    if (credited > 0) {
        await pool.query('UPDATE players SET xp = xp + $1 WHERE id = $2', [credited, playerId]);
    }
    return credited;
};

module.exports = {
    findPlayer, findPlayerByName, freeRandomName, assignRandomName, createPlayer, stats, results, ladderOf, advanceAiLadder, finishTutorial, ORDER, rankOf, playerInfo, addTrackRecords, levelOf, count, itemsOf, equipmentOf, loadoutOf,
};
