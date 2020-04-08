const functions = require('firebase-functions');
const app = require('./main').app;
const reporting = require('./reporting').reporting;

exports.api = functions.region('europe-west2').https.onRequest(app);
exports.scheduledFunction = functions.pubsub.schedule('every 24 hours').onRun(reporting);