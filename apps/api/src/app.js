// REST API of battlechoc. Paths and response shapes follow the legacy Cloud Functions API so
// the PWA changes stay small; authentication uses device accounts (see auth.js).

const crypto = require('crypto');
const express = require('express');
const {
    EmptyPlayerStats,
    isValidLanguage,
    StarterKit,
} = require('@battlechoc/battlechoc-shared-functions');
const players = require('./players');
const pantry = require('./pantry');
const reports = require('./reports');
const { registerLabRoutes } = require('./lab/routes');
const { loadRecipes } = require('./lab/recipes');
const { createKeyedQueue } = require('./queue');
const { isValidUsername, randomName } = require('./names');
const { AuthError } = require('./auth');

const HIGHSCORE_PAGE_SIZE = 10;
const MAX_QUERY_RESULTS = 20;

// small CORS middleware for the PWA origins (custom headers included)
const cors = origins => (req, res, next) => {
    const origin = req.get('origin');
    if (origin && origins.includes(origin)) {
        res.set('Access-Control-Allow-Origin', origin);
        res.set('Vary', 'Origin');
        res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, battlechoc-pwa-version, battlechoc-pwa-date');
        res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.set('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }
    next();
};

// fixed window rate limit per client address
const rateLimit = ({ windowMs, max }) => {
    const hits = new Map();
    return (req, res, next) => {
        const now = Date.now();
        const key = req.ip;
        const entry = hits.get(key);
        if (!entry || now - entry.since > windowMs) {
            hits.set(key, { since: now, count: 1 });
        } else if (entry.count >= max) {
            res.status(429).json({ error: 'TOO MANY REQUESTS' });
            return;
        } else {
            entry.count += 1;
        }
        next();
    };
};

const createApp = ({ pool, auth, push, corsOrigins = [], accountsPerMinute = 10, recipes = loadRecipes(), labTriesPerHour = 30 }) => {
    const app = express();
    // purchases and equipment changes of one player run one at a time
    const oneAtATime = createKeyedQueue();
    app.set('trust proxy', 1);
    app.use(cors(corsOrigins));
    app.use(express.json({ limit: '256kb' }));

    // async handlers: errors go to the error middleware
    const handle = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
    const requirePlayer = handle(async (req, res, next) => {
        req.player = await players.findPlayer(pool, req.playerId);
        if (!req.player) {
            res.status(404).json({ error: 'PLAYER NOT FOUND' });
            return;
        }
        next();
    });
    const user = [auth.requireAuth, requirePlayer];
    const sendStats = async (res, playerId, status = 200) => res.status(status).json({ stats: await players.stats(pool, playerId) });

    app.get('/health', (req, res) => res.json({ ok: true }));

    /* ---------- accounts ---------- */

    app.post('/accounts', rateLimit({ windowMs: 60000, max: accountsPerMinute }), handle(async (req, res) => {
        const playerId = await players.createPlayer(pool);
        const refreshToken = await auth.createSession(playerId);
        res.status(201).json({ playerId, refreshToken, ...(await auth.issueAccessToken(playerId)) });
    }));

    app.post('/accounts/token', handle(async (req, res) => {
        res.json(await auth.refresh(req.body && req.body.refreshToken));
    }));

    /* ---------- player ---------- */

    app.post('/user', ...user, handle(async (req, res) => sendStats(res, req.playerId)));
    app.get('/user', ...user, handle(async (req, res) => sendStats(res, req.playerId)));

    // imports the offline profile of this device once (track records are deduplicated by id;
    // XP is always computed on the server; coins from the client are ignored)
    app.post('/user/merge', ...user, handle(async (req, res) => {
        const info = (req.body && req.body.playerInfo) || {};
        if (!req.player.username && isValidUsername(info.username) && !(await players.findPlayerByName(pool, info.username))) {
            await pool.query('UPDATE players SET username = $1, username_lower = $2 WHERE id = $3', [info.username, info.username.toLowerCase(), req.playerId]);
        }
        await pool.query(`UPDATE players SET
            tutorial_started = tutorial_started OR $1,
            tutorial_skipped = tutorial_skipped OR $2,
            tutorial_finished = tutorial_finished OR $3 WHERE id = $4`,
        [info.tutorialStarted === true, info.tutorialSkipped === true, info.tutorialFinished === true, req.playerId]);
        if (Array.isArray(info.trackRecord)) {
            await players.addTrackRecords(pool, req.playerId, info.trackRecord.slice(0, 500));
        }
        res.json({ mergedPlayerInfo: await players.stats(pool, req.playerId) });
    }));

    app.post('/user/trackrecords', ...user, handle(async (req, res) => {
        if (!req.body || !Array.isArray(req.body.stats)) {
            res.status(400).json({ error: 'INVALID REQUEST PARAMETERS' });
            return;
        }
        await players.addTrackRecords(pool, req.playerId, req.body.stats.slice(0, 50));
        await sendStats(res, req.playerId);
    }));

    app.post('/user/tutorial/:step', ...user, handle(async (req, res) => {
        const { step } = req.params;
        if (step === 'started') {
            await pool.query('UPDATE players SET tutorial_started = TRUE, tutorial_skipped = FALSE WHERE id = $1', [req.playerId]);
        } else if (step === 'skipped') {
            await pool.query('UPDATE players SET tutorial_started = FALSE, tutorial_skipped = TRUE WHERE id = $1', [req.playerId]);
        } else if (step === 'finished') {
            // finishing the tutorial gives 100 XP and the starter kit (cocoa and the ingredients of the
            // starter recipe), once
            const { rows } = await pool.query(
                'UPDATE players SET xp = xp + 100 WHERE id = $1 AND tutorial_finished = FALSE RETURNING id', [req.playerId]);
            if (rows.length > 0) {
                await pantry.add(pool, req.playerId, Object.entries(StarterKit).map(([ingredient, amount]) => ({ ingredient, amount })), Date.now());
            }
            await pool.query('UPDATE players SET tutorial_started = TRUE, tutorial_skipped = FALSE, tutorial_finished = TRUE WHERE id = $1', [req.playerId]);
        } else {
            res.status(404).json({ error: 'UNKNOWN TUTORIAL STEP' });
            return;
        }
        await sendStats(res, req.playerId);
    }));

    /* ---------- names ---------- */

    app.get('/generaterandomname', auth.requireAuth, handle(async (req, res) => {
        for (let attempt = 0; attempt < 20; attempt++) {
            const candidate = randomName();
            if (isValidUsername(candidate) && !(await players.findPlayerByName(pool, candidate))) {
                res.json({ username: candidate });
                return;
            }
        }
        res.json({ username: EmptyPlayerStats.username });
    }));

    app.get('/check/available/:username', auth.requireAuth, handle(async (req, res) => {
        const name = req.params.username;
        res.json({ name, available: isValidUsername(name) && !(await players.findPlayerByName(pool, name)) });
    }));

    app.post('/user/username', ...user, handle(async (req, res) => {
        const username = req.body && req.body.username;
        if (!isValidUsername(username)) {
            res.status(400).json({ error: 'USERNAME NOT VALID' });
            return;
        }
        const owner = await players.findPlayerByName(pool, username);
        if (owner && owner.id !== req.playerId) {
            res.status(400).json({ error: 'PLAYER WITH GIVEN NAME DOES ALREADY EXIST' });
            return;
        }
        try {
            await pool.query('UPDATE players SET username = $1, username_lower = $2 WHERE id = $3', [username, username.toLowerCase(), req.playerId]);
        } catch (error) {
            // lost a race against another player for the same name
            res.status(400).json({ error: 'PLAYER WITH GIVEN NAME DOES ALREADY EXIST' });
            return;
        }
        res.json({ username });
    }));

    /* ---------- settings, reports ---------- */

    app.post('/user/language', ...user, handle(async (req, res) => {
        const language = req.body && req.body.language;
        if (!isValidLanguage(language)) {
            res.status(400).json({ error: 'INVALID LANGUAGE GIVEN' });
            return;
        }
        await pool.query('UPDATE players SET language = $1 WHERE id = $2', [language, req.playerId]);
        res.json({ language });
    }));

    app.post('/debugging/gamestate', auth.requireAuth, handle(async (req, res) => {
        const report = req.body && req.body.report;
        if (!report || typeof report !== 'object') {
            res.status(400).json({ error: 'INVALID REPORT' });
            return;
        }
        await reports.add(pool, req.playerId, report);
        res.status(201).json({});
    }));

    /* ---------- pantry and lab ---------- */

    app.get('/user/pantry', ...user, handle(async (req, res) => {
        const now = Date.now();
        res.json({ pantry: await pantry.totals(pool, req.playerId, now), spoiling: await pantry.spoiling(pool, req.playerId, now) });
    }));

    registerLabRoutes(app, { pool, user, handle, recipes, oneAtATime, triesPerHour: labTriesPerHour });

    /* ---------- friends, ranking, lookup ---------- */

    app.get('/user/friends', ...user, handle(async (req, res) => {
        const { rows } = await pool.query(
            'SELECT p.* FROM friends f JOIN players p ON p.id = f.friend_id WHERE f.player_id = $1 ORDER BY p.username_lower', [req.playerId]);
        res.json(await Promise.all(rows.map(row => players.playerInfo(pool, row))));
    }));

    app.post('/user/friend', ...user, handle(async (req, res) => {
        const friend = await players.findPlayerByName(pool, req.body && req.body.friend);
        if (!friend || friend.id === req.playerId) {
            res.status(404).json({ error: 'PLAYER NOT FOUND' });
            return;
        }
        const exists = await players.count(pool, 'SELECT COUNT(*) AS n FROM friends WHERE player_id = $1 AND friend_id = $2', [req.playerId, friend.id]);
        if (exists === 0) {
            await pool.query('INSERT INTO friends (player_id, friend_id) VALUES ($1, $2)', [req.playerId, friend.id]);
        }
        res.json({});
    }));

    app.delete('/user/friend', ...user, handle(async (req, res) => {
        const friend = await players.findPlayerByName(pool, req.body && req.body.friend);
        if (!friend) {
            res.status(404).json({ error: 'PLAYER NOT FOUND' });
            return;
        }
        await pool.query('DELETE FROM friends WHERE player_id = $1 AND friend_id = $2', [req.playerId, friend.id]);
        res.json({});
    }));

    // null while the player is not on the highscore list (no name or no rated match yet)
    app.get('/rank', ...user, handle(async (req, res) => {
        res.json({ ranking: await players.rankOf(pool, req.player) });
    }));

    // a page of the list (default: the page of the requesting player) and the requesting
    // player's own entry (ranking null while unrated; own null without a player name), so the
    // client can always show where the player stands
    app.get('/highscore', ...user, handle(async (req, res) => {
        const total = await players.count(pool, 'SELECT COUNT(*) AS n FROM players WHERE username IS NOT NULL AND rated_matches > 0', []);
        const lastPage = Math.max(1, Math.ceil(total / HIGHSCORE_PAGE_SIZE));
        const own = req.player.username ? await players.playerInfo(pool, req.player) : null;
        let page = Number.parseInt(req.query.page, 10);
        if (!Number.isInteger(page)) {
            page = own && own.ranking !== null ? Math.ceil(own.ranking / HIGHSCORE_PAGE_SIZE) : 1;
        }
        page = Math.min(Math.max(1, page), lastPage);
        const { rows } = await pool.query(
            'SELECT * FROM players WHERE username IS NOT NULL AND rated_matches > 0 ORDER BY rating DESC, username_lower ASC LIMIT $1 OFFSET $2',
            [HIGHSCORE_PAGE_SIZE, (page - 1) * HIGHSCORE_PAGE_SIZE]);
        const list = [];
        for (const row of rows) {
            list.push(await players.playerInfo(pool, row));
        }
        res.json({ page, lastPage, total, list, own });
    }));

    app.get('/query/user/:text', auth.requireAuth, handle(async (req, res) => {
        const text = String(req.params.text || '').toLowerCase().replace(/[%_\\]/g, '');
        if (text.length === 0) {
            res.json([]);
            return;
        }
        const { rows } = await pool.query(
            'SELECT * FROM players WHERE username_lower LIKE $1 ORDER BY rating DESC LIMIT $2', [`%${text}%`, MAX_QUERY_RESULTS]);
        res.json(await Promise.all(rows.map(row => players.playerInfo(pool, row))));
    }));

    app.get('/random/opponent', ...user, handle(async (req, res) => {
        const total = await players.count(pool, 'SELECT COUNT(*) AS n FROM players WHERE username IS NOT NULL AND xp > 0 AND id <> $1', [req.playerId]);
        if (total === 0) {
            res.status(404).json({ error: 'NO MATCHING PLAYER FOUND' });
            return;
        }
        const { rows } = await pool.query(
            'SELECT * FROM players WHERE username IS NOT NULL AND xp > 0 AND id <> $1 ORDER BY id LIMIT 1 OFFSET $2',
            [req.playerId, crypto.randomInt(total)]);
        res.json(await players.playerInfo(pool, rows[0]));
    }));

    app.get('/user/:name', auth.requireAuth, handle(async (req, res) => {
        const player = await players.findPlayerByName(pool, req.params.name);
        if (!player) {
            res.status(404).json({ error: 'PLAYER NOT FOUND' });
            return;
        }
        res.json([await players.playerInfo(pool, player)]);
    }));

    /* ---------- web push ---------- */

    app.get('/push/key', (req, res) => res.json({ publicKey: push.enabled ? push.publicKey : null }));

    app.post('/push/subscription', ...user, handle(async (req, res) => {
        if (!(await push.subscribe(req.playerId, req.body && req.body.subscription))) {
            res.status(400).json({ error: 'INVALID SUBSCRIPTION' });
            return;
        }
        res.status(201).json({});
    }));

    app.delete('/push/subscription', ...user, handle(async (req, res) => {
        await push.unsubscribe(req.playerId, req.body && req.body.endpoint);
        res.json({});
    }));

    /* ---------- errors ---------- */

    app.use((req, res) => res.status(404).json({ error: 'NOT FOUND' }));
    // eslint-disable-next-line no-unused-vars
    app.use((error, req, res, next) => {
        if (error instanceof AuthError) {
            res.status(error.status).json({ error: error.message });
        } else if (error.type === 'entity.parse.failed') {
            res.status(400).json({ error: 'INVALID JSON' });
        } else {
            console.error(error);
            res.status(500).json({ error: 'INTERNAL SERVER ERROR' });
        }
    });

    return app;
};

module.exports = { createApp };
