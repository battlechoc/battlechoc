const functions = require("firebase-functions");
const {
  app,
  sessionCleanupFunction,
  fetchDatabaseConnectionString,
} = require("./main");

exports.api = functions.region("europe-west2").https.onRequest(app);

exports.cleanupSession = functions
  .region("europe-west2")
  .pubsub.schedule("0 * * * *")
  .onRun(sessionCleanupFunction);

exports.fetchDatabaseConnectionString = functions
  .region("europe-west2")
  .pubsub.schedule("every 5 minutes")
  .onRun(fetchDatabaseConnectionString);
