const functions = require('firebase-functions');
const app = require('./main').app;
const sessionCleanupFunction = require('./main').sessionCleanupFunction;
exports.api = functions.region('europe-west2').https.onRequest(app);
exports.scheduledFunction = functions.pubsub.schedule('every hour').onRun(sessionCleanupFunction);