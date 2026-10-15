// Player data access and the response objects the PWA expects (stats and player infos).

const crypto = require('crypto');
const { EmptyPlayerStats } = require('@battlechoc/battlechoc-shared-functions');
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

const stats = async (pool, playerId) => {
    const player = await findPlayer(pool, playerId);
    if (!player) {
        return undefined;
    }
    const now = Date.now();
    const pantryTotals = await pantry.totals(pool, playerId, now);
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
        level: levelOf(player),
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

const playerInfo = async (pool, player) => ({
    name: player.username || EmptyPlayerStats.username,
    // what others see is the rating (verified matches only), never the XP, which offline matches feed
    score: player.rated_matches > 0 ? Math.round(player.rating) : 0,
    rating: Math.round(player.rating),
    level: Object.values(levelOf(player)).reduce((sum, value) => sum + value, 0),
    ...(await results(pool, player.id)),
    ranking: await ranking(pool, player.rating),
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

module.exports = { findPlayer, findPlayerByName, createPlayer, stats, ranking, playerInfo, addTrackRecords, levelOf, count };
