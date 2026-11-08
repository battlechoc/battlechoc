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
        // a link or a confirm is for the player who asks: their token and player are needed (401 without one)
        const forPlayer = body.purpose === 'link' || body.purpose === 'confirm';
        if (forPlayer) {
            for (const step of user) {
                await step(req, res, () => {});
            }
        }
        res.json(await cardano.createChallenge(pool, {
            purpose: body.purpose,
            address: body.address,
            playerId: forPlayer ? req.playerId : null,
            network,
            now,
        }));
    });

    app.post('/auth/cardano/verify', limit, async (req, res) => {
        const body = req.body || {};
        const challenge = await cardano.consumeChallenge(pool, body.nonce, now);
        const forPlayer = challenge.purpose === 'link' || challenge.purpose === 'confirm';
        if (forPlayer) {
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
        const owner = await cardano.playerOfSubject(pool, subject);
        if (challenge.purpose === 'confirm') {
            // a fresh signature by one of the player's own keys: key changes for 5 minutes
            if (owner !== challenge.player_id) {
                throw new HttpError(403, ErrorCode.NOT_YOUR_KEY);
            }
            res.json(auth.issueConfirmToken(challenge.player_id));
            return;
        }
        if (challenge.purpose === 'link') {
            // a further key needs a proof by an existing one (the first key and the same key again do not)
            if (typeof owner === 'undefined' && await cardano.keyCount(pool, challenge.player_id) > 0
                && !auth.checkConfirmToken(req.get('x-battlechoc-confirm'), challenge.player_id)) {
                throw new HttpError(403, ErrorCode.CONFIRMATION_REQUIRED);
            }
            res.json({ identity: await cardano.linkIdentity(pool, { playerId: challenge.player_id, subject, address: challenge.address }) });
            return;
        }
        const playerId = owner;
        if (typeof playerId === 'undefined') {
            throw new HttpError(404, ErrorCode.UNKNOWN_IDENTITY);
        }
        const { refreshToken, sessionId } = await auth.createSession(playerId, { subject });
        res.json({ playerId, refreshToken, ...(await auth.issueAccessToken(playerId, sessionId)) });
    });

    app.get('/user/identities', ...user, async (req, res) => {
        const identities = await players.identitiesOf(pool, req.playerId);
        res.json(identities.map(({ provider, subject, createdAt }) => ({
            provider, subject, address: cardano.addressOfSubject(subject, network), createdAt,
        })));
    });

    app.delete('/user/identities/:subject', ...user, async (req, res) => {
        // removing a key needs a fresh proof by one of the player's keys
        if (!auth.checkConfirmToken(req.get('x-battlechoc-confirm'), req.playerId)) {
            throw new HttpError(403, ErrorCode.CONFIRMATION_REQUIRED);
        }
        const removed = await oneAtATime(req.playerId, () => players.removeIdentity(pool, req.playerId, req.params.subject, { keepSession: req.sessionId })).catch(error => {
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

    // passkey backups of the words: stored by the player, read by whoever has the passkey (the
    // ciphertext is no use without the passkey's PRF secret, so no token is needed to read it)
    app.post('/user/passkeys', ...user, async (req, res) => {
        // one at a time per player, like key removals: no backup outlives its key
        const created = await oneAtATime(req.playerId, () => cardano.storePasskey(pool, req.playerId, req.body));
        res.status(created ? 201 : 200).json({});
    });

    app.get('/user/passkeys', ...user, async (req, res) => {
        res.json(await cardano.passkeysOf(pool, req.playerId));
    });

    app.get('/auth/cardano/passkeys/:credentialId', limit, async (req, res) => {
        const backup = await cardano.passkeyBackup(pool, req.params.credentialId);
        if (!backup) {
            throw new HttpError(404, ErrorCode.NOT_FOUND);
        }
        res.json(backup);
    });

    // before "I've played before" switches a device to a saved account (spec 2026-11-08, section 5)
    app.get('/user/progress', ...user, async (req, res) => {
        res.json({ hasProgress: await players.hasProgress(pool, req.playerId) });
    });
};

module.exports = { registerCardanoRoutes };
