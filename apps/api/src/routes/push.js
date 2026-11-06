// Web Push: the public key a browser subscribes with, and a player's subscriptions (push.js).

const { HttpError, ErrorCode } = require('../errors');

const registerPushRoutes = (app, { push, user }) => {
    app.get('/push/key', (req, res) => res.json({ publicKey: push.enabled ? push.publicKey : null }));

    app.post('/push/subscription', ...user, async (req, res) => {
        if (!(await push.subscribe(req.playerId, req.body && req.body.subscription))) {
            throw new HttpError(400, ErrorCode.INVALID_SUBSCRIPTION);
        }
        res.status(201).json({});
    });

    app.delete('/push/subscription', ...user, async (req, res) => {
        await push.unsubscribe(req.playerId, req.body && req.body.endpoint);
        res.json({});
    });
};

module.exports = { registerPushRoutes };
