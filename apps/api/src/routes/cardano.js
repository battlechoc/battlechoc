// Signing in with a Cardano key (cardano.js): the network, challenges, and their signatures,
// which link a key to the player or sign that player in on another device. Registered only when
// the server runs with CARDANO_NETWORK. None of the errors here is a 401: on a 401 for its token
// the game takes its account for gone and creates a new one.

const { HttpError, ErrorCode } = require('../errors');
const cardano = require('../cardano');
const players = require('../players');

const bearerOf = req => {
    const match = /^Bearer (.+)$/.exec(req.get('authorization') || '');
    return match ? match[1] : undefined;
};

const registerCardanoRoutes = (app, { pool, auth, user, network, limit, oneAtATime, now = () => Date.now() }) => {
    app.get('/cardano/network', (req, res) => {
        res.json({ network: network.name });
    });

    app.post('/auth/cardano/challenge', limit, async (req, res) => {
        const body = req.body || {};
        // a link is for the player who asks: their token and player are needed (401 without a token)
        if (body.purpose === 'link') {
            for (const step of user) {
                await step(req, res, () => {});
            }
        }
        res.json(await cardano.createChallenge(pool, {
            purpose: body.purpose,
            address: body.address,
            playerId: body.purpose === 'link' ? req.playerId : null,
            network,
            now,
        }));
    });

    app.post('/auth/cardano/verify', limit, async (req, res) => {
        const body = req.body || {};
        const challenge = await cardano.consumeChallenge(pool, body.nonce, now);
        if (challenge.purpose === 'link') {
            const token = bearerOf(req);
            const playerId = token ? await auth.verify(token).catch(() => undefined) : undefined;
            if (playerId !== challenge.player_id) {
                throw new HttpError(400, ErrorCode.CHALLENGE_EXPIRED);
            }
        }
        const subject = cardano.verifySignature({
            signature: body.signature,
            key: body.key,
            message: challenge.message,
            address: challenge.address,
            network,
        });
        if (challenge.purpose === 'link') {
            res.json({ identity: await cardano.linkIdentity(pool, { playerId: challenge.player_id, subject, address: challenge.address }) });
            return;
        }
        const playerId = await cardano.playerOfSubject(pool, subject);
        if (typeof playerId === 'undefined') {
            throw new HttpError(404, ErrorCode.UNKNOWN_IDENTITY);
        }
        const refreshToken = await auth.createSession(playerId);
        res.json({ playerId, refreshToken, ...(await auth.issueAccessToken(playerId)) });
    });

    app.get('/user/identities', ...user, async (req, res) => {
        const identities = await players.identitiesOf(pool, req.playerId);
        res.json(identities.map(({ provider, subject, createdAt }) => ({
            provider, subject, address: cardano.addressOfSubject(subject, network), createdAt,
        })));
    });

    app.delete('/user/identities/:subject', ...user, async (req, res) => {
        const removed = await oneAtATime(req.playerId, () => players.removeIdentity(pool, req.playerId, req.params.subject)).catch(error => {
            if (error instanceof players.LastIdentityError) {
                throw new HttpError(409, ErrorCode.LAST_IDENTITY);
            }
            throw error;
        });
        if (!removed) {
            throw new HttpError(404, ErrorCode.NOT_FOUND);
        }
        res.status(204).end();
    });

    // before "I've played before" switches a device to a saved account (spec 2026-11-08, section 5)
    app.get('/user/progress', ...user, async (req, res) => {
        res.json({ hasProgress: await players.hasProgress(pool, req.playerId) });
    });
};

module.exports = { registerCardanoRoutes };
