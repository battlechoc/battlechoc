const functions = require('firebase-functions');
const express = require('express');
const cors = require('cors');
const app = express();

const admin = require('firebase-admin');
admin.initializeApp();

app.use(cors({ origin: true }));

app.get('/debugging/gamestate', (req, res) => {
	res.end("Received GET request!");  
});

app.post('/debugging/gamestate', (req, res) => {
	let gamestate = req.body.gamestate;
	return admin.firestore().collection('gamestate').add({"gamestate": gamestate})
		   .then(rows => res.json({result: 'Gamestate with ID: ${rows.id} added.'}))
		   .catch(error => res.json({result: error}));
});

exports.battlechoc = functions.https.onRequest(app);