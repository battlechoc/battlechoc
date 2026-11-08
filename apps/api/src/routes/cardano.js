// Signing in with a Cardano key (cardano.js): the network, challenges, and their signatures,
// which link a key to the player or sign that player in on another device. Registered only when
// the server runs with CARDANO_NETWORK. None of the errors here is a 401: on a 401 for its token
// the game takes its account for gone and creates a new one.

const { HttpError, ErrorCode } = require('../errors');
const cardano = require('../cardano');
const players = require('../players');
const linkCodes = require('../linkCodes');

// challenges that a player asks for themselves, with their token
const FOR_PLAYER = ['link', 'confirm', 'connect'];

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
        if (body.purpose === 'connect' && typeof body.code !== 'undefined') {
            // the link page in a phone wallet's browser (plan 3): the code stands for the player,
            // and says what the signature is for
            const code = await linkCodes.openCode(pool, { code: body.code }, now);
            res.json(await cardano.createChallenge(pool, {
                purpose: code.purpose, address: body.address, playerId: code.player_id, linkCodeHash: code.code_hash, network, now,
            }));
            return;
        }
        // a link, a confirm or a wallet's connect is for the player who asks: their token and player
        // are needed (401 without one)
        const forPlayer = FOR_PLAYER.includes(body.purpose);
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

    // a challenge the link page signed for a code: the outcome waits on the code for the game
    const verifyForCode = async (challenge, body) => {
        const subject = cardano.verifySignature({
            signature: body.signature, key: body.key, message: challenge.message, address: challenge.address, network,
        });
        // one signature per code: a second one at the same time finds it taken (404)
        const code = await linkCodes.claim(pool, challenge.link_code_hash, now);
        try {
            return await settleCode(code, subject);
        } catch (error) {
            await linkCodes.release(pool, code.code_hash);
            throw error;
        }
    };

    const settleCode = async (code, subject) => {
        const owner = await cardano.playerOfSubject(pool, subject);
        if (typeof owner !== 'undefined' && owner !== code.player_id) {
            if (code.purpose === 'link') {
                await linkCodes.settle(pool, code.code_hash, { state: 'failed', error: ErrorCode.IDENTITY_TAKEN });
                throw new HttpError(409, ErrorCode.IDENTITY_TAKEN);
            }
            await linkCodes.settle(pool, code.code_hash, { state: 'known', subject, ownerId: owner });
            return { outcome: 'known' };
        }
        const confirmed = code.confirmed_until !== null && new Date(code.confirmed_until).getTime() > now();
        if (typeof owner === 'undefined' && !confirmed && await cardano.keyCount(pool, code.player_id) > 0) {
            await linkCodes.settle(pool, code.code_hash, { state: 'confirm' });
            return { outcome: 'confirm' };
        }
        await cardano.linkIdentity(pool, { playerId: code.player_id, subject, address: cardano.addressOfSubject(subject, network) });
        await linkCodes.settle(pool, code.code_hash, { state: 'linked', subject });
        return { outcome: 'linked' };
    };

    app.post('/user/link-codes', limit, ...user, async (req, res) => {
        const body = req.body || {};
        res.status(201).json(await linkCodes.createLinkCode(pool, {
            playerId: req.playerId,
            purpose: body.purpose,
            confirmedUntil: auth.confirmTokenExpiry(req.get('x-battlechoc-confirm'), req.playerId),
            now,
        }));
    });

    // the game polls this while the player is in the wallet (not under the sign-in limit)
    app.get('/user/link-codes/:code', ...user, async (req, res) => {
        const outcome = await linkCodes.takeOutcome(pool, { code: req.params.code, playerId: req.playerId, now });
        if (outcome.state === 'linked') {
            res.json({ state: 'linked', identity: { provider: cardano.IDENTITY_PROVIDER, subject: outcome.subject, address: cardano.addressOfSubject(outcome.subject, network) } });
        } else if (outcome.state === 'known' && await cardano.playerOfSubject(pool, outcome.subject) !== outcome.owner_id) {
            // the key was removed (or moved) since the link page signed: no session for it
            res.json({ state: 'failed', error: ErrorCode.UNKNOWN_IDENTITY });
        } else if (outcome.state === 'known') {
            const { refreshToken, sessionId } = await auth.createSession(outcome.owner_id, { subject: outcome.subject });
            res.json({ state: 'known', playerId: outcome.owner_id, refreshToken, ...(await auth.issueAccessToken(outcome.owner_id, sessionId)) });
        } else if (outcome.state === 'failed') {
            res.json({ state: 'failed', error: outcome.error });
        } else {
            res.json({ state: outcome.state });
        }
    });

    app.post('/auth/cardano/verify', limit, async (req, res) => {
        const body = req.body || {};
        const challenge = await cardano.consumeChallenge(pool, body.nonce, now);
        if (challenge.link_code_hash) {
            res.json(await verifyForCode(challenge, body));
            return;
        }
        const forPlayer = FOR_PLAYER.includes(challenge.purpose);
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
        const linkToPlayer = async () => {
            // a further key needs a proof by an existing one (the first key and the same key again do not)
            if (typeof owner === 'undefined' && await cardano.keyCount(pool, challenge.player_id) > 0
                && !auth.checkConfirmToken(req.get('x-battlechoc-confirm'), challenge.player_id)) {
                throw new HttpError(403, ErrorCode.CONFIRMATION_REQUIRED);
            }
            return cardano.linkIdentity(pool, { playerId: challenge.player_id, subject, address: cardano.addressOfSubject(subject, network) });
        };
        if (challenge.purpose === 'link') {
            res.json({ identity: await linkToPlayer() });
            return;
        }
        if (challenge.purpose === 'connect') {
            // a wallet (plan 3): another player's → a session for that player (the game asks which
            // progress to keep); unknown or the player's own → linked to the device's player
            if (typeof owner !== 'undefined' && owner !== challenge.player_id) {
                const { refreshToken, sessionId } = await auth.createSession(owner, { subject });
                res.json({ outcome: 'known', playerId: owner, refreshToken, ...(await auth.issueAccessToken(owner, sessionId)) });
                return;
            }
            res.json({ outcome: 'linked', identity: await linkToPlayer() });
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
