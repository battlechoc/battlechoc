// Device accounts: creating one and exchanging its refresh token for access tokens (auth.js).

const players = require('../players');

/** `limit`: the rate limit of creating accounts. */
const registerAccountRoutes = (app, { pool, auth, limit }) => {
    app.post('/accounts', limit, async (req, res) => {
        const playerId = await players.createPlayer(pool);
        const refreshToken = await auth.createSession(playerId);
        res.status(201).json({ playerId, refreshToken, ...(await auth.issueAccessToken(playerId)) });
    });

    app.post('/accounts/token', async (req, res) => {
        res.json(await auth.refresh(req.body && req.body.refreshToken));
    });
};

module.exports = { registerAccountRoutes };
