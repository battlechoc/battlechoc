const functions = require('firebase-functions');
const express = require('express');
const cors = require('cors');
const app = express();
const basicAuth = require('express-basic-auth')
const bodyParser = require('body-parser');
const entities = require('./entities.js');
const admin = require('firebase-admin');
const uuidv4 = require('uuid/v4');

admin.initializeApp();

const whitelist = ['https://battlechoc.com', 'http://localhost:3000', 'https://localhost:3000', 'chrome-extension://fhbjgbiflinjbdggehcddcbncdddomop'];
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

app.post('/user/challange', async (req, res) => {
    const permissions = admin.firestore().collection('permissions');
    const players = admin.firestore().collection('players');
    let doc = await players.where('username', '==', req.body.opponent).get();
    if (doc.size < 1) {
        res.status(404).json({ error: 'OPPONENT "' + req.body.opponent + '" DOES NOT EXIST'});
    } else {
        let opponentId = doc.docs[0].id;
        if (opponentId === req.body.playerId) {
            res.status(400).json({ error: 'CANNOT CREATE A GAME CHALLENGING YOURSELF' });
        } else {
            let doc = await players.doc(req.body.playerId).get();
            if (!doc.exists) {
                res.status(404).json({ error: 'PLAYER NOT FOUND'});
            } else {
                let player = doc.data();

                let session = {
                    players: [{
                        id: opponentId,
                        name: doc.docs[0].username
                    },{ 
                        id: req.body.playerId,
                        name: req.body.opponent
                    }],
                    created: new Date(),
                    last_changed: new Date(),
                    status: 'MultiplayerGameSessionState.Pending',
                    state: null,
                    result: null
                };

                try {
                    let databaseSession = await admin.firestore().collection('sessions').add({ "session": session });
                    permissions.doc(req.body.playerId).get().then(doc => {
                        if (doc.exists) {
                            permission = doc.data();
                            if (typeof permission.messaging !== 'undefined') {
                                const payload = {
                                  'notification': {
                                    'title':  player.username + ' challenges you @battlechoc',
                                    'body': 'This could be a great fight!',
                                    'click_action': 'https://battlechoc.dev?sessionid=' + databaseSession.id
                                  },
                                  'to': permission.messaging
                                }

                                fetch('https://fcm.googleapis.com/fcm/send', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(payload)
                                })
                                .catch(error => console.warn('PLAYER NOTIFICATION FAILED' + error.toString()));
                            }
                        }
                    }).catch(error => console.warn('ERROR WHILE PLAYER NOTIFICATION ' + error.toString()));

                    res.json({ sessionId: databaseSession.id });
                }
                catch(error) {
                    res.status(500).json({ error: error });
                }
            }
        }
    }
});

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
        let player = doc.data();
        players.where('score', '>=', player.score).get()
            .then(scores => res.json({ ranking: scores.size }))
            .catch(error => res.status(500).json({ error: error.toString() }));
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

app.post('/user/username', (req, res) => {
    let players = admin.firestore().collection('players');
    players.doc(req.body.player).get().then(doc => {
        let regex = /^([a-zA-Z][a-zA-Z0-9_]{3,15})$/
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
});

exports.api = functions.https.onRequest(app);