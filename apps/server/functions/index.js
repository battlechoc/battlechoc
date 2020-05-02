const functions = require('firebase-functions');
const app = require('./main').app;
const sessionCleanupFunction = require('./main').sessionCleanupFunction;
exports.api = functions.region('europe-west2').https.onRequest(app);
exports.scheduledFunction = functions.region('europe-west2').pubsub.schedule('0 * * * *').onRun(sessionCleanupFunction);