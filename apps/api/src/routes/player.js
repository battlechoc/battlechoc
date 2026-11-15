// The player's own data: stats (with pantry, items and equipment), the import of an offline
// profile, offline match records, the tutorial, the name, the language and problem reports.

const { normalizeLanguage } = require('@battlechoc/battlechoc-shared-functions');
const players = require('../players');
const reports = require('../reports');
const { isValidUsername } = require('../names');
const { HttpError, ErrorCode } = require('../errors');

const MAX_RECORDS = 50;
const MAX_MERGED_RECORDS = 500;
// notices marked seen in one request (the stats carry at most 20) and the length of a notice's id
// (a UUID has 36 characters)
const MAX_SEEN_NOTICES = 50;
const MAX_NOTICE_ID_LENGTH = 64;

// the ids of POST /user/notices/seen: 1 to MAX_SEEN_NOTICES distinct, non-empty strings, else 400
const noticeIdsOf = body => {
    const ids = body && body.ids;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_SEEN_NOTICES || new Set(ids).size !== ids.length
        || !ids.every(id => typeof id === 'string' && id.length > 0 && id.length <= MAX_NOTICE_ID_LENGTH)) {
        throw new HttpError(400, ErrorCode.INVALID_REQUEST_PARAMETERS);
    }
    return ids;
};

/**
 * `user`: the middlewares of a route for a player (access token, then the player's row in
 * req.player); `oneAtATime`: the per-player queue of the app; `now`: its clock (ms).
 */
const registerPlayerRoutes = (app, { pool, auth, user, oneAtATime, now = () => Date.now() }) => {
    // after a change: the stats from the player's row as it is now
    const sendStats = async (res, playerId) => res.json({ stats: await players.stats(pool, playerId) });
    // nothing changed: the stats from the row the middleware loaded
    const readStats = async (req, res) => res.json({ stats: await players.statsOf(pool, req.player) });

    app.post('/user', ...user, readStats);
    app.get('/user', ...user, readStats);

    // imports the offline profile of this device once (track records are deduplicated by id;
    // XP is always computed on the server; coins from the client are ignored)
    app.post('/user/merge', ...user, async (req, res) => {
        const info = (req.body && req.body.playerInfo) || {};
        if (!req.player.username && isValidUsername(info.username) && !(await players.findPlayerByName(pool, info.username))) {
            await players.setUsername(pool, req.playerId, info.username);
        }
        await players.mergeTutorialFlags(pool, req.playerId, {
            started: info.tutorialStarted === true,
            skipped: info.tutorialSkipped === true,
        });
        if (info.tutorialFinished === true) {
            // finished on the device without the server: the reward comes now (once)
            await players.finishTutorial(pool, req.playerId);
        }
        if (Array.isArray(info.trackRecord)) {
            await players.addTrackRecords(pool, req.playerId, info.trackRecord.slice(0, MAX_MERGED_RECORDS));
        }
        res.json({ mergedPlayerInfo: await players.stats(pool, req.playerId) });
    });

    app.post('/user/trackrecords', ...user, async (req, res) => {
        if (!req.body || !Array.isArray(req.body.stats)) {
            throw new HttpError(400, ErrorCode.INVALID_REQUEST_PARAMETERS);
        }
        await players.addTrackRecords(pool, req.playerId, req.body.stats.slice(0, MAX_RECORDS));
        await sendStats(res, req.playerId);
    });

    // the notices of minted items (plan C) the game has shown; others' ids and seen ones change nothing
    app.post('/user/notices/seen', ...user, async (req, res) => {
        const ids = noticeIdsOf(req.body);
        await oneAtATime(req.playerId, () => players.markNoticesSeen(pool, req.playerId, ids, now()));
        res.status(204).end();
    });

    app.post('/user/tutorial/:step', ...user, async (req, res) => {
        const { step } = req.params;
        if (step === 'started') {
            await players.setTutorialStep(pool, req.playerId, { started: true, skipped: false });
        } else if (step === 'skipped') {
            await players.setTutorialStep(pool, req.playerId, { started: false, skipped: true });
        } else if (step === 'finished') {
            // finishing the tutorial gives 100 XP and the starter kit, once
            await players.finishTutorial(pool, req.playerId);
        } else {
            throw new HttpError(404, ErrorCode.UNKNOWN_TUTORIAL_STEP);
        }
        await sendStats(res, req.playerId);
    });

    /* ---------- names ---------- */

    app.get('/generaterandomname', auth.requireAuth, async (req, res) => {
        res.json({ username: await players.freeRandomName(pool) });
    });

    app.get('/check/available/:username', auth.requireAuth, async (req, res) => {
        const name = req.params.username;
        res.json({ name, available: isValidUsername(name) && !(await players.findPlayerByName(pool, name)) });
    });

    app.post('/user/username', ...user, async (req, res) => {
        const username = req.body && req.body.username;
        if (!isValidUsername(username)) {
            throw new HttpError(400, ErrorCode.USERNAME_NOT_VALID);
        }
        const owner = await players.findPlayerByName(pool, username);
        if (owner && owner.id !== req.playerId) {
            throw new HttpError(400, ErrorCode.USERNAME_TAKEN);
        }
        try {
            await players.setUsername(pool, req.playerId, username);
        } catch {
            // lost a race against another player for the same name
            throw new HttpError(400, ErrorCode.USERNAME_TAKEN);
        }
        res.json({ username });
    });

    /* ---------- settings, reports ---------- */

    app.post('/user/language', ...user, async (req, res) => {
        // the game's code of the language (a device that stored "jp" sends it: that is "ja")
        const language = normalizeLanguage(req.body && req.body.language);
        if (typeof language === 'undefined') {
            throw new HttpError(400, ErrorCode.INVALID_LANGUAGE);
        }
        await players.setLanguage(pool, req.playerId, language);
        res.json({ language });
    });

    app.post('/debugging/gamestate', auth.requireAuth, async (req, res) => {
        const report = req.body && req.body.report;
        if (!report || typeof report !== 'object') {
            throw new HttpError(400, ErrorCode.INVALID_REPORT);
        }
        await reports.add(pool, req.playerId, report);
        res.status(201).json({});
    });
};

module.exports = { registerPlayerRoutes };
