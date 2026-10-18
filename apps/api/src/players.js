// Player data access and the response objects the PWA expects (stats and player infos).

const crypto = require('crypto');
const { EmptyPlayerStats, sanitizeLoadout } = require('@battlechoc/battlechoc-shared-functions');
const { resultOf, xpOf } = require('./xp');
const pantry = require('./pantry');

const count = async (pool, sql, params) => Number((await pool.query(sql, params)).rows[0].n);

const findPlayer = async (pool, playerId) => (await pool.query('SELECT * FROM players WHERE id = $1', [playerId])).rows[0];

const findPlayerByName = async (pool, name) => (typeof name === 'string'
    ? (await pool.query('SELECT * FROM players WHERE username_lower = $1', [name.toLowerCase()])).rows[0]
    : undefined);

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

// rank by rating among named players with at least one rated match; ties share a rank
const ranking = async (pool, rating) => 1 + await count(pool,
    'SELECT COUNT(*) AS n FROM players WHERE username IS NOT NULL AND rated_matches > 0 AND rating > $1', [rating]);

// only players on the highscore list (named, at least one rated match) have a rank
const isRanked = player => Boolean(player.username) && Number(player.rated_matches) > 0;

/** The rank of a player, null while they are not on the highscore list. */
const rankOf = async (pool, player) => (isRanked(player) ? ranking(pool, player.rating) : null);

const playerInfo = async (pool, player) => ({
    name: player.username || EmptyPlayerStats.username,
    // what others see is the rating (verified matches only), never the XP, which offline matches feed
    score: player.rated_matches > 0 ? Math.round(player.rating) : 0,
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
    }
    if (credited > 0) {
        await pool.query('UPDATE players SET xp = xp + $1 WHERE id = $2', [credited, playerId]);
    }
    return credited;
};

module.exports = {
    findPlayer, findPlayerByName, createPlayer, stats, ranking, rankOf, playerInfo, addTrackRecords, levelOf, count, itemsOf, equipmentOf, loadoutOf,
};
