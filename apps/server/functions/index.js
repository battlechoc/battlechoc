const functions = require('firebase-functions');
const express = require('express');
const cors = require('cors');
const app = express();
const basicAuth = require('express-basic-auth')
const bodyParser = require('body-parser');

const admin = require('firebase-admin');
admin.initializeApp();

const whitelist = ['https://battlechoc.com', 'http://localhost:3000'];
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
    res.json({gamestate: 'NOT IMPLEMENTED YET!'});  
});

app.post('/debugging/gamestate', (req, res) => {
    let report = req.body.report;
    return admin.firestore().collection('reports').add({"report": report})
           .then(rows => res.json({result: 'Bugreport with ID: ' + rows.id + ' added.'}))
           .catch(error => res.json({result: error}));
});

exports.api = functions.https.onRequest(app);