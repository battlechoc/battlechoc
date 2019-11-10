const functions = require('firebase-functions');
const express = require('express');
const cors = require('cors');
const app = express();
const basicAuth = require('express-basic-auth')
const bodyParser = require('body-parser');
const entities = require('./entities.js');
const admin = require('firebase-admin');
const uuidv4 = require('uuid/v4');
const gamestate = require('./gamestate.js');
const axios = require('axios');

admin.initializeApp();

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
app.use(basicAuth({
    users: { 'battlechoc-pwa': '***REMOVED***' }
}));

app.get('/debugging/gamestate', (req, res) => {
    res.json({ gamestate: 'NOT IMPLEMENTED YET!' });
});

app.post('/debugging/gamestate', (req, res) => {
    let report = req.body.report;
    return admin.firestore().collection('reports').add({ "report": report })
        .then(rows => res.json({ result: 'Bugreport with ID: ' + rows.id + ' added.' }))
        .catch(error => res.json({ result: error }));
});

app.get('/user/friends/:userId', async (req, res) => {
    let ref = admin.firestore().collection('players').doc(req.params.userId);
    let doc = await ref.get();
    if (doc.exists) {
        let player = doc.data();
        if (typeof player.friends === 'undefined') {
            res.json([]);
        } else {
            let friends = [];
            await Promise.all(player.friends.map(async (friendId) => {
                let friend = await admin.firestore().collection('players').doc(friendId).get();
                friends.push({ username: friend.data().username });           
            }));              
            
            res.json(friends); 
        }
    } else {
        res.status(404).json({ error: 'PLAYER NOT FOUND'});
    }
});

app.post('/user/friend', async (req, res) => {
    const players = admin.firestore().collection('players');
    let docs = await players.where('username', '==', req.body.friend).get();
    if (docs.size < 1) {
        res.status(404).json({ error: 'PLAYERNAME "' + req.body.friend + '" DOES NOT EXIST'});
    } else {
        let friendId = docs.docs[0].id;
        let ref = players.doc(req.body.userId);
        try {
            await ref.update({ friends: admin.firestore.FieldValue.arrayUnion(friendId) });
            res.status(200).end();
        } catch (error) {
            res.status(500).json({ 'error': error });
        }
    }
});

app.delete('/user/friend', async (req, res) => {
    const players = admin.firestore().collection('players');
    let docs = await players.where('username', '==', req.body.friend).get();
    if (docs.size < 1) {
        res.status(404).json({ error: 'PLAYERNAME "' + req.body.friend + '" DOES NOT EXIST'});
    } else {
        let friendId = docs.docs[0].id;
        let ref = players.doc(req.body.userId);
        try {
            await ref.update({ friends: admin.firestore.FieldValue.arrayRemove(friendId) });
            res.status(200).end();
        } catch (error) {
            res.status(500).json({ 'error': error });
        }
    }
});

app.get('/query/user/:name', async (req, res) => {
    const players = admin.firestore().collection('players');
    let docs = await players.where('username', '>', '').select('username').get();
    let limit = 10;
    let results = [];
    for (let doc of docs.docs) {
        let player = doc.data();

        if (player.username.toLowerCase().includes(req.params.name.toLocaleLowerCase())) {
            results.push(doc.id);
        }

        if (results.length >= limit) {
            break;
        }
    }

    if (results.length > 0) {
        let refs = await admin.firestore().getAll(...results.map(id => players.doc(id)));
        console.log(refs);
        let result = []
        for (let doc of refs) {
            let player = doc.data();

            if (typeof player.level !== 'undefined') {
                player.level = Object.values(player.level).map(attribute => Object.values(attribute).reduce((a, b) => a + b, 0)).reduce((a, b) => a + b, 0);
            } else {
                player.level = 0;
            }

            if (typeof player.trackRecord !== 'undefined') {
                player.losses = player.trackRecord.filter(record => record.lost).length;
                player.winnings = player.trackRecord.filter(record => record.won).length;
                player.drawn = player.trackRecord.filter(record => typeof record.winners !== 'undefined').filter(record => record.winners.length > 1).length;
            } else {
                player.losses = 0;
                player.winnings = 0;
                player.drawn = 0;
            }
            player.name = player.username;
            // hide player specific fields
            player.trackRecord = undefined;
            player.last_upgrade_action = undefined;
            player.coins = undefined;
            let score = player.score;
            player.score = undefined;
            player.friends = undefined;
            player.username = undefined;
            if (typeof score === 'undefined' || isNaN(score)) {
                let scores = await players.where('score', '>', 0).get();
                player = Object.assign(player, {ranking: scores.size});
            } else {
                let scores = await players.where('score', '>=', score).get();
                player = Object.assign(player, {ranking: scores.size});
            }
            result.push(player);        
        }

        res.json(result);
    } else {
        res.json([]);
    }
});

app.post('/user/challenge', async (req, res) => {
    const permissions = admin.firestore().collection('permissions');
    const players = admin.firestore().collection('players');
    let docs = await players.where('username', '==', req.body.opponent).get();
    if (docs.size < 1) {
        res.status(404).json({ error: 'OPPONENT "' + req.body.opponent + '" DOES NOT EXIST'});
    } else {
        let opponentId = docs.docs[0].id;
        let opponent = docs.docs[0].data();
        if (opponentId === req.body.playerId) {
            res.status(400).json({ error: 'CANNOT CREATE A GAME CHALLENGING YOURSELF' });
        } else {
            let doc = await players.doc(req.body.playerId).get();
            if (!doc.exists) {
                res.status(404).json({ error: 'PLAYER NOT FOUND'});
            } else {
                let player = doc.data();
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
                        opponentId,
                        req.body.playerId
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
                        players: [entities.createPlayer(req.body.opponent, opponentId, 'PlayerType.HUMAN', opponentLevel), entities.createPlayer(player.username, req.body.playerId, 'PlayerType.HUMAN', playerLevel)],
                        currentPlayerIndex: coinToss,
                        state: 'GameStateTypes.CHOOSE_FIELD_OR_START',
                        isRunning: true,
                        winners: [],
                        board: entities.Board.generate({rows: 10, cols: 10}, Math.round(Math.random() * Math.pow(10, 8)))
                    }
                };

                try {
                    let databaseSession = await admin.firestore().collection('multiplayerGameSessions').add(session);
                    permissions.doc(req.body.playerId).get().then(doc => {
                        if (doc.exists) {
                            permission = doc.data();
                            if (typeof permission.messaging !== 'undefined') {
                                permission.messaging.forEach(token => {
                                    const payload = {
                                      'notification': {
                                        'title':  player.username + ' challenges you @battlechoc',
                                        'body': 'This could be a great fight!',
                                        'click_action': 'https://battlechoc.com?sessionId=' + databaseSession.id
                                      },
                                      'to': token
                                    }

                                    axios.post('https://fcm.googleapis.com/fcm/send', payload, { headers: {'Authorization' : 'key=***REMOVED***'}})
                                    .then(() => console.log('Successfully send notification'))
                                    .catch(error => console.warn('PLAYER NOTIFICATION FAILED' + error.toString()));
                                });
                            }
                        }
                    }).catch(error => console.warn('ERROR WHILE PLAYER NOTIFICATION ' + error.toString()));

                    res.json({ sessionId: databaseSession.id });
                } catch(error) {
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
                if (session.game.currentPlayerIndex === 0) {
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
                if (session.game.currentPlayerIndex === 1) {
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
    events.sort((a, b) => (a.emitted.nanoseconds > b.emitted.nanoseconds) ? 1 : -1)
    
    const timeout = new Date().getTime() + 10000;

    var unprocessedEvents, processedEvents, faildValidityChecks = processEvents(session, events);
    console.log(unprocessedEvents, processedEvents, faildValidityChecks)
    if (faildValidityChecks > 0) {
        return { error: 'SOME EVENTS DID NOT PASS THE VALIDITY CHECK'}
    }

    while (unprocessedEvents > 0 && processedEvents > 0 && (new Date().getTime()) > timeout) {
        unprocessedEvents, processedEvents, faildValidityChecks = processEvents(session, events);
        console.log(unprocessedEvents, processedEvents, faildValidityChecks)
        if (faildValidityChecks > 0) {
            return { error: 'SOME EVENTS DID NOT PASS THE VALIDITY CHECK'}
        }
    }

    if (new Date().getTime() > timeout) {
        console.warn('Event loop hang up ' + JSON.stringify(session));
        return { error: 'INCORRECT EVENTS LOOP HANG UP'}
    } else {
        return { done: 'PROCESSED EVENTS'}
    }
}

app.post('/multiplayer/relay/action', async (req, res) => {
    let ref = admin.firestore().collection('multiplayerGameSessions').doc(req.body.sessionId);
    let doc = await ref.get();
    if (!doc.exists) {
        res.status(404).json({error: 'SESSION NOT FOUND'});
    } else {
        let session = doc.data();
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
            res.status(400).json({error: 'UNKNOWN ISSUER'});
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
            const permissions = admin.firestore().collection('permissions');
            const opponent = session.game.players[playerId].name;
            permissions.doc(session.game.players[updatedPlayerId].id).get().then(doc => {
                if (doc.exists) {
                    permission = doc.data();
                    if (typeof permission.messaging !== 'undefined') {
                        permission.messaging.forEach(token => {
                            const payload = {
                              'notification': {
                                'title':  opponent + ' finished the turn @battlechoc',
                                'body': 'Let\'s go. It\'s your move!',
                                'click_action': 'https://battlechoc.com?sessionId=' + req.body.sessionId
                              },
                              'to': token
                            }

                            axios.post('https://fcm.googleapis.com/fcm/send', payload, { headers: {'Authorization' : 'key=***REMOVED***'}})
                            .then(() => console.log('Successfully send notification'))
                            .catch(error => console.warn('PLAYER NOTIFICATION FAILED' + error.toString()));
                        });
                    }
                }
            }).catch(error => console.warn('ERROR WHILE PLAYER NOTIFICATION ' + error.toString()));
        }

        if (result.hasOwnProperty('error')) {
            res.status(400).json(result);
        } else {
            try {
                delete session.events_from_0;
                delete session.events_from_1;

                await ref.set(session, {merge: true});
                res.status(200).end();
            } catch (error) {
                res.status(500).json({ 'error': error.toString() });
            }
        }
    }
});

app.get('/multiplayer/sessions/:userId', async (req, res) => {
    let docs = null;
    try {
        docs = await admin.firestore().collection('multiplayerGameSessions').where('players', 'array-contains', req.params.userId).get();
    } catch (error) {
        return res.status(500).json({error: error});
    }
    const games = [];
    if (docs.size > 0) {
        docs.forEach(doc => {
            let game = doc.data();
            let playerIndex = game.game.players.findIndex(player => player.id === req.params.userId);
            if (game.game.isRunning) {
                games.push({
                    'id': doc.id,
                    'players': game.players, 
                    'status': game.status, 
                    'last_changed': game.last_changed.toMillis(),
                    'created': game.created.toMillis(),
                    'myTurn': game.currentPlayerIndex === playerIndex,
                    'turns': game['events_from_' + playerIndex].filter(event => event.type === 'battlechoc/gameplay/finishTurn').length,
                    'statistics': game.game.players[playerIndex].statistics
                });
            }
        })

        for (let i = 0; i < games.length; i++) {
            let game = games[i];
            let opponentId = game.players.filter(playerId => playerId != req.params.userId)[0];
            const players = admin.firestore().collection('players');
            let doc = await players.doc(opponentId).get();
            if (doc.exists) {
                let opponent = doc.data();
                
                let winnings = 0;
                let losses = 0;
                let drawn = 0;
                if (typeof opponent.trackRecord !== 'undefined') {
                    winnings = opponent.trackRecord.filter(record => record.won).length;
                    losses = opponent.trackRecord.filter(record => record.lost).length;
                    drawn = opponent.trackRecord.filter(record => typeof record.winners !== 'undefined' && record.winners.length > 1).length;
                }

                if (typeof opponent.level === 'undefined') {
                    opponent.level = entities.EmptyPlayerStats.level;
                }

                let level = Object.values(opponent.level)
                            .map(attributes => Object.values(attributes).reduce((level, prev) => Number(level) + Number(prev)))
                            .reduce((value, prev) => value + prev);
                
                let ranking = 0;
                if (typeof opponent.score === 'undefined' || isNaN(opponent.score)) {
                    ranking = (await players.where('score', '>', 0).get()).size
                } else {
                    ranking = (await players.where('score', '>=', opponent.score).get()).size
                }

                games[i].opponent = {
                    name: opponent.username,
                    ranking: ranking,
                    level: level,
                    drawn: drawn,
                    losses: losses,
                    winnings: winnings
                }
            } else {
                return res.status(404).json({ error: 'OPPONENT NOT FOUND'});
            }
        }

        res.json({ sessions: games })
    } else {
        res.json({ sessions: [] })
    }
})

const basicLevel = {
    'EntityType.CREAM': { hp: 0, area: 0},
    'EntityType.FACTORY': { hp: 0, buildingsPerTurn: 0, cacaoPerTurn: 0 },
    'EntityType.FACTORY_EXTENSION': { hp: 0, buildingsPerTurn: 0 },
    'EntityType.CACAOTREE': { hp: 0, cacaoPerTurn: 0 },
    'EntityType.RUM_TRUFFLE_CANNON': { hp: 0, attack: 0, area: 0 },
    'EntityType.FRUIT_CANNON': { hp: 0, attack: 0, area: 0 },
    'EntityType.SPYING_EASTER_BUNNY': { hp: 0, area: 0, fortune: 0 },
    'EntityType.XMAS_FACTORY': {  hp: 0, area: 0 },
    'EntityType.HOT_CHOCOLATE_BALLISTA': { hp: 0, area: 0, fortune: 0 },
    'EntityType.CHOCOLATE_FOUNTAIN': { hp: 0 }
}

app.post('/upgrade/entity', (req, res) => {
    let players = admin.firestore().collection('players');
    players.doc(req.body.player).get().then(doc => {
        if (doc.exists) {
            let player = doc.data();

            if (typeof player.coins !== 'undefined') {
                let level = basicLevel;
                if (typeof player.level !== 'undefined') {
                    level = player.level;
                }

                let limit = entities.getMaximumLevel(req.body.entity, level, req.body.attribute);
                let costs = entities.calculateCosts(req.body.entity, level);
                if ( player.coins < costs ) {
                    res.status(400).json({ error: 'NOT ENOUGH COINS'});
                } else if ( (level[req.body.entity][req.body.attribute] + 1) > limit ) {
                    res.status(400).json({ error: 'LEVEL LIMIT OF ' + req.body.attribute + ' REACHED' });
                } else {                
                    level[req.body.entity][req.body.attribute] = level[req.body.entity][req.body.attribute] + 1;
                    let upgradeAction = { id: uuidv4(), timestamp: new Date().getTime() };
                    players.doc(req.body.player).update({
                        coins: player.coins - costs,
                        level: level,
                        last_upgrade_action: upgradeAction
                    }).then(() => {
                        res.json({ coins: player.coins - costs, level: level, last_upgrade_action: upgradeAction.id });
                    });
                }
            } else {
                res.status(400).json({ error: 'PLAYER HAS NO COINS' });
            }
        } else {
            res.status(404).json({ error: 'PLAYER DOES NOT EXIST'});
        }
    }).catch(error => res.status(500).json({ error: error }));
});

app.post('/undo/upgrade', (req, res) => {
    let players = admin.firestore().collection('players');
    players.doc(req.body.player).get().then(doc => {
        if (doc.exists) {
            let player = doc.data();
            if (typeof player.last_upgrade_action === 'undefined' || player.last_upgrade_action === null) {
                res.status(400).json({ error: 'NO UPGRADE ACTION REGISTERED' });
            } else if ((new Date().getTime() - 60000) > player.last_upgrade_action.timestamp) {
                res.status(400).json({ error: 'LAST UPGRADE ACTION OUTDATED' });
            } else if (player.last_upgrade_action.id !== req.body.actionId) {
                res.status(400).json({ error: 'ACTION ID IS NOT VALID' });
            } else {
                let level = player.level;
                level[req.body.entity][req.body.attribute] = level[req.body.entity][req.body.attribute] - 1;
                let costs = entities.calculateCosts(req.body.entity, level);
                players.doc(req.body.player).update({
                    coins: player.coins + costs,
                    level: level,
                    last_upgrade_action: null
                }).then(() => {
                    res.json({ coins: player.coins + costs, level: level });
                }).catch(error => res.status(500).json({ error: error }));
            }
        } else {
            res.status(404).json({ error: 'PLAYER DOES NOT EXIST'});
        }
    }).catch(error => res.status(500).json({ error: error.toString() }));
});

app.get('/rank/:player', (req, res) => {
    let players = admin.firestore().collection('players');
    players.doc(req.params.player).get().then(doc => {
        if (doc.exists) {
            let player = doc.data();
            if (typeof player.score === 'undefined' || isNaN(player.score)) {
                players.where('score', '>', 0).get()
                .then(scores => res.json({ ranking: scores.size}))
                .catch(error => res.status(500).json({ error: error.toString() }));
            } else {
                players.where('score', '>=', player.score).get()
                .then(scores => res.json({ ranking: scores.size }))
                .catch(error => res.status(500).json({ error: error.toString() }));
            }
        } else {
            res.status(404).json({ error: 'PLAYER DOES NOT EXIST'});
        }
    }).catch(error => res.status(500).json({ error: error.toString() }));
});

app.get('/check/available/:username', (req, res) => {
    if (typeof req.params.username === 'undefined' ||
        req.params.username === '') {
        res.status(400).json({ error: 'USERNAME EMPTY'});
    } else {
        let players = admin.firestore().collection('players');
        players.where('username', '==', req.params.username).get()
        .then(player => res.json({ available: player.size === 0 && req.params.username.toUpperCase() !== 'CHOCNONYMOUS' }))
        .catch(error => res.status(500).json({ error: error.toString() }));
    }
});

app.get('/user/:name', async (req, res) => {
    let players = admin.firestore().collection('players');
    try {
        var snapshot = await players.where('username', '==', req.params.name).get();
    } catch (error) {
        return res.status(500).json({ error: error.toString() });
    }

    if (snapshot.empty) {
        res.status(404).json({ error: 'PLAYER DOES NOT EXIST'});
    } else {
        let player = snapshot.docs[0].data();

        if (typeof player.level !== 'undefined') {
            player.level = Object.values(player.level).map(attribute => Object.values(attribute).reduce((a, b) => a + b, 0)).reduce((a, b) => a + b, 0);
        } else {
            player.level = 0;
        }

        if (typeof player.trackRecord !== 'undefined') {
            player.losses = player.trackRecord.filter(record => record.lost).length;
            player.winnings = player.trackRecord.filter(record => record.won).length;
            player.drawn = player.trackRecord.filter(record => typeof record.winners !== 'undefined').filter(record => record.winners.length > 1).length;
        } else {
            player.losses = 0;
            player.winnings = 0;
            player.drawn = 0;
        }
        player.name = player.username;
        // hide player specific fields
        player.trackRecord = undefined;
        player.last_upgrade_action = undefined;
        player.coins = undefined;
        let score = player.score;
        player.score = undefined;
        player.username = undefined;

        if (typeof score === 'undefined' || isNaN(score)) {
            players.where('score', '>', 0).get()
            .then(scores => res.json(Object.assign(player, {ranking: scores.size})))
            .catch(error => res.status(500).json({ error: error.toString() }));
        } else {
            players.where('score', '>=', score).get()
            .then(scores => res.json(Object.assign(player, {ranking: scores.size})))
            .catch(error => res.status(500).json({ error: error.toString() }));
        }
    }
});

app.get('/random/opponent/for/:playerId', async (req, res) => {
    let players = admin.firestore().collection('players');
    try {
        var docs = await players.where('username', '>', '').get();
    } catch (error) {
        return res.status(500).json({ error: error.toString() })
    }

    invalidOpponentIds = [req.params.playerId];

    sessions = await admin.firestore().collection('multiplayerGameSessions').where('players', 'array-contains', req.params.playerId).get();
    for (let session of sessions.docs) {
        invalidOpponentIds.push(session.data().players.filter(id => id !== req.params.playerId)[0]);
    }

    let validDocs = docs.docs.filter(player => !invalidOpponentIds.includes(player.id));
    if (validDocs.length === 0) {
        res.status(404).json({ error: 'NO MATCHING PLAYER FOUND' });
    } else {
        let randomId = Math.floor(Math.random() * validDocs.length);
        let player = validDocs[randomId].data();

        if (typeof player.level !== 'undefined') {
            player.level = Object.values(player.level).map(attribute => Object.values(attribute).reduce((a, b) => a + b, 0)).reduce((a, b) => a + b, 0);
        } else {
            player.level = 0;
        }

        if (typeof player.trackRecord !== 'undefined') {
            player.losses = player.trackRecord.filter(record => record.lost).length;
            player.winnings = player.trackRecord.filter(record => record.won).length;
            player.drawn = player.trackRecord.filter(record => typeof record.winners !== 'undefined').filter(record => record.winners.length > 1).length;
        } else {
            player.losses = 0;
            player.winnings = 0;
            player.drawn = 0;
        }
        player.name = player.username;
        // hide player specific fields
        player.trackRecord = undefined;
        player.last_upgrade_action = undefined;
        player.coins = undefined;
        let score = player.score;
        player.score = undefined;
        player.username = undefined;

        if (typeof score === 'undefined' || isNaN(score)) {
            players.where('score', '>', 0).get()
            .then(scores => res.json(Object.assign(player, {ranking: scores.size})))
            .catch(error => res.status(500).json({ error: error.toString() }));
        } else {
            players.where('score', '>=', score).get()
            .then(scores => res.json(Object.assign(player, {ranking: scores.size})))
            .catch(error => res.status(500).json({ error: error.toString() }));
        }
    }
});

app.post('/user/username', async (req, res) => {
    let players = admin.firestore().collection('players');

    try {
        var docs = await players.where('username', '==', req.body.username).get();
    } catch (error) {
        return res.status(500).json({ error: error.toString() });
    }

    if (docs.size > 0) {
        res.status(400).json({ error: 'PLAYERNAME ALREADY EXISTS'});
    } else {
        players.doc(req.body.player).get().then(doc => {
            let regex = /^([a-zA-Z][a-zA-Z0-9_]{3,15})$/;
            if (regex.test(req.body.username) && req.body.username.toUpperCase() !== 'CHOCNONYMOUS') {
                if (doc.exists) {
                    players.doc(req.body.player).update({
                        username: req.body.username
                    }).then(() => {
                        res.end();
                    }).catch(error => res.status(500).json({ error: error }));
                } else {
                    res.status(404).json({ error: 'PLAYER DOES NOT EXIST'});
                }
            } else {
                res.status(400).json({ error: 'USERNAME NOT VALID'});
            }
        }).catch(error => res.status(500).json({ error: error.toString() }));
    }
});

exports.api = functions.region('europe-west1').https.onRequest(app);