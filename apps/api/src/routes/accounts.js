// Device accounts: creating one and exchanging its refresh token for access tokens (auth.js).

const players = require('../players');

/**
 * `limit`: the rate limit of creating accounts, `tokenLimit` the one of refreshing tokens. Over
 * the limit both answer 429, never 401: on a 401 for its refresh token the game takes its account
 * for gone and creates a new one.
 */
const registerAccountRoutes = (app, { pool, auth, limit, tokenLimit }) => {
    app.post('/accounts', limit, async (req, res) => {
        const playerId = await players.createPlayer(pool);
        const { refreshToken, sessionId } = await auth.createSession(playerId);
        res.status(201).json({ playerId, refreshToken, ...(await auth.issueAccessToken(playerId, sessionId)) });
    });

    app.post('/accounts/token', tokenLimit, async (req, res) => {
        res.json(await auth.refresh(req.body && req.body.refreshToken));
    });

    // ends one session (plan 3: a wallet's session the player did not keep); also for an unknown
    // token, so nothing here tells whether a token was ever valid
    app.post('/accounts/logout', tokenLimit, async (req, res) => {
        await auth.logout(req.body && req.body.refreshToken);
        res.status(204).end();
    });
};

module.exports = { registerAccountRoutes };
