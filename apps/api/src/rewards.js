// What a verified (server-hosted) match gives: XP, ingredient drops, and a rating change (the
// stars) for matches between two humans and against the server AI. Each is credited once per
// match (and player).

const crypto = require('crypto');
const { achievementXp, rollDrops, rateMatch: rate, rateAgainstAi } = require('@battlechoc/battlechoc-shared-functions');
const pantry = require('./pantry');
const { withTransaction, count } = require('./db');

const startOfUtcDay = now => {
    const date = new Date(now);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

const secureRandom = () => crypto.randomInt(0, 2 ** 32) / 2 ** 32;

/**
 * Credits a player's verified match (record from MatchRoom.resultFor); null when it was credited before.
 * The XP of a challenge match is also counted apart (players.challenge_xp).
 */
const creditVerifiedMatch = (pool, { playerId, record, isWinner, opponentIsAi, challenge = false, now, random = secureRandom }) =>
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
        if (challenge) {
            await client.query('UPDATE players SET challenge_xp = challenge_xp + $1 WHERE id = $2', [xp, playerId]);
        }
        return { xp, drops };
    });

// marks a match as rated; false when it was rated before
const markRated = async (client, matchId) => {
    if (await count(client, 'SELECT COUNT(*) AS n FROM rated_matches WHERE match_id = $1', [matchId]) > 0) {
        return false;
    }
    await client.query('INSERT INTO rated_matches (match_id) VALUES ($1)', [matchId]);
    return true;
};

const loadRating = async (client, id) => {
    const { rows } = await client.query('SELECT rating, rating_deviation, rating_volatility FROM players WHERE id = $1', [id]);
    return { rating: Number(rows[0].rating), deviation: Number(rows[0].rating_deviation), volatility: Number(rows[0].rating_volatility) };
};

const saveRating = (client, id, { rating, deviation, volatility }) => client.query(
    'UPDATE players SET rating = $1, rating_deviation = $2, rating_volatility = $3, rated_matches = rated_matches + 1 WHERE id = $4',
    [rating, deviation, volatility, id]);

const changeOf = (before, after) => ({ before: Math.round(before.rating), after: Math.round(after.rating) });

/** Rates a match between two humans once; scoreA is 1, 0.5 or 0. Null when it was rated before. */
const rateMatch = (pool, matchId, [a, b], scoreA) => withTransaction(pool, async client => {
    if (!(await markRated(client, matchId))) {
        return null;
    }
    const before = [await loadRating(client, a), await loadRating(client, b)];
    const after = rate(before[0], before[1], scoreA);
    const change = {};
    for (const [index, id] of [a, b].entries()) {
        await saveRating(client, id, after[index]);
        change[id] = changeOf(before[index], after[index]);
    }
    return change;
});

/**
 * Rates a match of a player against the server AI once: `ai` is the AI's fixed rating
 * (engine.aiRatingOf), score 1, 0.5 or 0 for the player. Null when it was rated before.
 */
const rateAiMatch = (pool, matchId, playerId, ai, score) => withTransaction(pool, async client => {
    if (!(await markRated(client, matchId))) {
        return null;
    }
    const before = await loadRating(client, playerId);
    const after = rateAgainstAi(before, ai, score);
    await saveRating(client, playerId, after);
    return { [playerId]: changeOf(before, after) };
});

module.exports = { creditVerifiedMatch, rateMatch, rateAiMatch, startOfUtcDay };
