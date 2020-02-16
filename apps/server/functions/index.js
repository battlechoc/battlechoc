const functions = require('firebase-functions');
const app = require('./main').app;

exports.api = functions.region('europe-west2').https.onRequest(app);