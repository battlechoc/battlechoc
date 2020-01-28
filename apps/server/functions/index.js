const functions = require('firebase-functions');
const express = require('express');
const cors = require('cors');
const app = express();
const bodyParser = require('body-parser');
const entities = require('./entities.js');
const admin = require('firebase-admin');
const gamestate = require('./gamestate.js');
const t = require('./translations.js');
const uuidv4 = require('uuid/v4');
const { Pool } = require('pg')
const axios = require('axios');
admin.initializeApp();
const db = admin.firestore();
let instanceCount = 0;

const dbPool = new Pool({
    host: '/cloudsql/battlechoc:europe-west2:battlechoc-prod-psql',
    user: 'battlechoc-service-account',
    password: '***REMOVED***',
    database: 'battlechoc',
    max: 1
});

const whitelist = ['https://battlechoc.dev', 'https://battlechoc.com', 'http://localhost:3000', 'https://localhost:3000', 'chrome-extension://fhbjgbiflinjbdggehcddcbncdddomop'];
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
app.use(cors(corsOptions));

app.use(async (req, res, next) => {
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
    let tokens = [];
    try {
        const tokenQueryResult = await dbPool.query("SELECT token FROM permissions WHERE player = $1 AND type = $2", [userId, 'messaging']);
        tokenQueryResult.rows.forEach(row => {
            if (typeof row.token !== 'undefined') {
                tokens.push(row.token);
            }
        });
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
    return player.level_factory +
        player.level_factory_extension +
        player.level_cacaotree +
        player.level_chocolate_fountain +
        player.level_cream +
        player.level_fruit_cannon +
        player.level_hot_chocolate_ballista +
        player.level_rum_truffle_cannon +
        player.level_spying_easter_bunny +
        player.level_xmas_factory;
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
        const queryResults = await dbPool.query("SELECT id from players WHERE score > $1", [player.score]);
        return queryResults.rows.length + 1;
    } catch (err) {
        console.warn('Could not determine player track record stats.', err);
    }
}

const playerLevelObjectFromRecord = (playerRecord) => {
    let level = {};
    level['EntityType.FACTORY'] = playerRecord.level_factory;
    level['EntityType.FACTORY_EXTENSION'] = playerRecord.level_factory_extension;
    level['EntityType.CACAOTREE'] = playerRecord.level_cacaotree;
    level['EntityType.CHOCOLATE_FOUNTAIN'] = playerRecord.level_chocolate_fountain;
    level['EntityType.CREAM'] = playerRecord.level_cream;
    level['EntityType.FRUIT_CANNON'] = playerRecord.level_fruit_cannon;
    level['EntityType.HOT_CHOCOLATE_BALLISTA'] = playerRecord.level_hot_chocolate_ballista;
    level['EntityType.RUM_TRUFFLE_CANNON'] = playerRecord.level_rum_truffle_cannon;
    level['EntityType.SPYING_EASTER_BUNNY'] = playerRecord.level_spying_easter_bunny;
    level['EntityType.XMAS_FACTORY'] = playerRecord.level_xmas_factory;
    return level;
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
        player.level = playerLevelObjectFromRecord(playerRecord);
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

app.post('/user/challenge', async (req, res) => {
    const opponentResult = await getPlayerFromName(req.body.opponent);
    if (opponentResult.rows.length === 0) {
        res.status(404).json({ error: 'OPPONENT "' + req.body.opponent + '" DOES NOT EXIST' });
    } else {
        const opponent = createPlayerStatsObject(opponentResult.rows[0], true);
        let language = opponent.language;
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
                const player = createPlayerStatsObject(playerResult.rows[0], true);
                let coinToss = Math.round(Math.random());

                let opponentLevel = opponent.level;
                if (typeof opponentLevel === 'undefined') {
                    opponentLevel = entities.EmptyPlayerStats.level;
                }

                let playerLevel = player.level;
                if (typeof playerLevel === 'undefined') {
                    playerLevel = entities.EmptyPlayerStats.level;
                }

                let session = {
                    players: [
                        opponent.id,
                        req.user.uid
                    ],
                    created: new Date(),
                    last_changed: new Date(),
                    status: 'MultiplayerGameSessionState.Running',
                    state: null,
                    result: null,
                    events_from_0: [],
                    events_from_1: [],
                    lastProcessedEvent: [0, 0],
                    game: {
                        players: [entities.createPlayer(req.body.opponent, opponent.id, 'PlayerType.HUMAN', opponentLevel), entities.createPlayer(player.username, req.user.uid, 'PlayerType.HUMAN', playerLevel)],
                        currentPlayerIndex: coinToss,
                        state: 'GameStateTypes.CHOOSE_FIELD_OR_START',
                        isRunning: true,
                        winners: [],
                        board: entities.Board.generate({ rows: 10, cols: 10 }, Math.round(Math.random() * Math.pow(10, 8)))
                    }
                };

                try {
                    let databaseSession = await db.collection('multiplayerGameSessions').add(session);
                    const tokens = await getPlayerMessagingPermissionTokens(req.user.uid);
                    tokens.forEach((token) => {
                        const payload = {
                            'notification': {
                                'title': player.username + t.t[language].NOTIFICATION_CHALLENGE_TITLE,
                                'body': t.t[language].NOTIFICATION_CHALLENGE_BODY,
                                'click_action': 'https://battlechoc.com/session/' + databaseSession.id,
                                'image': 'https://battlechoc.com/icon-144x144.png'
                            },
                            'to': token
                        }
                        axios.post('https://fcm.googleapis.com/fcm/send', payload, { headers: { 'Authorization': 'key=***REMOVED***' } })
                            .then(() => console.log('Successfully send notification'))
                            .catch(error => console.warn('PLAYER NOTIFICATION FAILED' + error.toString()));
                    });
                    res.json({ sessionId: databaseSession.id });
                } catch (error) {
                    res.status(500).json({ error: error.toString() });
                }
            }
        }
    }
});

const processEvents = (session, events) => {
    let unprocessedEvents = 0;
    let processedEvents = 0;
    let faildValidityChecks = 0;

    if (events.length > (session.lastProcessedEvent[0] + session.lastProcessedEvent[1])) {
        events.filter(event => !event.hasOwnProperty('processed')).forEach(event => {
            if (event.payload.issuer === session.game.players[0].id) {
                if (session.game.currentPlayerIndex === 0 || event.type === gamestate.GameActionTypes.endGame) {
                    if (session.lastProcessedEvent[0] < event.index) {
                        unprocessedEvents += 1;
                    } else if (session.lastProcessedEvent[0] === event.index) {
                        if (gamestate.Rules.isActionValid(session.game, event)) {
                            gamestate.Reducer.updateState(session.game, event);
                            session.lastProcessedEvent[0] += 1;
                            processedEvents += 1;
                            event.processed = true;
                        } else {
                            console.warn('Validity check failed for ' + JSON.stringify(event))
                            if (!event.hasOwnProperty('invalid')) {
                                session.lastProcessedEvent[0] += 1;
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
                if (session.game.currentPlayerIndex === 1 || event.type === gamestate.GameActionTypes.endGame) {
                    if (session.lastProcessedEvent[1] < event.index) {
                        unprocessedEvents += 1;
                    } else if (session.lastProcessedEvent[1] === event.index) {
                        if (gamestate.Rules.isActionValid(session.game, event)) {
                            gamestate.Reducer.updateState(session.game, event);
                            session.lastProcessedEvent[1] += 1;
                            processedEvents += 1;
                            event.processed = true;
                        } else {
                            console.warn('Validity check failed for ' + JSON.stringify(event))
                            if (!event.hasOwnProperty('invalid')) {
                                session.lastProcessedEvent[1] += 1;
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

const processEventsInOrder = session => {
    let events = session.events_from_0;
    events = events.concat(session.events_from_1);
    events.sort((a, b) => {
        if (typeof a.emitted === 'undefined') {
            return -1;
        } else if (typeof b.emitted === 'undefined') {
            return 1;
        } else {
            return (a.emitted.nanoseconds > b.emitted.nanoseconds) ? 1 : -1
        }
    });

    const timeout = new Date().getTime() + 10000;

    var { unprocessedEvents, processedEvents, faildValidityChecks } = processEvents(session, events);
    console.log(unprocessedEvents, processedEvents, faildValidityChecks)
    if (faildValidityChecks > 0) {
        console.warn('SOME EVENTS DID NOT PASS THE VALIDITY CHECK');
    }

    while (unprocessedEvents > 0 && processedEvents > 0 && (new Date().getTime()) > timeout) {
        ({ unprocessedEvents, processedEvents, faildValidityChecks } = processEvents(session, events));
        console.log(unprocessedEvents, processedEvents, faildValidityChecks);
        if (faildValidityChecks > 0) {
            console.warn('SOME EVENTS DID NOT PASS THE VALIDITY CHECK');
        }
    }

    if (new Date().getTime() > timeout) {
        console.warn('Event loop hang up ' + JSON.stringify(session));
        return { error: 'INCORRECT EVENTS LOOP HANG UP' }
    } else {
        return { done: 'PROCESSED EVENTS' }
    }
}

app.post('/multiplayer/relay/action', async (req, res) => {
    let ref = db.collection('multiplayerGameSessions').doc(req.body.sessionId);
    let doc = await ref.get();
    if (!doc.exists) {
        res.status(404).json({ error: 'SESSION NOT FOUND' });
    } else {
        let session = doc.data();
        if (!session.players.includes(req.user.uid)) {
            return res.status(401).end();
        }

        let issuer = req.body.event.payload.issuer;

        if (issuer === session.game.players[0].id) {
            console.log('push event to player 0 event array', req.body.event)
            try {
                await ref.update({
                    events_from_0: admin.firestore.FieldValue.arrayUnion(req.body.event),
                    last_changed: new Date()
                });
            } catch (error) {
                console.warn('Failed to push event ' + req.body.event.toString() + ' to the event list of player 0');
                return res.status(500).json({ 'error': error });
            }
        } else if (issuer === session.game.players[1].id) {
            console.log('push event to player 1 event array', req.body.event)
            try {
                await ref.update({
                    events_from_1: admin.firestore.FieldValue.arrayUnion(req.body.event),
                    last_changed: new Date()
                });
            } catch (error) {
                console.warn('Failed to push event ' + req.body.event.toString() + ' to the event list of player 1');
                return res.status(500).json({ 'error': error });
            }
        } else {
            res.status(400).json({ error: 'UNKNOWN ISSUER' });
        }

        try {
            doc = await ref.get();
        } catch (error) {
            return res.status(500).json({ 'error': error });
        }

        session = doc.data();
        let playerId = session.game.currentPlayerIndex;
        let result = processEventsInOrder(session);
        let updatedPlayerId = session.game.currentPlayerIndex;

        if (playerId !== updatedPlayerId) {
            const opponent = session.game.players[playerId].name;
            const tokens = await getPlayerMessagingPermissionTokens(session.game.players[updatedPlayerId].id);
            let expiredTokens = [];
            await Promise.all(tokens.map(async (token) => {
                const payload = {
                    'notification': {
                        'title': opponent + ' finished the turn @battlechoc',
                        'body': 'Let\'s go. It\'s your move!',
                        'click_action': 'https://battlechoc.com/session/' + req.body.sessionId,
                        'image': 'https://battlechoc.com/icon-144x144.png'
                    },
                    'to': token
                }

                try {
                    const response = await axios.post('https://fcm.googleapis.com/fcm/send', payload, { headers: { 'Authorization': 'key=***REMOVED***' } })
                    if (response.data.failure === 1 && typeof response.data.results !== 'undefined' && response.data.results.length > 0 && response.data.results[0].error === 'NotRegistered') {
                        console.log('Cleanup expired user registration token ' + token);
                        expiredTokens.push(token);
                    } else {
                        console.log('Successfully send notification');
                        console.log(`Token ${token} is still valid`);
                    }
                } catch (error) {
                    console.warn('PLAYER NOTIFICATION FAILED' + error.toString());
                }
            }));

            if (expiredTokens.length === 0) {
                console.log('No token update needed. All tokens are still valid')
            } else {
                await Promise.all(expiredTokens.map(async (expiredToken) => {
                    await dbPool.query("DELETE FROM permissions WHERE token = $1 AND type = $2 AND player = $3", [expiredToken, 'messaging', session.game.players[updatedPlayerId].id]);
                }));
                console.log('Updating user tokens because some of them were invalid. Deleted tokens: ' + expiredTokens.toString());
            }
        }

        if (result.hasOwnProperty('error')) {
            res.status(400).json(result);
        } else {
            try {
                delete session.events_from_0;
                delete session.events_from_1;

                await ref.set(session, { merge: true });
                res.status(200).end();
            } catch (error) {
                res.status(500).json({ 'error': error.toString() });
            }
        }
    }
});

app.post('/surrender', async (req, res) => {
    let ref = db.collection('multiplayerGameSessions').doc(req.body.sessionId);
    try {
        var doc = await ref.get();
    } catch (error) {
        return res.status(500).json({ 'error': error });
    }

    if (!doc.exists) {
        res.status(404).json({ error: 'SESSION NOT FOUND' });
    } else {
        let session = doc.data();
        if (!session.players.includes(req.user.uid)) {
            return res.status(401).end();
        }

        let playerIndex = session.game.players.findIndex(player => player.id === req.user.uid);

        let event = {
            index: session['events_from_' + playerIndex].length,
            type: 'battlechoc/gameplay/endGame',
            payload: {
                winners: session.game.players.filter(player => player.id !== req.user.uid),
                issuer: req.user.uid
            },
            sessionId: req.body.sessionId
        }

        session['events_from_' + playerIndex].push(event);
        session.lastProcessedEvent[playerIndex] += 1;
        session.last_changed = new Date();
        session.game.isRunning = false;
        session.game.winners = event.payload.winners;
        session.game.players.filter(player => player.id !== req.user.uid)[0].statistics.won = true;
        session.game.players.filter(player => player.id !== req.user.uid)[0].statistics.lost = false;
        session.game.players.filter(player => player.id === req.user.uid)[0].statistics.won = false;
        session.game.players.filter(player => player.id === req.user.uid)[0].statistics.lost = true;

        try {
            await ref.set(session);
            res.status(200).end();
        } catch (error) {
            res.status(500).json({ 'error': error });
        }
    }
});

app.get('/multiplayer/sessions', async (req, res) => {
    instanceCount += 1;
    console.log("instance counter: " + instanceCount);

    console.time("firestore");
    try {
        var docs = await db.collection('multiplayerGameSessions').where('players', 'array-contains', req.user.uid).get();
    } catch (error) {
        return res.status(500).json({ error: error });
    }
    console.timeEnd("firestore");

    console.time("remains");
    const games = [];
    if (docs.size > 0) {
        docs.forEach(doc => {
            let game = doc.data();
            if (game.game.isRunning) {
                const playerIndex = game.game.players.findIndex(player => player.id === req.user.uid);
                games.push({
                    'id': doc.id,
                    'players': game.players,
                    'status': game.status,
                    'last_changed': game.last_changed.toMillis(),
                    'created': game.created.toMillis(),
                    'myTurn': game.game.currentPlayerIndex === playerIndex,
                    'turns': game['events_from_' + playerIndex].filter(event => event.type === 'battlechoc/gameplay/finishTurn').length,
                    'statistics': game.game.players[playerIndex].statistics
                });
            }
        })

        for (let i = 0; i < games.length; i++) {
            let game = games[i];
            let opponentId = game.players.filter(playerId => playerId != req.user.uid)[0];
            try {
                const opponentQueryResult = await getPlayerFromId(opponentId);
                if (opponentQueryResult.rows > 0) {
                    const opponent = await createPlayerStatsObject(opponentQueryResult.rows[0], true);
                    games[i].opponent = {
                        name: opponent.username,
                        ranking: ranking,
                        level: level,
                        drawn: drawn,
                        losses: losses,
                        winnings: winnings
                    }
                } else {
                    games[i].game.isRunning = false;
                    games[i].opponent = {
                        name: 'Chocnonymous',
                        ranking: 0,
                        level: 0,
                        drawn: 0,
                        losses: 0,
                        winnings: 0
                    }
                }
            } catch (error) {
                return res.status(500).json({ error: error });
            }
        }
        console.timeEnd("remains");
        res.json({ sessions: games })
    } else {
        console.timeEnd("remains");
        res.json({ sessions: [] })
    }
})

app.post('/update/level', async (req, res) => {
    try {
        const playerQueryResult = await getPlayerFromId(req.user.uid);
        if (playerQueryResult.rows.length > 0) {
            const player = playerQueryResult.rows[0];
            if (typeof player.coins !== 'undefined') {
                const level = playerLevelObjectFromRecord(player);
                if (req.body.upgrade) {
                    const limit = entities.getMaximumLevel(req.body.entityType, level);
                    const costs = entities.calculateCosts(req.body.entityType, level);
                    if (player.coins < costs) {
                        console.warn('Player tries to buy upgrade but cannot afford it', req.user.uid);
                        res.status(400).json({ error: 'NOT ENOUGH COINS' });
                    } else if ((level[req.body.entityType] + 1) > limit) {
                        console.warn('Player tries to buy upgrade but already reached max level', req.user.uid);
                        res.status(400).json({ error: 'LEVEL LIMIT OF ' + req.body.attribute + ' REACHED' });
                    } else {
                        level[req.body.entityType] = level[req.body.entityType] + 1;
                        const levelFieldName = entities.levelFieldNameFromEntityType(req.body.entityType);
                        if (typeof levelFieldName !== 'undefined') {
                            await dbPool.query('UPDATE players SET coins = coins - $1, ' + levelFieldName + ' = $2 WHERE id = $3', [costs, level[req.body.entityType], req.user.uid]);
                            res.json({ coins: player.coins - costs, level: level });
                        } else {
                            console.error('Given entity type could not be matched to a valid database representation of the entity level.', req.body.entityType);
                            req.status(500).json({ error: 'COULD NOT UPDATE LEVEL. ENTITY MISMATCH IN SERVER' });
                        }
                    }
                } else {
                    if (level[req.body.entityType] > 0) {
                        const previous = { level, [req.body.entityType]: level[req.body.entityType] - 1 };
                        const costs = entities.calculateCosts(req.body.entityType, previous);
                        const coinBackGuarantee = Math.round(0.666 * costs);
                        level[req.body.entityType] = level[req.body.entityType] - 1;
                        const levelFieldName = entities.levelFieldNameFromEntityType(req.body.entityType);
                        if (typeof levelFieldName !== 'undefined') {
                            await dbPool.query('UPDATE players SET coins = coins + $1, ' + levelFieldName + ' = $2 WHERE id = $3', [coinBackGuarantee, level[req.body.entityType], req.user.uid]);
                            res.json({ coins: player.coins + coinBackGuarantee, level: level });
                        } else {
                            console.error('Given entity type could not be matched to a valid database representation of the entity level.', req.body.entityType);
                            req.status(500).json({ error: 'COULD NOT UPDATE LEVEL. ENTITY MISMATCH IN SERVER' });
                        }
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

const approximatePlayersCount = async () => {
    try {
        const result = await dbPool.query("SELECT reltuples FROM pg_class WHERE oid = 'public.players'::regclass;");
        if (result.rows.length > 0) {
            return result.rows[0].reltuples;
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

            const playersCount = await approximatePlayersCount();
            let lastPage = Math.ceil(playersCount / pageSize);
            const playersOnPageResult = await dbPool.query('SELECT * FROM players ORDER BY score DESC OFFSET $1 LIMIT $2', [(page - 1) * pageSize, pageSize]);
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
        const queryStatement = "SELECT * FROM players WHERE name = $1";
        const queryResult = await dbPool.query(queryStatement, [req.params.name]);
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
        sessions = await db.collection('multiplayerGameSessions').where('players', 'array-contains', req.user.uid).get();
        for (let session of sessions.docs) {
            invalidOpponentIds.push(session.data().players.filter(id => id !== req.user.uid)[0]);
        }
        const statement = "SELECT * FROM players WHERE score > 0 AND NOT (name='') IS NOT FALSE AND NOT(id = ANY('{" + invalidOpponentIds.join() + "}'::text[]))";
        const queryResult = await dbPool.query(statement);
        if (queryResult.rows.length > 0) {
            res.json(await createPlayerStatsObject(queryResult.rows[Math.floor(Math.random() * queryResult.rows.length)], true));
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
        const existingTokenResult = await dbPool.query("SELECT * FROM permissions WHERE player = $1", [req.user.uid, req.body.token]);
        if (existingTokenResult.rows.length === 0) {
            await dbPool.query("INSERT INTO permissions(player, token, type) VALUES ($1, $2, $3)", [req.user.uid, req.body.token, 'messaging']);
            req.status(200).end();
        } else {
            req.status(400).json({ error: 'WONT INSERT DUPLICATE TOKEN ENTRIES' });
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
        const username = (typeof player.username === 'undefined') ? '' : player.username;
        const coins = (typeof player.coins === 'number' && !isNaN(player.coins)) ? player.coins : 0;
        const score = (typeof player.score === 'number' && !isNaN(player.score)) ? player.score : 0;
        const language = (typeof player.language !== 'undefined' && t.isValidLanguage(player.language)) ? player.language : t.getDefaultLanguage();
        const level_factory = (typeof player.level !== 'undefined' && typeof player.level['EntityType.FACTORY'] === 'number') ? player.level['EntityType.FACTORY'] : 0;
        const level_factory_extension = (typeof player.level !== 'undefined' && typeof player.level['EntityType.FACTORY_EXTENSION'] === 'number') ? player.level['EntityType.FACTORY_EXTENSION'] : 0;
        const level_cacaotree = (typeof player.level !== 'undefined' && typeof player.level['EntityType.CACAOTREE'] === 'number') ? player.level['EntityType.CACAOTREE'] : 0;
        const level_chocolate_fountain = (typeof player.level !== 'undefined' && typeof player.level['EntityType.CHOCOLATE_FOUNTAIN'] === 'number') ? player.level['EntityType.CHOCOLATE_FOUNTAIN'] : 0;
        const level_cream = (typeof player.level !== 'undefined' && typeof player.level['EntityType.CREAM'] === 'number') ? player.level['EntityType.CREAM'] : 0;
        const level_fruit_cannon = (typeof player.level !== 'undefined' && typeof player.level['EntityType.FRUIT_CANNON'] === 'number') ? player.level['EntityType.FRUIT_CANNON'] : 0;
        const level_hot_chocolate_ballista = (typeof player.level !== 'undefined' && typeof player.level['EntityType.HOT_CHOCOLATE_BALLISTA'] === 'number') ? player.level['EntityType.HOT_CHOCOLATE_BALLISTA'] : 0;
        const level_rum_truffle_cannon = (typeof player.level !== 'undefined' && typeof player.level['EntityType.RUM_TRUFFLE_CANNON'] === 'number') ? player.level['EntityType.RUM_TRUFFLE_CANNON'] : 0;
        const level_spying_easter_bunny = (typeof player.level !== 'undefined' && typeof player.level['EntityType.SPYING_EASTER_BUNNY'] === 'number') ? player.level['EntityType.SPYING_EASTER_BUNNY'] : 0;
        const level_xmas_factory = (typeof player.level !== 'undefined' && typeof player.level['EntityType.XMAS_FACTORY'] === 'number') ? player.level['EntityType.XMAS_FACTORY'] : 0;
        const existsCheckResult = await getPlayerFromId(userId);
        if (existsCheckResult.rows.length === 0) {
            const insertStatement = 'INSERT INTO players(id, name, coins, score, language, level_factory, level_factory_extension, level_cacaotree, level_chocolate_fountain, level_cream, level_fruit_cannon, level_hot_chocolate_ballista, level_rum_truffle_cannon, level_spying_easter_bunny, level_xmas_factory) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *';
            const queryResult = await dbPool.query(insertStatement, [userId, username, coins, score, language, level_factory, level_factory_extension, level_cacaotree, level_chocolate_fountain, level_cream, level_fruit_cannon, level_hot_chocolate_ballista, level_rum_truffle_cannon, level_spying_easter_bunny, level_xmas_factory]);
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
            const statement = 'UPDATE players SET name = $1, coins = $2, score = $3, language = $4, level_factory = $5, level_factory_extension = $6, level_cacaotree = $7, level_chocolate_fountain = $8, level_cream = $9, level_fruit_cannon = $10, level_hot_chocolate_ballista = $11, level_rum_truffle_cannon = $12, level_spying_easter_bunny = $13, level_xmas_factory = $14) WHERE id = $15 RETURNING *';
            const queryResult = await dbPool.query(statement, [username, coins, score, language, level_factory, level_factory_extension, level_cacaotree, level_chocolate_fountain, level_cream, level_fruit_cannon, level_hot_chocolate_ballista, level_rum_truffle_cannon, level_spying_easter_bunny, level_xmas_factory, userId]);
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
            const username = '';
            const language = t.getDefaultLanguage();
            const level_factory = 0;
            const level_factory_extension = 0;
            const level_cacaotree = 0;
            const level_chocolate_fountain = 0;
            const level_cream = 0;
            const level_fruit_cannon = 0;
            const level_hot_chocolate_ballista = 0;
            const level_rum_truffle_cannon = 0;
            const level_spying_easter_bunny = 0;
            const level_xmas_factory = 0;
            const insertStatement = 'INSERT INTO players(id, name, coins, score, language, level_factory, level_factory_extension, level_cacaotree, level_chocolate_fountain, level_cream, level_fruit_cannon, level_hot_chocolate_ballista, level_rum_truffle_cannon, level_spying_easter_bunny, level_xmas_factory) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *';
            const queryResult = await dbPool.query(insertStatement, [userId, username, coins, score, language, level_factory, level_factory_extension, level_cacaotree, level_chocolate_fountain, level_cream, level_fruit_cannon, level_hot_chocolate_ballista, level_rum_truffle_cannon, level_spying_easter_bunny, level_xmas_factory]);
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
        let recordsAdded = [];
        await Promise.all(req.body.stats.map(async (record) => {
            if ((await addTrackRecord(req.user.uid, record)) === true) {
                recordsAdded.push(record);
            }
        }));
        let playerStats = await updatePlayerStats(req.user.uid, recordsAdded);
        res.status(200).json({ stats: playerStats });
    } catch (err) {
        console.warn('Could not add a new track records for player.', err);
        res.status(500).json({ error: 'COULD NOT ADD TRACK RECORDS' })
    }
});

app.get('/user', async (req, res) => {
    try {
        let playerStats = await fetchPlayerStats(req.user.uid);
        res.status(200).json({ stats: playerStats });
    } catch (err) {
        console.warn('Could not retrieve player stats.', err);
        res.status(500).json({ error: 'COULD NOT FETCH PLAYER STATS' })
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
            let regex = /^([a-zA-Z][a-zA-Z0-9_]{2,15})$/;
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

const importTrackRecord = async (userId, trackRecord) => {
    trackRecord.forEach(async record => {
        let gameResult = 'draw';
        let winner;
        let winnerType;
        if (typeof record.winners === 'undefined' || record.winners.length === 0 || (typeof record.lost === 'undefined' && typeof record.won === 'undefined')) {
            gameResult = 'open';
        } else {
            winner = record.winners[0].id;
            winnerType = (record.winners[0].type === 'PlayerType.HUMAN') ? 'human' : 'npc';
            if (record.won === true && record.lost !== true) {
                gameResult = 'won';
            } else if (record.lost === true && record.won !== true) {
                gameResult = 'lost';
            }
        }
        const id = (typeof record.id === 'undefined') ? uuidv4() : record.id;
        try {
            await dbPool.query('INSERT INTO track_records(id, player, winner, result, entities_destroyed, entities_molten, entities_revealed, entities_built, winner_type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT DO NOTHING',
                [id, userId, winner, gameResult, record.attacks, record.moltenFields, record.espionages, record.builtEntities, winnerType]);
        } catch (err) {
            console.error('Could not insert entry into track_records.', err);
            console.error(importedTrackIds);
            console.error(importedTrackIds.includes(id));
            console.error(userId + " -- " + id);
        }
    });
}

exports.api = functions.region('europe-west2').https.onRequest(app);