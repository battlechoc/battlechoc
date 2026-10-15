// What a verified (server-hosted) match gives: XP, ingredient drops, and for matches between two
// humans a rating change. Each is credited once per match (and player).

const crypto = require('crypto');
const { achievementXp, rollDrops, rateMatch: rate } = require('@battlechoc/battlechoc-shared-functions');
const pantry = require('./pantry');
const { withTransaction } = require('./db');
const { count } = require('./players');

const startOfUtcDay = now => {
    const date = new Date(now);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

const secureRandom = () => crypto.randomInt(0, 2 ** 32) / 2 ** 32;

/** Credits a player's verified match (record from MatchRoom.resultFor); null when it was credited before. */
const creditVerifiedMatch = (pool, { playerId, record, isWinner, opponentIsAi, now, random = secureRandom }) =>
    withTransaction(pool, async client => {
        const id = `${playerId}:${record.id}`;
        if (await count(client, 'SELECT COUNT(*) AS n FROM track_records WHERE id = $1', [id]) > 0) {
            return null;
        }
        const earlierToday = await count(client,
            'SELECT COUNT(*) AS n FROM track_records WHERE player_id = $1 AND verified = TRUE AND created_at >= $2',
            [playerId, startOfUtcDay(now)]);
        const achievements = (record.awards || []).map(({ key, xp }) => ({ key, xp }));
        const xp = achievementXp(achievements, isWinner);
        const drops = rollDrops({
            achievements,
            isWinner,
            opponentIsAi,
            verifiedMatchesToday: earlierToday + 1,
            freshBatch: earlierToday === 0,
            random,
        });
        const result = record.won ? 'won' : record.lost ? 'lost' : 'draw';
        await client.query(
            'INSERT INTO track_records (id, player_id, record, result, coins, xp, verified, created_at) VALUES ($1, $2, $3, $4, 0, $5, TRUE, $6)',
            [id, playerId, JSON.stringify(record), result, xp, new Date(now)]);
        await pantry.add(client, playerId, drops, now);
        for (const drop of drops) {
            await client.query('INSERT INTO drops (id, match_id, player_id, ingredient, amount, achievement) VALUES ($1, $2, $3, $4, $5, $6)',
                [crypto.randomUUID(), record.id, playerId, drop.ingredient, drop.amount, drop.achievement]);
        }
        await client.query('UPDATE players SET xp = xp + $1 WHERE id = $2', [xp, playerId]);
        return { xp, drops };
    });

/** Rates a match between two humans once; scoreA is 1, 0.5 or 0. Null when it was rated before. */
const rateMatch = (pool, matchId, [a, b], scoreA) => withTransaction(pool, async client => {
    if (await count(client, 'SELECT COUNT(*) AS n FROM rated_matches WHERE match_id = $1', [matchId]) > 0) {
        return null;
    }
    await client.query('INSERT INTO rated_matches (match_id) VALUES ($1)', [matchId]);
    const load = async id => {
        const { rows } = await client.query('SELECT rating, rating_deviation, rating_volatility FROM players WHERE id = $1', [id]);
        return { rating: Number(rows[0].rating), deviation: Number(rows[0].rating_deviation), volatility: Number(rows[0].rating_volatility) };
    };
    const before = [await load(a), await load(b)];
    const after = rate(before[0], before[1], scoreA);
    const change = {};
    for (const [index, id] of [a, b].entries()) {
        await client.query(
            'UPDATE players SET rating = $1, rating_deviation = $2, rating_volatility = $3, rated_matches = rated_matches + 1 WHERE id = $4',
            [after[index].rating, after[index].deviation, after[index].volatility, id]);
        change[id] = { before: Math.round(before[index].rating), after: Math.round(after[index].rating) };
    }
    return change;
});

module.exports = { creditVerifiedMatch, rateMatch, startOfUtcDay };
