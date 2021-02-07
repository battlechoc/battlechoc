const functions = require('firebase-functions');
const app = require('./main').app;
const sessionCleanupFunction = require('./main').sessionCleanupFunction;
const fetchDatabaseConnectionString = require('./main').fetchDatabaseConnectionString;
exports.api = functions.region('europe-west2').https.onRequest(app);
exports.cleanupSession = functions.region('europe-west2').pubsub.schedule('0 * * * *').onRun(sessionCleanupFunction);
exports.fetchDatabaseConnectionString = functions.region('europe-west2').pubsub.schedule('every 5 minutes').onRun(fetchDatabaseConnectionString);