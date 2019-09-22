const functions = require('firebase-functions');
const express = require('express');
const cors = require('cors');
const app = express();
const basicAuth = require('express-basic-auth')
const bodyParser = require('body-parser');
const entities = require('./entities.js');
const admin = require('firebase-admin');
admin.initializeApp();

function checkPlayerValidity(player1, player2) {
    return new Promise(resolve => {
        admin.firestore().collection('players').doc(player1).get().then(doc => {
            if (doc.exists) {
                admin.firestore().collection('players').doc(player2).get().then(doc2 => {
                    if (doc2.exists) {
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                })
            } else {
                resolve(false);
            }
        });
    });
}

const whitelist = ['https://battlechoc.com', 'http://localhost:3000', 'https://localhost:3000', 'chrome-extension://fhbjgbiflinjbdggehcddcbncdddomop'];
const corsOptions = {
    origin: function (origin, callback) {
        if (whitelist.indexOf(origin) !== -1) {
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

app.post('/creategame', async (req, res) => {
    let session = {
        players: req.body.players,
        created: new Date(),
        status: 'pending',
        state: null,
        result: null
    };
    const playerValidityCheckResult = await checkPlayerValidity(session.players.player1, session.players.player2);
    if (session.players.player1 === session.players.player2) {
        res.json({ result: 'cannot create a game challenging yourself' });
    } else {
        if (playerValidityCheckResult === true) {
            return admin.firestore().collection('sessions').add({ "session": session })
                .then(rows => res.json({ result: 'game created with id ' + rows.id }))
                .catch(error => res.json({ result: error }));
        } else {
            res.json({ result: 'trying to create a game for invalid players. request rejected' });
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
    let transaction = req.body.transaction;
    let players = admin.firestore().collection('players');
    players.doc(transaction.player).get().then(doc => {
        if (doc.exists) {
            let player = doc.data();

            if (typeof player.coins !== 'undefined') {
                let level = basicLevel;
                if (typeof player.level !== 'undefined') {
                    level = player.level;
                }

                let limit = entities.getMaximumLevel(transaction.entity, level, transaction.attribute);
                let costs = entities.calculateCosts(transaction.entity, level);
                if ( player.coins < costs ) {
                    res.json({ error: 'NOT ENOUGH COINS'});
                } else if ( transaction.level > limit ) {
                    res.json({ error: transaction.level + ' IS MORE THAN THE LIMIT OF ' + limit });
                } else {                
                    level[transaction.entity][transaction.attribute] = transaction.level;
                    players.doc(transaction.player).update({
                        coins: player.coins - costs,
                        level: level
                    }).then(() => {
                        res.json({ coins: player.coins, costs: costs, updated_coins: player.coins - costs, level: level });
                    });
                }
            } else {
                res.json({ coins: 0 });
            }
        } else {
            res.json('player does not exist');
        }
    }).catch(error => res.json({ result: error }));
});

exports.api = functions.https.onRequest(app);