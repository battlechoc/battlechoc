const express = require('express');
const cors = require('cors');
const app = express();
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const t = require('./translations.js');
const uuidv4 = require('uuid/v4');
const { Pool } = require('pg')
const axios = require('axios');
const { uniqueNamesGenerator, adjectives, animals, names } = require('unique-names-generator');
admin.initializeApp();
const db = admin.firestore();

const Rules = require('battlechoc-shared-functions').Rules;
const EmptyPlayerStats = require('battlechoc-shared-functions').EmptyPlayerStats;
const createPlayer = require('battlechoc-shared-functions').createPlayer;
const GameActionTypes = require('battlechoc-shared-functions').GameActionTypes;
const endGameReduction = require('battlechoc-shared-functions').endGameReduction;
const attackReduction = require('battlechoc-shared-functions').attackReduction;
const buildReduction = require('battlechoc-shared-functions').buildReduction;
const finishBuildPhaseReduction = require('battlechoc-shared-functions').finishBuildPhaseReduction;
const finishTurnReduction = require('battlechoc-shared-functions').finishTurnReduction;
const chooseStartReduction = require('battlechoc-shared-functions').chooseStartReduction;
const chooseFieldReduction = require('battlechoc-shared-functions').chooseFieldReduction;
const Board = require('battlechoc-shared-functions').Board;
const NotificationReasonType = require('battlechoc-shared-functions').NotificationReasonType;
const EntityDescriptors = require('battlechoc-shared-functions').EntityDescriptors;
const finalLevel = require('battlechoc-shared-functions').finalLevel;

let dbHost = '/cloudsql/battlechoc:europe-west2:battlechoc-prod-psql';
let dbUser = 'battlechoc-service-account';
let dbPassword = '***REMOVED***';
if (process.env.NODE_ENV === 'development') {
    dbHost = '34.89.31.252';
} else if (process.env.NODE_ENV === 'test') {
    dbHost = 'localhost';
    dbUser = 'postgres';
    dbPassword = 'hackersdontcare';
}

const dbPool = new Pool({
    host: dbHost,
    user: dbUser,
    password: dbPassword,
    database: 'battlechoc',
    max: 1
});

const randomNameGeneratorConfig = {
    dictionaries: [adjectives, names, animals],
    separator: '',
    length: 3,
    style: 'capital'
};

const whitelist = ['https://battlechoc.dev', 'https://battlechoc.com', 'http://localhost:3000', 'https://localhost:3000', 'https://battlechoc.firebaseapp.com', 'chrome-extension://fhbjgbiflinjbdggehcddcbncdddomop'];
const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || whitelist.indexOf(origin) !== -1) {
            callback(null, true)
        } else {
            let error = new Error('Not allowed by CORS');
            console.warn('Access denied (CORS) for origin ' + origin);
            error.statusCode = 403;
            callback(error);
        }
    }
}

app.use(bodyParser.json());

if (process.env.NODE_ENV !== 'test') {
    app.use(cors(corsOptions));
}

app.use(async (req, res, next) => {
    if (process.env.NODE_ENV === 'test') {
        req.user = { uid: req.body.uid || '1337-1337-1337-1337' }
        return next();
    }

    if (!req.headers.authorization) {
        return res.status(403).end();
    }

    if (!req.headers['battlechoc-pwa-version']) {
        req.battlechocPwaVersion = 0;
        console.log('PWA version of this request is older than 01.01.2020');
    } else {
        req.battlechocPwaVersion = req.headers['battlechoc-pwa-version'];
        console.log('PWA version of this request is ' + req.battlechocPwaVersion);
    }

    if (!req.headers['battlechoc-pwa-date']) {
        req.battlechocPwaDate = 0;
    } else {
        req.battlechocPwaDate = req.headers['battlechoc-pwa-date'];
    }

    if (!req.headers['battlechoc-android-version']) {
        req.battlechocAndroidVersion = 0
    } else {
        req.battlechocAndroidVersion = req.headers['battlechoc-android-version'];
        console.log('Incomming request from android app');
        console.log('Android app version of this request is ' + req.battlechocAndroidVersion);
    }

    let authorization = req.headers.authorization.split(' ');
    if (authorization.length === 2) {
        try {
            var token = await admin.auth().verifyIdToken(authorization[1]);
        } catch (error) {
            return res.status(403).json({ error: error.toString() });
        }

        req.user = token;
        next();
    } else {
        return res.status(403).end();
    }
});

class Reducer {
    static updateState(state, action) {
        console.log(action.type);
        switch (action.type) {
            case GameActionTypes.chooseField: return chooseFieldReduction(state, action);
            case GameActionTypes.chooseStart: return chooseStartReduction(state, action);
            case GameActionTypes.finishTurn:
                updateLastNotification(state.id, null);
                return finishTurnReduction(state, action);
            case GameActionTypes.finishBuildPhase: return finishBuildPhaseReduction(state, action);
            case GameActionTypes.build: return buildReduction(state, action);
            case GameActionTypes.attack: return attackReduction(state, action);
            case GameActionTypes.endGame:
                updateTrackRecord(state, action);
                emitEndGameNotification(state, action);
                return endGameReduction(state, action);
        }
    }
}

app.post('/debugging/gamestate', async (req, res) => {
    let report = req.body.report;
    if (typeof report === 'undefined' || typeof report.reported === 'undefined') {
        console.warn("Invalid report element given.", report);
        return res.status(403).json({ error: 'Invalid or malformed argument.' });
    } else {
        try {
            const insertStatement = 'INSERT INTO reports(message, player, date, gamestate, deviceinformation) VALUES ($1, $2, $3, $4, $5) RETURNING id';
            queryResult = await dbPool.query(insertStatement, [report.message, report.player, new Date(report.reported), report.gamestate, report.deviceInformation]);
            if (queryResult.rows.length === 1 && typeof queryResult.rows[0].id !== 'undefined') {
                console.log("Error report inserted with id " + queryResult.rows[0].id);
                if (typeof report.logs !== 'undefined') {
                    if (typeof report.logs.errors !== 'undefined') {
                        report.logs.errors.forEach(async entry => {
                            const insertLogStatement = 'INSERT INTO report_logs(message, date, level, report_id) VALUES ($1, $2, $3, $4)';
                            await dbPool.query(insertLogStatement, [entry.message, new Date(entry.time), 'error', queryResult.rows[0].id]);
                        });
                    }

                    if (typeof report.logs.warnings !== 'undefined') {
                        report.logs.warnings.forEach(async entry => {
                            const insertLogStatement = 'INSERT INTO report_logs(message, date, level, report_id) VALUES ($1, $2, $3, $4)';
                            await dbPool.query(insertLogStatement, [entry.message, new Date(entry.time), 'warning', queryResult.rows[0].id]);
                        });
                    }

                    if (typeof report.logs.infos !== 'undefined') {
                        report.logs.infos.forEach(async entry => {
                            const insertLogStatement = 'INSERT INTO report_logs(message, date, level, report_id) VALUES ($1, $2, $3, $4)';
                            await dbPool.query(insertLogStatement, [entry.message, new Date(entry.time), 'info', queryResult.rows[0].id]);
                        });
                    }
                }
                res.json({ result: 'error report inserted with id ' + queryResult.rows[0].id });
            } else {
                console.error("Could not insert error report from client because no id of new db row returned from insert query.");
                return res.status(500).json({ error: 'Could not persist error report.' });
            }
        } catch (err) {
            console.error("Could not insert error report from client.", err);
            return res.status(500).json({ error: 'Could not persist error report.' });
        }
    }
});

const getPlayerMessagingPermissionTokens = async (userId) => {
    const tokens = [];
    try {
        const tokenQueryResult = await dbPool.query("SELECT token FROM permissions WHERE player = $1", [userId]);
        for (const permission of tokenQueryResult.rows) {
            if (typeof permission.token !== 'undefined') {
                tokens.push(permission);
            }
        }
    } catch (err) {
        console.warn('Cannot fetch tokens for player ', userId, err);
    }
    return tokens;
}

const getPlayerFromId = async (userId) => {
    return await dbPool.query("SELECT * FROM players WHERE id = $1", [userId]);
}

const getPlayerFromName = async (name) => {
    return await dbPool.query("SELECT * FROM players WHERE name = $1", [name]);
}

const calculateCoinsFromTrackRecord = (trackRecord) => {
    if (typeof trackRecord !== 'undefined' && trackRecord.length > 0) {
        return trackRecord.reduce((currentCoins, gameStats) => {
            let coins = gameStats.attacks + gameStats.builtEntities * 2 + gameStats.espionages * 10 + gameStats.moltenFields * 50;
            if (typeof gameStats.winners === 'undefined' || gameStats.winners.length === 0 || (typeof gameStats.lost === 'undefined' && typeof gameStats.won === 'undefined')) {
                // no coins for still running games or undefined stats data
                coins = 0;
            } else {
                if (gameStats.lost === true && gameStats.won !== true) {
                    // no coins for lost games
                    coins = 0;
                } else if (gameStats.lost === gameStats.won) {
                    // half the coins for draw games
                    coins = Math.floor(coins / 2);
                }
            }
            return currentCoins + coins;
        }, 0);
    }
    return 0;
}

const computePlayerLevel = (player) => {
    return Object.values(player.level).reduce((level, current) => level + current, 0);
}

const computeTrackRecordStats = async (player) => {
    let stats = {
        losses: 0,
        winnings: 0,
        drawn: 0
    };
    try {
        const wonResults = await dbPool.query("SELECT COUNT(id) from track_records WHERE player = $1 AND result = 'won'", [player.id]);
        if (wonResults.rows.length > 0) {
            stats.winnings = wonResults.rows[0].count;
        }
        const lostResults = await dbPool.query("SELECT COUNT(id) from track_records WHERE player = $1 AND result = 'lost'", [player.id]);
        if (lostResults.rows.length > 0) {
            stats.losses = lostResults.rows[0].count;
        }
        const drawResults = await dbPool.query("SELECT COUNT(id) from track_records WHERE player = $1 AND result = 'draw'", [player.id]);
        if (drawResults.rows.length > 0) {
            stats.drawn = drawResults.rows[0].count;
        }
        return stats;
    } catch (err) {
        console.warn('Could not determine player track record stats.', err);
    }
}

const computePlayerRanking = async (player) => {
    try {
        const queryResults = await dbPool.query(`SELECT COUNT(id) FROM players WHERE name != 'Chocnonymous' AND score > ${player.score}`);
        return Number(queryResults.rows[0].count) + 1;
    } catch (err) {
        console.warn('Could not determine player track record stats.', err);
    }
}

const getListOfTrackRecordIds = async (userId) => {
    let existingTrackRecordIds = [];
    try {
        const queryResult = await dbPool.query("SELECT id FROM track_records WHERE player = $1", [userId]);
        if (queryResult.rows.count > 0) {
            queryResult.rows.forEach(row => {
                existingTrackRecordIds.push(row.id);
            });
        }
    } catch (err) {
        console.warn('Could not retrieve list of already existing track records for ' + userId);
        console.warn(err);
    }
    return existingTrackRecordIds;
}

const trackRecordObjectFromRecord = async (playerRecord) => {
    let trackRecord = [];
    try {
        const results = await dbPool.query("SELECT * from track_records WHERE player = $1", [playerRecord.id]);
        results.rows.forEach(trackRecordRow => {
            let gameStats = {};
            gameStats.attacks = trackRecordRow.entities_destroyed;
            gameStats.builtEntities = trackRecordRow.entities_built;
            gameStats.espionages = trackRecordRow.entities_revealed;
            gameStats.moltenFields = trackRecordRow.entities_molten;
            gameStats.lost = trackRecordRow.result === 'lost';
            gameStats.won = trackRecordRow.result === 'won';
            gameStats.winners = [];
            if (trackRecordRow.result !== 'open' && typeof trackRecordRow.winner !== 'undefined') {
                const winnerType = (trackRecordRow.winner_type === 'npc') ? 'PlayerType.AUGUSTUS_GLOOP' : 'PlayerType.HUMAN';
                gameStats.winners.push({ id: trackRecordRow.winner, type: winnerType });
            }
            trackRecord.push(gameStats);
        });
    } catch (err) {
        console.error('Cannot create trackRecord json from db record.', err);
    }
    return trackRecord;
}

const createPlayerStatsObject = async (playerRecord, withId = false, withTrackRecord = false) => {
    try {
        let player = {};

        if (withId === true) {
            player.id = playerRecord.id;
        }
        if (withTrackRecord === true) {
            player.trackRecord = await trackRecordObjectFromRecord(playerRecord);
        }
        const trackStats = await computeTrackRecordStats(playerRecord);
        player.losses = trackStats.losses;
        player.winnings = trackStats.winnings;
        player.drawn = trackStats.drawn;
        player.username = playerRecord.name;
        player.coins = playerRecord.coins;
        player.score = playerRecord.score;
        player.level = playerRecord.level;
        player.tutorialStarted = playerRecord.tutorial_started;
        player.tutorialSkipped = playerRecord.tutorial_skipped;
        player.tutorialFinished = playerRecord.tutorial_finished;
        return player;
    } catch (err) {
        console.error('Could not create player stats object from given user id.', err);
        return undefined;
    }
}

const playerFromDBRow = async (row) => {
    let player = {};
    player.level = computePlayerLevel(row);
    const trackStats = await computeTrackRecordStats(row);
    player.losses = trackStats.losses;
    player.winnings = trackStats.winnings;
    player.drawn = trackStats.drawn;
    player.name = row.name;
    player.score = row.score;
    player.trackRecord = undefined;
    player.coins = undefined;
    player.ranking = await computePlayerRanking(row);
    return player;
}

const playersFromQuery = async (rows) => {
    let players = [];
    await Promise.all(rows.map(async (row) => {
        players.push(await playerFromDBRow(row));
    }));
    return players;
}

app.get('/user/friends', async (req, res) => {
    try {
        const queryStatement = 'SELECT * from players INNER JOIN (SELECT friend FROM friends WHERE player = $1) fr ON fr.friend = players.id';
        const queryResult = await dbPool.query(queryStatement, [req.user.uid]);
        if (queryResult.rows.length > 0) {
            res.json(await playersFromQuery(queryResult.rows));
        } else {
            res.json([]);
        }
    } catch (err) {
        console.warn('Could not retrieve friends list.', err);
        res.status(500).json({ error: 'COULD NOT RETRIEVE FRIENDS LIST' });
    }
});

app.post('/user/friend', async (req, res) => {
    try {
        const queryResults = await dbPool.query("SELECT id from players WHERE name = $1", [req.body.friend]);
        if (queryResults.rows.length === 1) {
            const insertStatement = 'INSERT INTO friends(player, friend) VALUES ($1, $2)';
            await dbPool.query(insertStatement, [req.user.uid, queryResults.rows[0].id]);
            res.status(200).end();
        } else {
            console.error('PLAYERNAME "' + req.body.friend + '" DOES NOT EXIST');
            res.status(404).json({ error: 'PLAYERNAME "' + req.body.friend + '" DOES NOT EXIST' });
        }
    } catch (err) {
        console.warn('Could not insert player to friendslist.', err);
        res.status(500).json({ error: err });
    }
});

app.delete('/user/friend', async (req, res) => {
    try {
        const queryResults = await dbPool.query("SELECT id from players WHERE name = $1", [req.body.friend]);
        if (queryResults.rows.length === 1) {
            await dbPool.query("DELETE FROM friends WHERE player = $1 AND friend = $2", [req.user.uid, queryResults.rows[0].id]);
            res.status(200).end();
        } else {
            console.error('PLAYERNAME "' + req.body.friend + '" DOES NOT EXIST');
            res.status(404).json({ error: 'PLAYERNAME "' + req.body.friend + '" DOES NOT EXIST' });
        }
    } catch (err) {
        console.warn('Could not remove player from friendslist.', err);
        res.status(500).json({ error: err });
    }
});

app.get('/query/user/:name', async (req, res) => {
    try {
        const nameSanitized = '%' + req.params.name.toLocaleLowerCase() + '%';
        const queryStatement = "SELECT * FROM players WHERE LOWER(name) LIKE $1 LIMIT 10";
        const queryResult = await dbPool.query(queryStatement, [nameSanitized]);
        if (queryResult.rows.length > 0) {
            res.json(await playersFromQuery(queryResult.rows));
        } else {
            res.json([]);
        }
    } catch (err) {
        console.warn('Could not search for player', err);
        res.status(500).json({ error: 'COULD NOT SEARCH FOR PLAYERS WITH CERTAIN NAME' });
    }
});

const addEventQueue = async eventQueue => {
    if (process.env.NODE_ENV !== 'test') {
        return await db.collection('multiplayerEventQueues').add(eventQueue);
    } else {
        const id = uuidv4();
        await dbPool.query('INSERT INTO multiplayerEventQueues(id, sessionEventQueue) VALUES ($1, $2)', [id, eventQueue]);
        return { id: id };
    }
}

app.post('/user/tutorial/started', async (req, res) => {
    try {
        const queryResult = await dbPool.query('SELECT id FROM players WHERE id = $1', [req.user.uid]);
        if (queryResult.rows.length === 1) {
            const updateQueryResult = await dbPool.query('UPDATE players SET tutorial_started = $1, tutorial_skipped = $2 WHERE id = $3 RETURNING *', [true, false, req.user.uid]);
            if (updateQueryResult.rows.length === 1) {
                res.status(200).json({ stats: await createPlayerStatsObject(updateQueryResult.rows[0], true, true) });
            } else {
                res.status(500).json({ error: 'COULD NOT UPDATE PLAYER TUTORIAL STARTED STATUS' });
            }
        } else {
            res.status(404).json({ error: 'PLAYER WITH UID "' + req.user.uid + '" DOES NOT EXIST' });
        }
    } catch (err) {
        console.warn('Could not update tutorial started state of player.', err);
        res.status(500).json({ error: err });
    }
});

app.post('/user/tutorial/skipped', async (req, res) => {
    try {
        const queryResult = await dbPool.query('SELECT id FROM players WHERE id = $1', [req.user.uid]);
        if (queryResult.rows.length === 1) {
            const updateQueryResult = await dbPool.query('UPDATE players SET tutorial_started = $1, tutorial_skipped = $2 WHERE id = $3 RETURNING *', [false, true, req.user.uid]);
            if (updateQueryResult.rows.length === 1) {
                res.status(200).json({ stats: await createPlayerStatsObject(updateQueryResult.rows[0], true, true) });
            } else {
                res.status(500).json({ error: 'COULD NOT UPDATE PLAYER TUTORIAL SKIPPED STATUS' });
            }
        } else {
            res.status(404).json({ error: 'PLAYER WITH UID "' + req.user.uid + '" DOES NOT EXIST' });
        }
    } catch (err) {
        console.warn('Could not update tutorial skipped state of player.', err);
        res.status(500).json({ error: err });
    }
});

app.post('/user/tutorial/finished', async (req, res) => {
    try {
        const queryResult = await dbPool.query('SELECT id, tutorial_finished, coins, score FROM players WHERE id = $1', [req.user.uid]);
        if (queryResult.rows.length === 1) {
            const coins = queryResult.rows[0].coins + ((queryResult.rows[0].tutorial_finished === true) ? 0 : 100);
            const score = queryResult.rows[0].score + ((queryResult.rows[0].tutorial_finished === true) ? 0 : 100);
            const updateQueryResult = await dbPool.query('UPDATE players SET tutorial_started = $1, tutorial_finished = $2, tutorial_skipped = $3, coins = $4, score = $5 WHERE id = $6 RETURNING *', [true, true, false, coins, score, req.user.uid]);
            if (updateQueryResult.rows.length === 1) {
                res.status(200).json({ stats: await createPlayerStatsObject(updateQueryResult.rows[0], true, true) });
            } else {
                res.status(500).json({ error: 'COULD NOT UPDATE PLAYER TUTORIAL FINISHED STATUS' });
            }
            res.status(200).end();
        } else {
            res.status(404).json({ error: 'PLAYER WITH UID "' + req.user.uid + '" DOES NOT EXIST' });
        }
    } catch (err) {
        console.warn('Could not update tutorial finished state of player.', err);
        res.status(500).json({ error: err });
    }
});

app.post('/user/notify', async (req, res) => {
    try {
        const session = await getSessionData(req.body.sessionId);
        if (typeof session != 'undefined') {
            const currentDateTime = (new Date()).getTime();
            const lastNotifiedTime = (typeof session.last_notification === 'undefined' || session.last_notification === null) ? 0 : session.last_notification.getTime();
            if ((currentDateTime - lastNotifiedTime) > 1000 * 60 * 60 * 4) {
                if (session.game.players[session.game.currentPlayerIndex].id !== req.user.uid) {
                    updateLastNotification(req.body.sessionId, new Date());
                    const playerName = (await getPlayerFromId(req.user.uid)).rows[0].name;

                    const receiverResult = await getPlayerFromName(session.game.players[session.game.currentPlayerIndex].name);
                    if (receiverResult.rows.length === 0) {
                        console.error("Could not emit notification");
                        return res.status(404).json({ error: 'NOTIFICATION RECEIVER "' + session.game.players[session.game.currentPlayerIndex].name + '" DOES NOT EXIST' });
                    }
                    let language = receiverResult.rows[0].language;
                    if (typeof language === 'undefined' || !t.isValidLanguage(language)) {
                        language = t.getDefaultLanguage();
                    }

                    await emitPlayerNotification(session.game.players[session.game.currentPlayerIndex].id,
                        req.body.sessionId,
                        playerName + t.t[language].NOTIFICATION_REMEMBER_TURN_TITLE,
                        t.t[language].NOTIFICATION_REMEMBER_TURN_BODY,
                        NotificationReasonType.REMEMBER_TURN,
                        'https://battlechoc.com/session/' + req.body.sessionId);
                    const sessions = await getAllActiveMultiplayerSessionsForPlayer(req.user.uid);
                    res.json({ sessions: sessions });
                } else {
                    console.warn("Cannot notify yourself.");
                    res.status(400).json({ error: "CANNOT NOTIFY YOURSELF" });
                }
            }
        } else {
            console.error("Trying to notify player in non existing multiplayer session. " + req.body.sessionId);
            res.status(404).json({ error: "CANNOT SOMEONE WITHIN A NON EXISTING MULTIPLAYER SESSION" });
        }
    } catch (err) {
        console.error("Could not notify player in session. " + JSON.stringify(err));
        res.status(500).json({ error: "COULD NOT NOTIFY PLAYER IN SESSION" });
    }
});

app.post('/user/challenge', async (req, res) => {
    const opponentResult = await getPlayerFromName(req.body.opponent);
    if (opponentResult.rows.length === 0) {
        res.status(404).json({ error: 'OPPONENT "' + req.body.opponent + '" DOES NOT EXIST' });
    } else {
        const opponent = await createPlayerStatsObject(opponentResult.rows[0], true);
        if (opponent.score < 1000) {
            console.error("Challenged player\'s score is too low to be challenged. " + opponent.score);
            res.status(400).json({ error: 'CHALLENGED OPPONENT HAS A SCORE THAT IS TOO LOW. ' + opponent.score });
        } else {
            let language = opponentResult.rows[0].language;
            if (typeof language === 'undefined' || !t.isValidLanguage(language)) {
                language = t.getDefaultLanguage();
            }
            if (opponent.id === req.user.uid) {
                res.status(400).json({ error: 'CANNOT CREATE A GAME CHALLENGING YOURSELF' });
            } else {
                const playerResult = await getPlayerFromId(req.user.uid);
                if (playerResult.rows.length === 0) {
                    res.status(404).json({ error: 'PLAYER NOT FOUND' });
                } else {
                    const player = await createPlayerStatsObject(playerResult.rows[0], true);
                    const coinToss = Math.round(Math.random());

                    let opponentLevel = opponent.level;
                    if (typeof opponentLevel === 'undefined') {
                        opponentLevel = EmptyPlayerStats.level;
                    }

                    let playerLevel = player.level;
                    if (typeof playerLevel === 'undefined') {
                        playerLevel = EmptyPlayerStats.level;
                    }

                    const sessionEventQueue = {
                        player_0_events: [],
                        player_1_events: [],
                        playerIds: [opponent.id, req.user.uid],
                        lastProcessedEvent: [0, 0]
                    };

                    try {
                        const databaseSession = await addEventQueue(sessionEventQueue);
                        const initialGameState = {
                            players: [createPlayer(req.body.opponent, 'PlayerType.HUMAN', opponentLevel, sessionEventQueue.playerIds[0]), createPlayer(player.username, 'PlayerType.HUMAN', playerLevel, sessionEventQueue.playerIds[1])],
                            currentPlayerIndex: coinToss,
                            state: 'GameStateTypes.CHOOSE_FIELD_OR_START',
                            isRunning: true,
                            winners: [],
                            board: Board.generate({ rows: 10, cols: 10 }, Math.round(Math.random() * Math.pow(10, 8)))
                        };
                        await dbPool.query('INSERT INTO multiplayer_sessions(id, player1, player2, gamestate, created, last_updated, turns) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
                            databaseSession.id, sessionEventQueue.playerIds[0], sessionEventQueue.playerIds[1], initialGameState, new Date(), new Date(), 0]);

                        await emitPlayerNotification(opponent.id,
                            databaseSession.id,
                            player.username + t.t[language].NOTIFICATION_CHALLENGE_TITLE,
                            t.t[language].NOTIFICATION_CHALLENGE_BODY,
                            NotificationReasonType.CHALLENGED,
                            'https://battlechoc.com/session/' + databaseSession.id);

                        res.json({ sessionId: databaseSession.id });
                    } catch (error) {
                        console.log(error.toString())
                        res.status(500).json({ error: error.toString() });
                    }
                }
            }
        }
    }
});

const updateTrackRecord = async (session, endGameAction) => {
    const winner = session.game.players.find(player => player.id === endGameAction.payload.winners[0].id);
    console.log("updating on endgame, winner: " + JSON.stringify(winner));
    addTrackRecord(winner.id, winner.statistics);

    const looser = session.game.players.find(player => player.id !== endGameAction.payload.winners[0].id);
    console.log("updating on endgame, looser: " + JSON.stringify(looser));
    addTrackRecord(looser.id, looser.statistics);
}

const emitEndGameNotification = async (session, endGameAction) => {
    const winner = session.game.players.find(player => player.id === endGameAction.payload.winners[0].id);
    const looser = session.game.players.find(player => player.id !== endGameAction.payload.winners[0].id);
    const receiverResult = await getPlayerFromName(looser.name);
    if (receiverResult.rows.length === 0) {
        console.error("Could not emit notification");
        return res.status(404).json({ error: 'NOTIFICATION RECEIVER "' + looser.name + '" DOES NOT EXIST' });
    }
    let language = receiverResult.rows[0].language;
    if (typeof language === 'undefined' || !t.isValidLanguage(language)) {
        language = t.getDefaultLanguage();
    }

    await emitPlayerNotification(looser.id,
        session.id,
        playerName + t.t[language].NOTIFICATION_GAME_LOST_TITLE,
        t.t[language].NOTIFICATION_GAME_LOST_BODY + winner.name,
        NotificationReasonType.GAME_LOST,
        'https://battlechoc.com/');
}

const processEvents = (session, events, eventQueue) => {
    let unprocessedEvents = 0;
    let processedEvents = 0;
    let faildValidityChecks = 0;
    console.log("Processing events " + JSON.stringify(eventQueue));
    console.log("events.length = " + events.length + " queue length = " + (eventQueue.lastProcessedEvent[0] + eventQueue.lastProcessedEvent[1]));
    if (events.length > (eventQueue.lastProcessedEvent[0] + eventQueue.lastProcessedEvent[1])) {
        events.filter(event => !event.hasOwnProperty('processed')).forEach(event => {
            if (event.payload.issuer === session.game.players[0].id) {
                if (session.game.currentPlayerIndex === 0 || event.type === GameActionTypes.endGame) {
                    if (eventQueue.lastProcessedEvent[0] === event.index) {
                        const validityCheckResult = Rules.isActionValid(session.game, event);
                        if (validityCheckResult === true) {
                            console.log("Event valid: " + JSON.stringify(event));
                            updateLastAction(session.id, new Date());
                            Reducer.updateState(session, event);
                            eventQueue.lastProcessedEvent[0] += 1;
                            processedEvents += 1;
                            event.processed = true;
                        } else {
                            console.warn('Validity check failed for ' + JSON.stringify(event));
                            console.error(JSON.stringify(validityCheckResult));
                            if (!event.hasOwnProperty('invalid')) {
                                eventQueue.lastProcessedEvent[0] += 1;
                                event.invalid = true;
                            }
                            faildValidityChecks += 1;
                        }
                    } else {
                        unprocessedEvents += 1;
                    }
                } else {
                    unprocessedEvents += 1;
                }
            } else {
                if (session.game.currentPlayerIndex === 1 || event.type === GameActionTypes.endGame) {
                    if (eventQueue.lastProcessedEvent[1] === event.index) {
                        const validityCheckResult = Rules.isActionValid(session.game, event);
                        if (validityCheckResult === true) {
                            console.log("Event valid: " + JSON.stringify(event));
                            updateLastAction(session.id, new Date());
                            Reducer.updateState(session, event);
                            eventQueue.lastProcessedEvent[1] += 1;
                            processedEvents += 1;
                            event.processed = true;
                        } else {
                            console.error('Validity check failed for ' + JSON.stringify(event));
                            console.error(JSON.stringify(validityCheckResult));
                            if (!event.hasOwnProperty('invalid')) {
                                eventQueue.lastProcessedEvent[1] += 1;
                                event.invalid = true;
                            }
                            faildValidityChecks += 1;
                        }
                    } else {
                        unprocessedEvents += 1;
                    }
                } else {
                    unprocessedEvents += 1;
                }
            }
        });
    }

    return {
        'unprocessedEvents': unprocessedEvents,
        'processedEvents': processedEvents,
        'faildValidityChecks': faildValidityChecks
    }
}

const processEventsInOrder = (session, eventQueue) => {
    let events = eventQueue.player_0_events;
    events = events.concat(eventQueue.player_1_events);
    events.sort((a, b) => {
        if (typeof a.emitted === 'undefined') {
            return -1;
        } else if (typeof b.emitted === 'undefined') {
            return 1;
        } else {
            if (a.emitted.seconds > b.emitted.seconds) {
                return 1;
            } else if (a.emitted.seconds < b.emitted.seconds) {
                return -1;
            } else {
                return (a.emitted.nanoseconds > b.emitted.nanoseconds) ? 1 : -1
            }
        }
    });

    const timeout = new Date().getTime() + 10000;

    var { unprocessedEvents, processedEvents, faildValidityChecks } = processEvents(session, events, eventQueue);
    console.log(unprocessedEvents, processedEvents, faildValidityChecks)
    if (faildValidityChecks > 0) {
        console.error('SOME EVENTS DID NOT PASS THE VALIDITY CHECK');
    }

    while (unprocessedEvents > 0 && processedEvents > 0 && (new Date().getTime()) > timeout) {
        ({ unprocessedEvents, processedEvents, faildValidityChecks } = processEvents(session, events, eventQueue));
        console.log(unprocessedEvents, processedEvents, faildValidityChecks);
        if (faildValidityChecks > 0) {
            console.error('SOME EVENTS DID NOT PASS THE VALIDITY CHECK');
        }
    }

    if (new Date().getTime() > timeout) {
        console.error('Event loop hang up ' + JSON.stringify(eventQueue));
        return { error: 'INCORRECT EVENTS LOOP HANG UP' }
    } else {
        return { done: 'PROCESSED EVENTS' }
    }
}

const updateLastChanged = async (date, sessionId) => {
    await dbPool.query('UPDATE multiplayer_sessions SET last_updated = $1 WHERE id = $2', [date, sessionId]);
}

const getSessionData = async (sessionId) => {
    try {
        const sessionQueryResult = await dbPool.query("SELECT * from multiplayer_sessions WHERE id = $1", [sessionId]);
        if (sessionQueryResult.rows.length > 0) {
            let session = {
                id: sessionQueryResult.rows[0].id,
                game: sessionQueryResult.rows[0].gamestate,
                created: sessionQueryResult.rows[0].created,
                last_changed: sessionQueryResult.rows[0].last_updated,
                last_action: sessionQueryResult.rows[0].last_action,
                last_notification: sessionQueryResult.rows[0].last_notification,
                players: [sessionQueryResult.rows[0].player1, sessionQueryResult.rows[0].player2],
                turns: sessionQueryResult.rows[0].turns
            };
            return session;
        } else {
            console.warn("Trying to fetch data for non existing session with id " + sessionId);
            return undefined;
        }
    } catch (err) {
        console.error("Could not fetch session from database.", err);
        return undefined;
    }
}

const updateLastNotification = async (id, notificationTimestamp) => {
    try {
        await dbPool.query("UPDATE multiplayer_sessions SET last_notification = $1 WHERE id = $2",
            [notificationTimestamp, id]);
    } catch (err) {
        console.error(err);
    }
}

const updateLastAction = async (id, actionProcessedTimestamp) => {
    try {
        await dbPool.query("UPDATE multiplayer_sessions SET last_action = $1 WHERE id = $2",
            [actionProcessedTimestamp, id]);
    } catch (err) {
        console.error(err);
    }
}

const updateSessionGameState = async (id, gameState, turns, lastChanged) => {
    try {
        await dbPool.query("UPDATE multiplayer_sessions SET gamestate = $1, last_updated = $2, turns = $3 WHERE id = $4",
            [gameState, lastChanged, turns, id]);
    } catch (err) {
        console.error(err);
    }
}

app.get('/multiplayer/session/:id', async (req, res) => {
    try {
        const session = await getSessionData(req.params.id);
        if (typeof session === 'undefined') {
            res.status(404).json({ error: 'REQUESTED SESSION DOES NOT EXIST' });
        } else {
            res.json(session);
        }
    } catch (err) {
        console.error('Could not retrieve session data.', err);
        res.status(500).json({ error: 'COULD NOT RETRIEVE SESSION DATA.' });
    }
});

const getEventQueue = async eventQueueId => {
    if (process.env.NODE_ENV !== 'test') {
        return await db.collection('multiplayerEventQueues').doc(eventQueueId).get();
    } else {
        const eventQueue = await dbPool.query('SELECT sessionEventQueue FROM multiplayerEventQueues WHERE id=$1', [eventQueueId]);
        return {
            exists: true,
            data: () => eventQueue.rows[0].sessioneventqueue
        }
    }
}

const enqueueEvent = async (sessionId, event, playerIndex) => {
    if (process.env.NODE_ENV !== 'test') {
        if (playerIndex === 0) {
            await db.collection('multiplayerEventQueues').doc(sessionId).update({
                player_0_events: admin.firestore.FieldValue.arrayUnion(event)
            });
        } else {
            await db.collection('multiplayerEventQueues').doc(sessionId).update({
                player_1_events: admin.firestore.FieldValue.arrayUnion(event)
            });
        }
    } else {
        const eventQueueQueryResult = await dbPool.query('SELECT sessionEventQueue FROM multiplayerEventQueues WHERE id=$1', [sessionId]);
        let eventQueue = eventQueueQueryResult.rows[0].sessioneventqueue;
        if (playerIndex === 0) {
            eventQueue.player_0_events.push(event);
        } else {
            eventQueue.player_1_events.push(event);
        }
        await dbPool.query('UPDATE multiplayerEventQueues SET sessionEventQueue=$1 WHERE id=$2', [eventQueue, sessionId]);
    }
}

const updateEventQueue = async (eventQueue, eventQueueId) => {
    if (process.env.NODE_ENV !== 'test') {
        await db.collection('multiplayerEventQueues').doc(eventQueueId).update({
            lastProcessedEvent: eventQueue.lastProcessedEvent
        });
    } else {
        await dbPool.query('UPDATE multiplayerEventQueues SET sessionEventQueue=$1 WHERE id=$2', [eventQueue, eventQueueId]);
    }
}

app.post('/multiplayer/relay/action', async (req, res) => {
    console.log("Called relay event for session " + req.body.sessionId);
    console.log(JSON.stringify(req.body.event));
    let eventQueueDoc = await getEventQueue(req.body.sessionId);
    if (!eventQueueDoc.exists) {
        console.error("Invalid session id given to relay action. " + req.body.sessionId);
        res.status(404).json({ error: 'EVENT QUEUE FOR SESSION NOT FOUND' });
    } else {
        let eventQueue = eventQueueDoc.data();
        if (!eventQueue.playerIds.some(id => id === req.user.uid)) {
            console.error("A player is trying to relay an action but is not listed as one of the valid players of that session. " + req.body.sessionId + " " + req.user.uid);
            return res.status(401).end();
        }

        const playerIndex = eventQueue.playerIds.findIndex(id => id === req.body.event.payload.issuer);
        if (playerIndex >= 0) {
            try {
                console.log(req.body.sessionId + ": Trying to schedule event for execution.");
                await enqueueEvent(req.body.sessionId, req.body.event, playerIndex);
                await updateLastChanged(new Date(), req.body.sessionId);
                console.log("Event scheduled for execution.");
            } catch (error) {
                console.error(`Failed to push event ${req.body.event.toString()} to the event list of player ${playerIndex} due to ${error}`);
                return res.status(500).json({ 'error': error.toString() });
            }
        } else {
            console.error("Unknown action issuer: " + req.body.event.payload.issuer);
            res.status(400).json({ error: 'UNKNOWN ISSUER' });
        }

        try {
            eventQueueDoc = await getEventQueue(req.body.sessionId);
        } catch (error) {
            return res.status(500).json({ 'error': error });
        }

        eventQueue = eventQueueDoc.data();
        let session = await getSessionData(req.body.sessionId);
        let playerId = session.game.currentPlayerIndex;
        console.log(req.body.sessionId + ": Trying to process events.");
        let result = processEventsInOrder(session, eventQueue);
        if (result.hasOwnProperty('error')) {
            console.error("Error while trying to process event");
            res.status(400).json(result);
        } else {
            try {
                const turns = (typeof eventQueue.player_0_events !== 'undefined') ? eventQueue.player_0_events.filter(event => event.type === 'battlechoc/gameplay/finishTurn').length : 0;
                console.log("Finished turns of player 0: " + turns);
                console.log("Persisting sessions game state: " + JSON.stringify(session));
                await updateSessionGameState(session.id, session.game, turns, new Date());
                await updateEventQueue(eventQueue, req.body.sessionId);
                let updatedPlayerId = session.game.currentPlayerIndex;
                if (playerId !== updatedPlayerId) {
                    const receiverResult = await getPlayerFromName(session.game.players[1 - playerId].name);
                    if (receiverResult.rows.length === 0) {
                        console.error("Could not emit notification");
                        return res.status(404).json({ error: 'NOTIFICATION RECEIVER "' + session.game.players[1 - playerId].name + '" DOES NOT EXIST' });
                    }

                    let language = receiverResult.rows[0].language;
                    if (typeof language === 'undefined' || !t.isValidLanguage(language)) {
                        language = t.getDefaultLanguage();
                    }

                    await emitPlayerNotification(session.game.players[1 - playerId].id,
                        req.body.sessionId,
                        session.game.players[playerId].name + t.t[language].NOTIFICATION_TURN_FINISHED_TITLE,
                        t.t[language].NOTIFICATION_TURN_FINISHED_BODY,
                        NotificationReasonType.OPPONENT_FINISHED_TURN,
                        'https://battlechoc.com/session/' + req.body.sessionId);
                }
                res.status(200).end();
            } catch (error) {
                console.log("not able to finish event processing: ", error);
                res.status(500).json({ 'error': error.toString() });
            }
        }
    }
});

const emitPlayerNotification = async (receiverId, sessionId, title, body, reason, clickAction) => {
    const permissions = await getPlayerMessagingPermissionTokens(receiverId);
    const expiredTokens = [];

    await Promise.all(permissions.map(async (permission) => {
        const payload = {
            to: permission.token,
            data: {
                title: title,
                text: body,
                session: sessionId,
                reason: reason,
                click_action: clickAction
            }
        };

        console.log("emitting notification to " + permission.token);

        try {
            const response = await axios.post('https://fcm.googleapis.com/fcm/send', payload, { headers: { 'Authorization': 'key=***REMOVED***' } })
            if (response.data.failure === 1 && typeof response.data.results !== 'undefined' && response.data.results.length > 0 && response.data.results[0].error === 'NotRegistered') {
                console.log('Cleanup expired user registration token ' + permission.token);
                expiredTokens.push(permission.token);
            } else {
                console.log('Successfully sent notification');
                console.log(`Token ${permission.token} is still valid`);
            }
        } catch (error) {
            console.warn('PLAYER NOTIFICATION FAILED' + error.toString());
        }
    }));

    if (expiredTokens.length === 0) {
        console.log('No token update needed. All tokens are still valid')
    } else {
        console.log('Updating user tokens because some of them were invalid. Deleted tokens: ' + expiredTokens.toString());
        await Promise.all(expiredTokens.map(async (expiredToken) => {
            await dbPool.query("DELETE FROM permissions WHERE token = $1 AND player = $2", [expiredToken, receiverId]);
        }));
    }
}

const surrenderGame = async (sessionId, playerId) => {
    try {
        var eventQueueDoc = await getEventQueue(sessionId);
    } catch (error) {
        console.error("Could not get multiplayer event queue for session " + sessionId);
        return false;
    }

    if (!eventQueueDoc.exists) {
        console.error("Event queue for does not exist for session " + sessionId);
        return false;
    } else {
        let eventQueue = eventQueueDoc.data();
        if (!eventQueue.playerIds.some(id => id === playerId)) {
            console.error("Surrender game not allowed for " + playerId);
            return false;
        }

        let playerIndex = eventQueue.playerIds.findIndex(id => id === playerId);
        let event = {
            index: (playerIndex === 0) ? eventQueue.player_0_events.length : eventQueue.player_1_events.length,
            type: 'battlechoc/gameplay/endGame',
            payload: {
                winners: eventQueue.playerIds.filter(id => id !== playerId),
                issuer: playerId
            },
            sessionId: sessionId
        }

        try {
            await enqueueEvent(sessionId, event, playerIndex);
            eventQueue.lastProcessedEvent[playerIndex] += 1;
        } catch (error) {
            console.warn('Failed to push event ' + event.toString() + ' to the event list of player ' + playerIndex);
            return false;
        }

        let session = await getSessionData(sessionId);
        if (typeof session === 'undefined') {
            console.error("Could not find session in database " + sessionId);
            return false;
        }
        session.game.isRunning = false;
        session.game.winners = event.payload.winners;
        session.game.players.filter(player => player.id !== playerId)[0].statistics.won = true;
        session.game.players.filter(player => player.id !== playerId)[0].statistics.lost = false;
        session.game.players.filter(player => player.id === playerId)[0].statistics.won = false;
        session.game.players.filter(player => player.id === playerId)[0].statistics.lost = true;
        updateTrackRecord(session.game, event);

        try {
            const turns = (typeof eventQueue.player_0_events !== 'undefined') ? eventQueue.player_0_events.filter(event => event.type === 'battlechoc/gameplay/finishTurn').length : 0;
            await updateSessionGameState(session.id, session.game, turns, new Date());
            await updateEventQueue(eventQueue, sessionId);
            const looserId = playerId;
            const winnerId = eventQueue.playerIds.filter(id => id !== playerId)[0];
            let looserName = '';
            const looserQueryResult = await dbPool.query("SELECT name FROM players WHERE id = $1", [looserId]);
            if (looserQueryResult.rows.length > 0) {
                looserName = looserQueryResult.rows[0].name;
            }
            let winnerName = '';
            const winnerQueryResult = await dbPool.query("SELECT name FROM players WHERE id = $1", [winnerId]);
            if (winnerQueryResult.rows.length > 0) {
                winnerName = winnerQueryResult.rows[0].name;
            }
            return {
                winner: {
                    id: winnerId, name: winnerName
                },
                looser: {
                    id: looserId, name: looserName
                }
            };
        } catch (err) {
            console.error("Could not update session state " + sessionId);
            return false;
        }
    }
}

app.post('/surrender', async (req, res) => {
    const result = await surrenderGame(req.body.sessionId, req.user.uid);
    if (result !== false) {
        const receiverResult = await getPlayerFromName(result.winner.name);
        if (receiverResult.rows.length === 0) {
            console.error("Could not emit notification");
            return res.status(404).json({ error: 'NOTIFICATION RECEIVER "' + result.winner.name + '" DOES NOT EXIST' });
        }

        let language = receiverResult.rows[0].language;
        if (typeof language === 'undefined' || !t.isValidLanguage(language)) {
            language = t.getDefaultLanguage();
        }

        await emitPlayerNotification(result.winner.id,
            req.body.sessionId,
            result.looser.name + t.t[language].NOTIFICATION_OPPONENT_SURENDERED_TITLE,
            t.t[language].NOTIFICATION_OPPONENT_SURENDERED_BODY,
            NotificationReasonType.OPPONENT_SURRENDERED_GAME,
            'https://battlechoc.com/');
        res.status(200).end();
    } else {
        return res.status(500).json({ 'error': 'COULD NOT SURRENDER GAME' });
    }
});

const getAllActiveMultiplayerSessionsForPlayer = async (playerId) => {
    const sessions = [];
    const sessionQueryResult = await dbPool.query("SELECT * FROM multiplayer_sessions where (player1=$1 OR player2=$1) AND gamestate->>'isRunning' = 'true'", [playerId]);
    await Promise.all(sessionQueryResult.rows.map(async (row) => {
        const playerIndex = (row.gamestate.players[0].id === playerId) ? 0 : 1;
        let session = {
            'id': row.id,
            'players': [row.player1, row.player2],
            'last_changed': row.last_updated.getTime(),
            'last_notification': (typeof row.last_notification === 'undefined' || row.last_notification === null) ? 0 : row.last_notification.getTime(),
            'created': row.created.getTime(),
            'myTurn': row.gamestate.currentPlayerIndex === playerIndex,
            'turns': row.turns,
            'statistics': row.gamestate.players[playerIndex].statistics
        };

        const opponentId = (row.player1 === playerId) ? row.player2 : row.player1;
        const opponentQueryResult = await getPlayerFromId(opponentId);
        if (opponentQueryResult.rows.length > 0) {
            const opponent = await createPlayerStatsObject(opponentQueryResult.rows[0], true);
            const opponentRank = await computePlayerRanking(opponentQueryResult.rows[0])
            session.opponent = {
                name: opponent.username,
                ranking: opponentRank,
                level: opponent.level,
                drawn: opponent.drawn,
                losses: opponent.losses,
                winnings: opponent.winnings
            }
        } else {
            console.error("Stale multiplayer session detected. Will be disabled. Id is " + session.id);
            await dbPool.query("UPDATE multiplayer_sessions SET gamestate = gamestate || {\"isRunning\": false}' WHERE id=$1", [session.id]);
        }
        sessions.push(session);
    }));
    return sessions;
}

app.get('/multiplayer/sessions', async (req, res) => {
    try {
        const sessions = await getAllActiveMultiplayerSessionsForPlayer(req.user.uid);
        res.json({ sessions: sessions });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: error });
    }
})

const calculateCosts = (entityType, level) => {
    if (!EntityDescriptors.has(entityType)) {
        throw new Error("Invalid entity type given: " + entityType);
    } else {
        return EntityDescriptors.get(entityType)(level[entityType]).coins;
    }
}

const getMaximumLevel = (entityType, level) => {
    if (!EntityDescriptors.has(entityType)) {
        throw new Error("Invalid entity type given: " + entityType);
    } else {
        let entity = EntityDescriptors.get(entityType)(level[entityType])
        return entity.hasOwnProperty('level') ? entity.level.max - 1 : finalLevel;
    }
}

app.post('/update/level', async (req, res) => {
    try {
        const playerQueryResult = await getPlayerFromId(req.user.uid);
        if (playerQueryResult.rows.length > 0) {
            const player = playerQueryResult.rows[0];
            if (typeof player.coins !== 'undefined') {
                let level = EmptyPlayerStats.level;
                if (typeof player.level !== 'undefined') {
                    level = player.level;
                }

                if (req.body.upgrade) {
                    const limit = getMaximumLevel(req.body.entityType, level);
                    const costs = calculateCosts(req.body.entityType, level);
                    if (player.coins < costs) {
                        console.warn('Player tries to buy upgrade but cannot afford it', req.user.uid);
                        res.status(400).json({ error: 'NOT ENOUGH COINS' });
                    } else if ((level[req.body.entityType] + 1) > limit) {
                        console.warn('Player tries to buy upgrade but already reached max level', req.user.uid);
                        res.status(400).json({ error: 'LEVEL LIMIT REACHED' });
                    } else {
                        level[req.body.entityType] = level[req.body.entityType] + 1;
                        await dbPool.query(`UPDATE players SET coins = ${player.coins - costs}, level = $1 WHERE id = $2`, [level, req.user.uid]);
                        res.json({ coins: player.coins - costs, level: level });

                    }
                } else {
                    if (level[req.body.entityType] > 0) {
                        const previous = { level, [req.body.entityType]: level[req.body.entityType] - 1 };
                        const costs = calculateCosts(req.body.entityType, previous);
                        const coinBackGuarantee = Math.round(0.666 * costs);

                        level[req.body.entityType] = level[req.body.entityType] - 1;

                        await dbPool.query(`UPDATE players SET coins = ${player.coins + coinBackGuarantee}, level = $1 WHERE id = $2`, [level, req.user.uid]);
                        res.json({ coins: player.coins + coinBackGuarantee, level: level });
                    } else {
                        res.status(400).json({ error: 'ENTITY LEVEL IS ALREADY ZERO' });
                    }
                }
            } else {
                res.status(400).json({ error: 'PLAYER HAS NO COINS' });
            }
        } else {
            console.warn('trying to update level of non existing player', req.user.uid);
            return res.status(404).json({ error: 'PLAYER DOES NOT EXIST' });
        }
    } catch (err) {
        console.error("Could not update player level", err);
        res.status(500).json({ error: 'COULD NOT UPDATE PLAYER LEVEL' });
    }
});

const approximatePlayersCount = async (statement) => {
    try {
        const result = await dbPool.query("SELECT count(id) FROM players WHERE " + statement);
        if (result.rows.length > 0) {
            return result.rows[0].count;
        }
    } catch (err) {
        console.error('Could not count players.', err);
        return 0;
    }
}

app.get('/highscore', async (req, res) => {
    try {
        const queryResult = await getPlayerFromId(req.user.uid);
        const pageSize = 10;
        if (queryResult.rows.length === 1) {
            if (typeof req.query.page === 'undefined') {
                var rank = await computePlayerRanking(queryResult.rows[0]);
                var page = Math.ceil(rank / pageSize);
            } else {
                var page = Number(req.query.page);
            }

            const playersCount = await approximatePlayersCount("score > 0 AND name != 'Chocnonymous'");
            let lastPage = Math.ceil(playersCount / pageSize);
            const playersOnPageResult = await dbPool.query("SELECT * FROM players WHERE score > 0 AND name != 'Chocnonymous' ORDER BY score DESC OFFSET $1 LIMIT $2", [(page - 1) * pageSize, pageSize]);
            let highscore = await playersFromQuery(playersOnPageResult.rows);
            highscore.sort((a, b) => {
                if (a.ranking > b.ranking) {
                    return 1;
                } else if (a.ranking < b.ranking) {
                    return -1;
                } else {
                    return 0;
                }
            });
            res.json({
                page: page,
                lastPage: lastPage,
                list: highscore
            });
        } else {
            console.warn('Given player seems not to exist.', queryResult.rows.length);
            res.status(404).json({ error: 'PLAYER NOT FOUND' })
        }
    } catch (err) {
        console.warn('Could not determine rank of player', err);
        res.status(500).json({ error: err.toString() })
    }
});

app.get('/rank', async (req, res) => {
    try {
        const queryResult = await getPlayerFromId(req.user.uid);
        if (queryResult.rows.length === 1) {
            res.json({ ranking: await computePlayerRanking(queryResult.rows[0]) });
        } else {
            console.warn('Given player seems not to exist.', queryResult.rows.length);
            res.status(404).json({ error: 'PLAYER NOT FOUND' })
        }
    } catch (err) {
        console.warn('Could not determine rank of player', err);
        res.status(500).json({ error: err.toString() })
    }
});

app.get('/check/available/:username', async (req, res) => {
    if (typeof req.params.username === 'undefined' ||
        req.params.username === '') {
        res.status(400).json({ error: 'USERNAME EMPTY' });
    } else {
        try {
            const queryResult = await dbPool.query("SELECT id FROM players WHERE name = $1", [req.params.username]);
            res.json({ name: req.params.username, available: queryResult.rows.length === 0 && req.params.username.toUpperCase() !== 'CHOCNONYMOUS' })
        } catch (err) {
            console.warn('Could not check availability of player name.', err);
            res.status(500).json({ error: err.toString() })
        }
    }
});

app.get('/user/name', async (req, res) => {
    try {
        const queryResult = await dbPool.query("SELECT name FROM players WHERE id = $1", [req.user.uid]);
        if (queryResult.rows.length > 0) {
            res.json({ name: queryResult.rows[0].name });
        } else {
            res.status(404).json({ error: 'PLAYER DOES NOT EXIST' });
        }
    } catch (err) {
        console.warn('Could not look up playername', err);
        res.status(500).json({ error: "COULD NOT LOOK UP PLAYERNAME" })
    }
});

app.get('/user/:name', async (req, res) => {
    try {
        const queryResult = await dbPool.query("SELECT * FROM players WHERE name = $1", [req.params.name]);
        if (queryResult.rows.length > 0) {
            res.json(await playersFromQuery(queryResult.rows));
        } else {
            res.status(404).json({ error: 'PLAYER DOES NOT EXIST' });
        }
    } catch (err) {
        console.warn('Could not lookup player', err);
        res.status(500).json({ error: err.toString() })
    }
});

app.get('/random/opponent', async (req, res) => {
    try {
        invalidOpponentIds = [req.user.uid];
        const sessionQueryResult = await dbPool.query("SELECT * FROM multiplayer_sessions where (player1=$1 OR player2=$1) AND gamestate->>'isRunning' = 'true'", [req.user.uid]);
        await Promise.all(sessionQueryResult.rows.map(async (row) => {
            invalidOpponentIds.push((row.player1 === req.user.uid) ? row.player2 : row.player1);
        }));
        const statement = "SELECT * FROM players WHERE score > 0 AND NOT (name='') IS NOT FALSE AND NOT(id = ANY('{" + invalidOpponentIds.join() + "}'::text[]))";
        const queryResult = await dbPool.query(statement);
        if (queryResult.rows.length > 0) {
            res.json(await playerFromDBRow(queryResult.rows[Math.floor(Math.random() * queryResult.rows.length)]));
        } else {
            console.warn('Could not find a matching player for ', req.user.uid);
            res.status(404).json({ error: 'NO MATCHING PLAYER FOUND' });
        }
    } catch (err) {
        console.error("Failed to determine random opponent", err);
        res.status(500).json({ error: 'CANNONT DETERMINE RANDOM OPPONENT' });
    }
});

app.post('/user/permissions', async (req, res) => {
    try {
        const existingTokenResult = await dbPool.query("SELECT * FROM permissions WHERE player = $1 and token = $2", [req.user.uid, req.body.token]);
        if (existingTokenResult.rows.length === 0) {
            let tokenType = 'messaging';
            if (req.battlechocAndroidVersion > 0) {
                tokenType = 'android-messaging';
            }

            await dbPool.query("INSERT INTO permissions(player, token, type) VALUES ($1, $2, $3)", [req.user.uid, req.body.token, tokenType]);
            res.status(200).end();
        } else {
            res.status(400).json({ error: 'WON\'T INSERT DUPLICATE TOKEN ENTRIES' });
        }
    } catch (err) {
        console.warn('Could not add new permission token for player.', err);
        res.status(500).json({ error: 'COULD NOT ADD PERMISSION TOKEN' })
    }
});

const addTrackRecord = async (userId, record) => {
    let gameResult = 'draw';
    let winner;
    let winnerType;
    const id = (typeof record.id === 'undefined') ? uuidv4() : record.id;
    if (typeof record.winners === 'undefined' || record.winners.length === 0 || (typeof record.lost === 'undefined' && typeof record.won === 'undefined')) {
        gameResult = 'open';
    } else {
        winnerType = (record.winners[0].type === 'PlayerType.HUMAN') ? 'human' : 'npc';
        winner = record.winners[0].id;
        if (record.won === true && record.lost !== true) {
            gameResult = 'won';
        } else if (record.lost === true && record.won !== true) {
            gameResult = 'lost';
        }
    }

    try {
        const insertStatement = 'INSERT INTO track_records(id, player, winner, winner_type, result, entities_destroyed, entities_molten, entities_revealed, entities_built) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT DO NOTHING RETURNING id';
        const queryResult = await await dbPool.query(insertStatement, [id, userId, winner, winnerType, gameResult, record.attacks, record.moltenFields, record.espionages, record.builtEntities]);
        return (queryResult.rows.length > 0);
    } catch (err) {
        console.warn(err);
        return false;
    }

}

const fetchPlayerStats = async (userId) => {
    try {
        const queryResult = await getPlayerFromId(userId);
        if (queryResult.rows.length === 1) {
            return await createPlayerStatsObject(queryResult.rows[0], true, true);
        } else {
            console.error('Could not retrieve player stats.');
            return undefined;
        }
    } catch (err) {
        console.error('Could not retrieve player stats.', err);
        return undefined;
    }
}

const createOrUpdatePlayer = async (userId, player) => {
    try {
        const username = (typeof player.username === 'undefined' || player.username === '') ? EmptyPlayerStats.username : player.username;
        const coins = (typeof player.coins === 'number' && !isNaN(player.coins)) ? player.coins : 0;
        const score = (typeof player.score === 'number' && !isNaN(player.score)) ? player.score : 0;
        const language = (typeof player.language !== 'undefined' && t.isValidLanguage(player.language)) ? player.language : t.getDefaultLanguage();
        const level = typeof player.level !== 'undefined' ? player.level : EmptyPlayerStats.level;
        const tutorialStarted = typeof player.tutorialStarted !== 'undefined' ? player.tutorialStarted : false;
        const tutorialSkipped = typeof player.tutorialSkipped !== 'undefined' ? player.tutorialSkipped : false;
        const tutorialFinished = typeof player.tutorialFinished !== 'undefined' ? player.tutorialFinished : false;
        const existsCheckResult = await getPlayerFromId(userId);
        if (existsCheckResult.rows.length === 0) {
            const queryResult = await dbPool.query('INSERT INTO players(id, name, coins, score, language, level, tutorial_started, tutorial_skipped, tutorial_finished) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *', [userId, username, coins, score, language, level, tutorialStarted, tutorialSkipped, tutorialFinished]);
            if (queryResult.rows.length === 1) {
                await Promise.all(player.trackRecord.map(async (record) => {
                    await addTrackRecord(userId, record);
                }));
                return await createPlayerStatsObject(queryResult.rows[0], true, true);
            } else {
                console.error('Could not create a new player.');
                return undefined;
            }
        } else {
            const queryResult = await dbPool.query('UPDATE players SET name = $1, coins = $2, score = $3, language = $4, level = $5, tutorial_started = $6, tutorial_skipped = $7, tutorial_finished = $8 WHERE id = $9 RETURNING *', [username, coins, score, language, level, tutorialStarted, tutorialSkipped, tutorialFinished, userId]);
            if (queryResult.rows.length === 1) {
                await Promise.all(player.trackRecord.map(async (record) => {
                    await addTrackRecord(userId, record);
                }));
                return await createPlayerStatsObject(queryResult.rows[0], true, true);
            } else {
                console.error('Could not create a new player.');
                return await createPlayerStatsObject(existsCheckResult.rows[0], true, true);
            }
        }
    } catch (err) {
        console.error('Could not create a new player.', err);
        return undefined;
    }
}

const createNewPlayer = async (userId) => {
    try {
        const existsCheckResult = await getPlayerFromId(userId);
        if (existsCheckResult.rows.length === 0) {
            const coins = 0;
            const score = 0;
            const username = EmptyPlayerStats.username;
            const language = t.getDefaultLanguage();
            const level = EmptyPlayerStats.level;
            const queryResult = await dbPool.query('INSERT INTO players(id, name, coins, score, language, level, tutorial_started, tutorial_skipped, tutorial_finished) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *', [userId, username, coins, score, language, level, false, false, false]);
            if (queryResult.rows.length === 1) {
                return await createPlayerStatsObject(queryResult.rows[0]);
            } else {
                console.error('Could not create a new player.');
                return undefined;
            }
        } else {
            return await createPlayerStatsObject(existsCheckResult.rows[0], true, true);
        }
    } catch (err) {
        console.error('Could not create a new player.', err);
        return undefined;
    }
}

const updatePlayerStats = async (userId, stats) => {
    try {
        if (typeof stats !== 'undefined') {
            const coins = calculateCoinsFromTrackRecord(stats);
            const updatePlayerCoinsAndScoreResult = await dbPool.query("UPDATE players SET coins = coins + $1, score = score + $1 WHERE id = $2 RETURNING *", [coins, userId]);
            if (updatePlayerCoinsAndScoreResult.rows.length === 1) {
                return (await createPlayerStatsObject(updatePlayerCoinsAndScoreResult.rows[0], true, true));
            } else {
                console.error('Could not update player stats. Coins lost!');
                return undefined;
            }
        } else {
            return (await createPlayerStatsObject(await getPlayerFromId(userId), true, true));
        }
    } catch (err) {
        console.error('Could not update player stats. Coins lost!', err);
        return undefined;
    }
}

app.post('/user/merge', async (req, res) => {
    try {
        const existsQueryResult = await getPlayerFromId(req.user.uid);
        if (existsQueryResult.rows.length === 0) {
            const mergedData = await createOrUpdatePlayer(req.user.uid, req.body.playerInfo);
            res.status(200).json({ mergedPlayerInfo: mergedData });
        } else {
            let recordsAdded = [];
            if (typeof req.body.playerInfo.trackRecord !== 'undefined') {
                const existingTrackRecordIds = await getListOfTrackRecordIds(req.user.uid);
                await Promise.all(req.body.playerInfo.trackRecord.map(async (record) => {
                    if (typeof record.id !== 'undefined' && !existingTrackRecordIds.includes(record.id)) {
                        if ((await addTrackRecord(req.user.uid, record)) === true) {
                            recordsAdded.push(record);
                        }
                    }
                }));
            }
            const mergedData = await updatePlayerStats(req.user.uid, recordsAdded);
            res.status(200).json({ mergedPlayerInfo: mergedData });
        }
    } catch (err) {
        console.warn('Could not merge player stats.', err);
        res.status(500).json({ error: 'COULD NOT MERGE PLAYER STATS' })
    }
});

app.post('/user/trackrecords', async (req, res) => {
    try {
        if (typeof req.body.stats !== 'undefined') {
            let recordsAdded = [];
            await Promise.all(req.body.stats.map(async (record) => {
                if ((await addTrackRecord(req.user.uid, record)) === true) {
                    recordsAdded.push(record);
                }
            }));
            let playerStats = await updatePlayerStats(req.user.uid, recordsAdded);
            res.status(200).json({ stats: playerStats });
        } else {
            res.status(400).json({ error: 'INVALID REQUEST PARAMETERS' })
        }
    } catch (err) {
        console.warn('Could not add a new track records for player.', err);
        res.status(500).json({ error: 'COULD NOT ADD TRACK RECORDS' })
    }
});

app.get('/user', async (req, res) => {
    try {
        let playerStats = await fetchPlayerStats(req.user.uid);
        if (typeof playerStats !== 'undefined') {
            res.status(200).json({ stats: playerStats });
        } else {
            console.warn('Could not find stats for player ', req.user.uid);
            res.status(404).json({ error: 'PLAYER NOT FOUND' });
        }
    } catch (err) {
        console.warn('Could not retrieve player stats.', err);
        res.status(500).json({ error: 'COULD NOT FETCH PLAYER STATS' })
    }
});

app.get('/generaterandomname', async (req, res) => {
    try {
        const maxTries = 20;
        let generatedName;
        let nameFound = false;
        for (let tries = 0; tries < maxTries; tries++) {
            generatedName = uniqueNamesGenerator(randomNameGeneratorConfig);
            const queryResult = await dbPool.query("SELECT * FROM players WHERE name = $1", [generatedName]);
            if (queryResult.rows.length === 0) {
                nameFound = true;
                break;
            }
        }
        res.status(200).json({ username: (nameFound) ? generatedName : 'Chocnonymous' });
    } catch (err) {
        console.error('Could not generate a new random username.', err);
        res.status(500).json({ error: 'COULD NOT GENERATE A NEW RANDOM USERNAME' })
    }
});

app.post('/user', async (req, res) => {
    try {
        let playerStats = (typeof req.body.stats === 'undefined') ? await createNewPlayer(req.user.uid) : await createOrUpdatePlayer(req.user.uid, req.body.stats);
        res.status(200).json({ stats: playerStats });
    } catch (err) {
        console.warn('Could not create a new player.', err);
        res.status(500).json({ error: 'COULD NOT CREATE NEW PLAYER' })
    }
});

app.post('/user/username', async (req, res) => {
    try {
        const queryResult = await dbPool.query("SELECT * FROM players WHERE name = $1", [req.body.username]);
        if (queryResult.rows.length === 0) {
            let regex = /^([a-zA-Z][a-zA-Z0-9_]{2,24})$/;
            if (regex.test(req.body.username) && req.body.username.toUpperCase() !== 'CHOCNONYMOUS') {
                const existingPlayerResult = await dbPool.query("SELECT * FROM players WHERE id = $1", [req.user.uid]);
                if (existingPlayerResult.rows.length > 0) {
                    const updatePlayerNameResult = await dbPool.query("UPDATE players SET name = $1 WHERE id = $2 RETURNING id", [req.body.username, req.user.uid]);
                    if (updatePlayerNameResult.rows.length === 1) {
                        res.end();
                    } else {
                        res.status(500).json({ error: error });
                    }
                } else {
                    res.status(404).json({ error: 'PLAYER DOES NOT EXIST' });
                }
            } else {
                res.status(400).json({ error: 'USERNAME NOT VALID' });
            }
        } else {
            res.status(400).json({ error: 'PLAYER WITH GIVEN NAME DOES ALREADY EXIST' });
        }
    } catch (err) {
        console.warn('Could not create a new player with given name or update the name of an already existing player.', err);
        res.status(500).json({ error: 'COULD NOT CREATE PLAYER OR UPDATE PLAYER NAME' })
    }
});

app.post('/user/language', async (req, res) => {
    if (t.isValidLanguage(req.body.language)) {
        try {
            const queryResult = await dbPool.query('UPDATE players SET language = $1 WHERE id = $2 RETURNING id', [req.body.language, req.user.uid]);
            if (queryResult.rows.length > 0) {
                res.json({ language: req.body.language });
            } else {
                res.status(404).json({ error: 'PLAYER DOES NOT EXIST' });
            }
        } catch (err) {
            console.warn('Could not update players language.', err);
            res.status(500).json({ error: err.toString() })
        }
    } else {
        res.status(400).json({ error: 'INVALID LANGUAGE GIVEN' });
    }
});

const sessionCleanupFunction = async (context) => {
    console.log('Cleaning up stale multiplayer sessions ...');
    try {
        const sessions = [];
        const sessionQueryResult = await dbPool.query("SELECT * FROM multiplayer_sessions where last_action < NOW() - INTERVAL '1 day' AND gamestate->>'isRunning' = 'true'");
        await Promise.all(sessionQueryResult.rows.map(async (row) => {
            console.log("Trying to cleanup session: " + JSON.stringify(row));
            const looserUid = row.gamestate.players[row.gamestate.currentPlayerIndex].id;
            const result = await surrenderGame(row.id, looserUid);
            if (result !== false) {
                sessions.push({ id: row.id });

                // notify the winner
                const winnerResult = await getPlayerFromName(result.winner.name);
                if (winnerResult.rows.length === 0) {
                    console.error('NOTIFICATION RECEIVER "' + result.winner.name + '" DOES NOT EXIST');
                }

                let winnerLanguage = winnerResult.rows[0].language;
                if (typeof winnerLanguage === 'undefined' || !t.isValidLanguage(winnerLanguage)) {
                    winnerLanguage = t.getDefaultLanguage();
                }

                await emitPlayerNotification(result.winner.id,
                    row.id,
                    t.t[winnerLanguage].NOTIFICATION_SESSION_TIMEDOUT_WINNER_TITLE + result.looser.name,
                    result.looser.name + t.t[winnerLanguage].NOTIFICATION_SESSION_TIMEDOUT_WINNER_BODY,
                    NotificationReasonType.SESSION_TIMEOUT_GAME_WON,
                    'https://battlechoc.com/');

                // notify the looser
                const looserResult = await getPlayerFromName(result.looser.name);
                if (looserResult.rows.length === 0) {
                    console.error('NOTIFICATION RECEIVER "' + result.looser.name + '" DOES NOT EXIST');
                }

                let looserLanguage = looserResult.rows[0].language;
                if (typeof looserLanguage === 'undefined' || !t.isValidLanguage(looserLanguage)) {
                    looserLanguage = t.getDefaultLanguage();
                }

                await emitPlayerNotification(result.looser.id,
                    row.id,
                    t.t[looserLanguage].NOTIFICATION_SESSION_TIMEDOUT_LOOSER_TITLE + result.winner.name,
                    t.t[looserLanguage].NOTIFICATION_SESSION_TIMEDOUT_LOOSER_BODY,
                    NotificationReasonType.SESSION_TIMEOUT_GAME_LOST,
                    'https://battlechoc.com/');
            } else {
                console.error("Could not surrender session " + row.id);
            }
        }));
        console.log("Cleaned up session: " + JSON.stringify(sessions));
    } catch (error) {
        console.error(error);
    }
}

module.exports.app = app;
module.exports.dbPool = dbPool;
module.exports.sessionCleanupFunction = sessionCleanupFunction;