// Player data access and the response objects the PWA expects (stats and player infos).

const crypto = require('crypto');
const { EmptyPlayerStats } = require('@battlechoc/battlechoc-shared-functions');
const { resultOf, coinsOf } = require('./coins');

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
    return {
        id: player.id,
        username: player.username || EmptyPlayerStats.username,
        coins: player.coins,
        score: player.score,
        level: levelOf(player),
        tutorialStarted: player.tutorial_started,
        tutorialSkipped: player.tutorial_skipped,
        tutorialFinished: player.tutorial_finished,
        awards: [],
        trackRecord: [],
        ...(await results(pool, playerId)),
    };
};

// rank among named players; ties share a rank
const ranking = async (pool, score) => 1 + await count(pool,
    'SELECT COUNT(*) AS n FROM players WHERE username IS NOT NULL AND score > $1', [score]);

const playerInfo = async (pool, player) => ({
    name: player.username || EmptyPlayerStats.username,
    score: player.score,
    level: Object.values(levelOf(player)).reduce((sum, value) => sum + value, 0),
    ...(await results(pool, player.id)),
    ranking: await ranking(pool, player.score),
});

// stores finished matches once (by record id) and credits the coins computed on the server
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
        const coins = coinsOf(record, result);
        await pool.query('INSERT INTO track_records (id, player_id, record, result, coins) VALUES ($1, $2, $3, $4, $5)',
            [`${playerId}:${id}`, playerId, JSON.stringify(record), result, coins]);
        credited += coins;
    }
    if (credited > 0) {
        await pool.query('UPDATE players SET coins = coins + $1, score = score + $1 WHERE id = $2', [credited, playerId]);
    }
    return credited;
};

module.exports = { findPlayer, findPlayerByName, createPlayer, stats, ranking, playerInfo, addTrackRecords, levelOf, count };
