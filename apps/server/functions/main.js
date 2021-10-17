const express = require("express");
const cors = require("cors");
const app = express();
const admin = require("firebase-admin");
const { v4: uuidv4 } = require("uuid");
const { Pool } = require("pg");
const axios = require("axios");
const {
  uniqueNamesGenerator,
  adjectives,
  animals,
  names,
} = require("unique-names-generator");

const Heroku = require("heroku-client");
const { SecretManagerServiceClient } = require("@google-cloud/secret-manager");

admin.initializeApp();
const db = admin.firestore();

const {
  Rules,
  EmptyPlayerStats,
  PlayerType,
  createPlayer,
  GameActionTypes,
  endGameReduction,
  attackReduction,
  buildReduction,
  finishBuildPhaseReduction,
  finishTurnReduction,
  chooseStartReduction,
  SurrenderCosts,
  Board,
  NotificationReasonType,
  EntityDescriptors,
  finalLevel,
  translate,
  setCurrentLanguage,
  isValidLanguage,
  getDefaultLanguage,
  translationKeys,
  computeAwards,
} = require("@battlechoc/battlechoc-shared-functions");

const parseConnectionString = require("pg-connection-string").parse;

initDatabaseConnection = async () => {
  if (process.env.NODE_ENV === "development") {
    return new Pool({
      host: "34.89.31.252",
      user: "battlechoc-service-account",
      password: "***REMOVED***",
      database: "battlechoc",
      max: 1,
    });
  } else if (process.env.NODE_ENV === "test") {
    return new Pool({
      host: "localhost",
      user: "postgres",
      password: "hackersdontcare",
      database: "battlechoc",
      max: 1,
    });
  } else {
    try {
      const entry = await db.collection("config").doc("db").get();
      const dbConnectionString = Buffer.from(
        entry.data().url,
        "base64"
      ).toString("utf8");
      const config = parseConnectionString(dbConnectionString);
      config.max = 1;
      config.ssl = {
        rejectUnauthorized: false,
      };
      console.log(JSON.stringify(config));
      return new Pool(config);
    } catch (error) {
      console.error("could not fetch database connection to heroku");
      console.error(JSON.stringify(error));
    }
  }
};

var _dbPool = {};
dbPool = async () => {
  if (typeof _dbPool.query == "function") {
    return _dbPool;
  } else {
    return (_dbPool = await initDatabaseConnection());
  }
};

const randomNameGeneratorConfig = {
  dictionaries: [adjectives, names, animals],
  separator: "",
  length: 3,
  style: "capital",
};

const GameResultReason = Object.freeze({
  NORMAL: "normal",
  SYSTEM: "system",
  SURRENDERED: "surrendered",
  TIMEOUT: "timeout",
});

const whitelist = [
  "https://battlechoc.dev",
  "https://battlechoc.com",
  "http://localhost:3000",
  "https://localhost:3000",
  "https://battlechoc.firebaseapp.com",
  "https://192.168.178.56:3000",
  "chrome-extension://fhbjgbiflinjbdggehcddcbncdddomop",
];
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || whitelist.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      let error = new Error("Not allowed by CORS");
      console.warn("Access denied (CORS) for origin " + origin);
      error.statusCode = 403;
      callback(error);
    }
  },
};

app.use(express.json());

if (process.env.NODE_ENV !== "test") {
  app.use(cors(corsOptions));
}

app.use(async (req, res, next) => {
  if (process.env.NODE_ENV === "test") {
    req.user = { uid: req.body.uid || "1337-1337-1337-1337" };
    return next();
  }

  if (!req.headers.authorization) {
    return res.status(403).end();
  }

  if (!req.headers["battlechoc-pwa-version"]) {
    req.battlechocPwaVersion = 0;
    console.log("PWA version of this request is older than 01.01.2020");
  } else {
    req.battlechocPwaVersion = req.headers["battlechoc-pwa-version"];
    console.log("PWA version of this request is " + req.battlechocPwaVersion);
  }

  if (!req.headers["battlechoc-pwa-date"]) {
    req.battlechocPwaDate = 0;
  } else {
    req.battlechocPwaDate = req.headers["battlechoc-pwa-date"];
  }

  if (!req.headers["battlechoc-android-version"]) {
    req.battlechocAndroidVersion = 0;
  } else {
    req.battlechocAndroidVersion = req.headers["battlechoc-android-version"];
    console.log("Incomming request from android app");
    console.log(
      "Android app version of this request is " + req.battlechocAndroidVersion
    );
  }

  let authorization = req.headers.authorization.split(" ");
  if (authorization.length === 2) {
    try {
      var token = await admin.auth().verifyIdToken(authorization[1]);
    } catch (error) {
      return res.status(403).json({ error: error.toString() });
    }

    req.user = token;
    next();
  } else {
    return res.status(403).end();
  }
});

class Reducer {
  static updateState(state, action, orderedEvents) {
    console.log(action.type);
    switch (action.type) {
      case GameActionTypes.chooseField:
        return chooseFieldReduction(state, action);
      case GameActionTypes.chooseStart:
        return chooseStartReduction(state, action);
      case GameActionTypes.finishTurn:
        updateLastNotification(state.id, null);
        return finishTurnReduction(state, action);
      case GameActionTypes.finishBuildPhase:
        return finishBuildPhaseReduction(state, action);
      case GameActionTypes.build:
        return buildReduction(state, action);
      case GameActionTypes.attack:
        return attackReduction(state, action);
      case GameActionTypes.endGame:
        updateTrackRecord(
          state,
          action,
          GameResultReason.NORMAL,
          orderedEvents
        );
        emitEndGameNotification(state, action);
        return endGameReduction(state, action);
    }
  }
}

const getPlayerMessagingPermissionTokens = async (userId) => {
  const tokens = [];
  try {
    playerPermissions = await db.collection("permissions").doc(userId).get();
    for (const permission of playerPermissions.data().permissions) {
      if (typeof permission.token !== "undefined") {
        tokens.push(permission);
      }
    }
  } catch (err) {
    console.warn("Cannot fetch tokens for player ", userId, err);
  }
  return tokens;
};

const getPlayerFromId = async (userId) => {
  const result = await db.collection("players").doc(userId).get();
  if (result.exists) {
    return result.data();
  } else {
    return undefined;
  }
};

const getPlayerDocFromId = async (userId) => {
  return await db.collection('players').doc(userId).get();
}

const getPlayerFromName = async (name) => {
  const result = await db.collection("players").where("name", "==", name).get();
  if (result.empty) {
    return undefined;
  } else {
    for (let player of result.docs) {
      return player.data();
    }
    return undefined;
  }
};

const calculateCoinsFromTrackRecord = (trackRecord) => {
  if (typeof trackRecord !== "undefined" && trackRecord.length > 0) {
    return trackRecord.reduce((currentCoins, gameStats) => {
      let coins =
        gameStats.attacks +
        gameStats.builtEntities * 2 +
        gameStats.espionages * 10 +
        gameStats.moltenFields * 50;
      if (typeof gameStats.awards !== "undefined") {
        coins = gameStats.awards.reduce(
          (previous, current) => current.coins + previous,
          0
        );
      }

      if (
        typeof gameStats.winners === "undefined" ||
        gameStats.winners.length === 0 ||
        (typeof gameStats.lost === "undefined" &&
          typeof gameStats.won === "undefined")
      ) {
        // no coins for still running games or undefined stats data
        coins = 0;
      } else {
        if (gameStats.builtEntities === 0) {
          console.log("adding surrender costs only");
          coins = SurrenderCosts;
        }

        if (gameStats.lost === true && gameStats.won !== true) {
          // no coins for lost games
          coins = 0;
        } else if (gameStats.lost === gameStats.won) {
          // half the coins for draw games
          coins = Math.floor(coins / 2);
        }
      }
      return currentCoins + coins;
    }, 0);
  }
  return 0;
};

const computePlayerLevel = (player) => {
  return Object.values(player.level).reduce(
    (level, current) => level + current,
    0
  );
};

const computeTrackRecordStatsFromId = async (playerId) => {
  const stats = { losses: 0, winnings: 0, drawn: 0 };
  try {
    const trackRecord = await db.collection("trackRecords").doc(playerId).get();
    if (trackRecord.exists) {
      for (record of trackRecord.data().records) {
        if (record.result == "won") {
          stats.winnings = stats.winnings + 1;
        } else if (record.result == "lost") {
          stats.losses = stats.losses + 1;
        } else if (record.result == "drawn") {
          stats.drawn = stats.drawn + 1;
        }
      }
    }
  } catch (err) {
    console.warn("Could not determine player track record stats.", err);
  }
  return stats;
};

const computeRankFromScore = async (score) => {
  try {
    const ranks = await db
      .collection("players")
      .where("score", ">", score)
      .get();
    const ranksAnonymous = await db
      .collection("players")
      .where("score", ">", score)
      .where("name", "==", "Chocnonymous")
      .get();
    return ranks.size - ranksAnonymous.size + 1;
  } catch (err) {
    console.warn("Could not determine player track record stats.", err);
  }
};

const getListOfTrackRecordIds = async (playerId) => {
  let existingTrackRecordIds = [];
  try {
    const trackRecord = await db.collection("trackRecords").doc(playerId).get();
    if (trackRecord.exists) {
      for (record of trackRecord.data().records) {
        existingTrackRecordIds.push(record.recordId);
      }
    }
  } catch (err) {
    console.warn(
      "Could not retrieve list of already existing track records for " + userId
    );
    console.warn(err);
  }
  return existingTrackRecordIds;
};

const createTrackRecordObjectFromPlayerId = async (playerId) => {
  const trackRecords = [];
  try {
    const trackRecord = await db.collection("trackRecords").doc(playerId).get();
    if (trackRecord.exists) {
      for (record of trackRecord.data().records) {
        trackRecords.push({
          attacks: record.stats.entitiesDestroyed,
          builtEntities: record.stats.entitiesBuilt,
          espionages: record.stats.entitiesRevealed,
          moltenFields: record.stats.entitiesMolten,
          awards: record.awards,
          lost: record.result === "lost",
          won: record.result === "won",
          winners:
            record.result !== "open" && typeof record.winner !== "undefined"
              ? [
                  {
                    id: record.winner,
                    type:
                      record.winner_type === "npc"
                        ? "PlayerType.AUGUSTUS_GLOOP"
                        : "PlayerType.HUMAN",
                  },
                ]
              : [],
        });
      }
    }
  } catch (err) {
    console.error(
      "Cannot create trackRecord json from firestore objects.",
      err
    );
  }
  return trackRecords;
};

const createPlayerStatsObject = async (
  playerDoc,
  withId = false,
  withTrackRecord = false
) => {
  try {
    const player = {};
    if (withId === true) {
      player.id = playerDoc.id;
    }
    if (withTrackRecord === true) {
      player.trackRecord = await createTrackRecordObjectFromPlayerId(
        playerDoc.id
      );
    }
    const playerData = playerDoc.data();
    const trackStats = await computeTrackRecordStatsFromId(playerDoc.id);
    player.losses = trackStats.losses;
    player.winnings = trackStats.winnings;
    player.drawn = trackStats.drawn;
    player.username = playerData.name;
    player.coins = playerData.coins;
    player.score = playerData.score;
    player.level = playerData.level;
    player.tutorialStarted = playerData.tutorial.started;
    player.tutorialSkipped = playerData.tutorial.skipped;
    player.tutorialFinished = playerData.tutorial.finished;
    return player;
  } catch (err) {
    console.error(
      "Could not create player stats object from given firestore document.",
      err
    );
    return undefined;
  }
};

const createPlayerInfoObject = async (playerDoc) => {
  player = playerDoc.data();
  const stats = await computeTrackRecordStatsFromId(playerDoc.id);
  return {
    name: player.name,
    score: player.score,
    level: computePlayerLevel(player),
    losses: stats.losses,
    winnings: stats.winnings,
    drawn: stats.drawn,
    ranking: await computeRankFromScore(player.score)
  };
};

const createPlayerInfoObjects = async (playerDocs) => {
  let players = [];
  for (let playerDoc of playerDocs) {
    players.push(await createPlayerInfoObject(playerDoc));
  }
  return players;
};

app.post("/debugging/gamestate", async (req, res) => {
  let report = req.body.report;
  if (typeof report === "undefined" || typeof report.reported === "undefined") {
    console.warn("Invalid report element given.", report);
    return res.status(403).json({ error: "Invalid or malformed argument." });
  } else {
    try {
      await db.collection("reports").add(report);
    } catch (err) {
      console.error("Could not insert error report from client.", err);
      return res.status(500).json({ error: "Could not persist error report." });
    }
  }
});

app.get("/user/friends", async (req, res) => {
  try {
    const playerDoc = await db.collection('players').doc(req.user.uid).get();
    if (playerDoc.exists) {
      const friends = [];
      console.log(playerDoc.data().friends.length);
      if (playerDoc.data().friends.length > 0) {
        res.json(await createPlayerInfoObjects(
          (await db.collection('players').where(admin.firestore.FieldPath.documentId(), 'in', playerDoc.data().friends).get()).docs
        ));
      } else {
        res.json([]);
      }
      res.json(friends);
    } else {
      return res.status(404).json({ 'error': 'REQUESTING PLAYER DOES NOT EXIST' });
    }
  } catch (err) {
    console.warn("Could not retrieve friends list.", err);
    res.status(500).json({ error: "Could not retrieve friends list." });
  }
});

app.post("/user/friend", async (req, res) => {
  try {
    const friendDocs = await db
      .collection("players")
      .where("name", "==", req.body.friend)
      .get();
    if (!friendDocs.empty) {
      const playerObject = await db
        .collection("players")
        .doc(req.user.uid)
        .get();
      if (playerObject.exists) {
        const friendsList = playerObject.data().friends;
        for (let friend of friendDocs.docs) {
          if (!friendsList.includes(friend.id)) {
            friendsList.push(friend.id);
          }
        }
        await db
          .collection("players")
          .doc(req.user.uid)
          .update({ friends: friendsList });
        res.status(200).end();
      } else {
        console.error('Request from unknown player "' + req.user.uid);
        res
          .status(404)
          .json({ error: 'Request from unknown player "' + req.user.uid });
      }
    } else {
      console.error(
        'Player with name "' + req.body.friend + '" does not exist'
      );
      res.status(404).json({
        error: 'Player with name "' + req.body.friend + '" does not exist',
      });
    }
  } catch (err) {
    console.warn("Could not insert player to friendslist.", err);
    res.status(500).json({ error: err });
  }
});

app.delete("/user/friend", async (req, res) => {
  try {
    const friendDocs = await db
      .collection("players")
      .where("name", "==", req.body.friend)
      .get();
    if (!friendDocs.empty) {
      const playerObject = await db
        .collection("players")
        .doc(req.user.uid)
        .get();
      if (playerObject.exists) {
        let friendsList = playerObject.data().friends;
        for (let friend of friendDocs.docs) {
          friendsList = friendsList.filter((value, index, array) => {
            return value != friend.id;
          });
        }
        await db
          .collection("players")
          .doc(req.user.uid)
          .update({ friends: friendsList });
        res.status(200).end();
      } else {
        console.error('Request from unknown player "' + req.user.uid);
        res
          .status(404)
          .json({ error: 'Request from unknown player "' + req.user.uid });
      }
    } else {
      console.error(
        'Player with name "' + req.body.friend + '" does not exist'
      );
      res.status(404).json({
        error: 'Player with name "' + req.body.friend + '" does not exist',
      });
    }
  } catch (err) {
    console.warn("Could not remove player from friendslist.", err);
    res.status(500).json({ error: err });
  }
});

app.get("/query/user/:name", async (req, res) => {
  try {
    const requestedName = req.params.name;
    const requestedNameLowercase = requestedName.toLocaleLowerCase();
    const requestedNameUppercase = "AAAAA" + requestedName.toLocaleUpperCase();
    const playerDocs = await db
      .collection("players")
      .where("name", ">=", requestedNameUppercase)
      .where("name", "<=", requestedNameLowercase)
      .get();
    const matchingPlayers = [];
    if (!playerDocs.empty) {
      for (let playerDoc of playerDocs.docs) {
        if (
          playerDoc
            .data()
            .name.toLocaleLowerCase()
            .includes(requestedNameLowercase)
        ) {
          matchingPlayers.push(await createPlayerInfoObject(playerDoc));
        }
      }
    }
    res.json(matchingPlayers);
  } catch (err) {
    console.warn("Could not search for player", err);
    res
      .status(500)
      .json({ error: "Could not search for player with given name." });
  }
});

const addEventQueue = async (eventQueue) => {
  if (process.env.NODE_ENV !== "test") {
    return await db.collection("multiplayerEventQueues").add(eventQueue);
  } else {
    const id = uuidv4();
    await (
      await dbPool()
    ).query(
      "INSERT INTO multiplayerEventQueues(id, sessionEventQueue) VALUES ($1, $2)",
      [id, eventQueue]
    );
    return { id: id };
  }
};

app.post("/user/tutorial/started", async (req, res) => {
  try {
    const playerDoc = await db.collection("players").doc(req.user.uid).get();
    if (playerDoc.exists) {
      player = playerDoc.data();
      player.tutorial.started = true;
      player.tutorial.skipped = false;
      await db
        .collection("players")
        .doc(req.user.uid)
        .update({ tutorial: player.tutorial });
      res
        .status(200)
        .json({ stats: await createPlayerStatsObject(playerDoc, true, true) });
    } else {
      res.status(404).json({
        error: 'Player with uid "' + req.user.uid + '" does not exist',
      });
    }
  } catch (err) {
    console.warn("Could not update tutorial started state of player.", err);
    res.status(500).json({ error: err });
  }
});

app.post("/user/tutorial/skipped", async (req, res) => {
  try {
    const playerDoc = await db.collection("players").doc(req.user.uid).get();
    if (playerDoc.exists) {
      player = playerDoc.data();
      player.tutorial.started = false;
      player.tutorial.skipped = true;
      await db
        .collection("players")
        .doc(req.user.uid)
        .update({ tutorial: player.tutorial });
      res
        .status(200)
        .json({ stats: await createPlayerStatsObject(playerDoc, true, true) });
    } else {
      res.status(404).json({
        error: 'Player with uid "' + req.user.uid + '" does not exist',
      });
    }
  } catch (err) {
    console.warn("Could not update tutorial skipped state of player.", err);
    res.status(500).json({ error: err });
  }
});

app.post("/user/tutorial/finished", async (req, res) => {
  try {
    const playerDoc = await db.collection("players").doc(req.user.uid).get();
    if (playerDoc.exists) {
      player = playerDoc.data();
      if (!player.tutorial.finished) {
        player.coins = player.coins + 100;
        player.score = player.score + 100;
      }
      player.tutorial.started = true;
      player.tutorial.skipped = false;
      player.tutorial.finished = true;
      await db.collection("players").doc(req.user.uid).update({
        tutorial: player.tutorial,
        coins: player.coins,
        score: player.score,
      });
      res
        .status(200)
        .json({ stats: await createPlayerStatsObject(playerDoc, true, true) });
    } else {
      res.status(404).json({
        error: 'Player with uid "' + req.user.uid + '" does not exist',
      });
    }
  } catch (err) {
    console.warn("Could not update tutorial finished state of player.", err);
    res.status(500).json({ error: err });
  }
});

app.post("/user/notify", async (req, res) => {
  try {
    const session = await getSessionData(req.body.sessionId);
    if (typeof session != "undefined") {
      const currentDateTime = new Date().getTime();
      const lastNotifiedTime =
        typeof session.last_notification === "undefined" ||
        session.last_notification === null
          ? 0
          : session.last_notification.getTime();
      if (currentDateTime - lastNotifiedTime > 1000 * 60 * 60 * 4) {
        if (
          session.game.players[session.game.currentPlayerIndex].id !==
          req.user.uid
        ) {
          updateLastNotification(req.body.sessionId, new Date());
          const playerName = (await getPlayerFromId(req.user.uid)).name;

          const receiverPlayerDoc = await getPlayerFromName(
            session.game.players[session.game.currentPlayerIndex].name
          );
          if (
            typeof receiverPlayerDoc === "undefined" ||
            !receiverPlayerDoc.exists
          ) {
            console.error("Could not emit notification");
            return res.status(404).json({
              error:
                'NOTIFICATION RECEIVER "' +
                session.game.players[session.game.currentPlayerIndex].name +
                '" DOES NOT EXIST',
            });
          }

          const receiverPlayer = receiverPlayerDoc.data();
          if (typeof receiverPlayer.language !== "undefined") {
            setCurrentLanguage(receiverPlayer.language);
          }

          await emitPlayerNotification(
            session.game.players[session.game.currentPlayerIndex].id,
            req.body.sessionId,
            translate(
              translationKeys.SERVER_NOTIFICATION_REMEMBER_TURN_TITLE,
              playerName
            ),
            translate(translationKeys.SERVER_NOTIFICATION_REMEMBER_TURN_BODY),
            NotificationReasonType.REMEMBER_TURN,
            "https://battlechoc.com/session/" + req.body.sessionId
          );
          const sessions = await getAllActiveMultiplayerSessionsForPlayer(
            req.user.uid
          );
          res.json({ sessions: sessions });
        } else {
          console.warn("Cannot notify yourself.");
          res.status(400).json({ error: "CANNOT NOTIFY YOURSELF" });
        }
      }
    } else {
      console.error(
        "Trying to notify player in non existing multiplayer session. " +
          req.body.sessionId
      );
      res.status(404).json({
        error: "CANNOT SOMEONE WITHIN A NON EXISTING MULTIPLAYER SESSION",
      });
    }
  } catch (err) {
    console.error("Could not notify player in session. " + JSON.stringify(err));
    res.status(500).json({ error: "COULD NOT NOTIFY PLAYER IN SESSION" });
  }
});

app.post("/user/challenge", async (req, res) => {
  const opponentPlayerDoc = await getPlayerFromName(req.body.opponent);
  if (typeof opponentPlayerDoc === "undefined" || !opponentPlayerDoc.exists) {
    res
      .status(404)
      .json({ error: 'OPPONENT "' + req.body.opponent + '" DOES NOT EXIST' });
  } else {
    const opponentPlayer = opponentPlayerDoc.data();
    const opponent = await createPlayerStatsObject(opponentPlayerDoc, true);
    if (opponent.score < 1000) {
      console.error(
        "Challenged player's score is too low to be challenged. " +
          opponent.score
      );
      res.status(400).json({
        error:
          "CHALLENGED OPPONENT HAS A SCORE THAT IS TOO LOW. " + opponent.score,
      });
    } else {
      if (typeof opponentPlayer.language !== "undefined") {
        setCurrentLanguage(opponentPlayer.language);
      }

      if (opponent.id === req.user.uid) {
        res
          .status(400)
          .json({ error: "CANNOT CREATE A GAME CHALLENGING YOURSELF" });
      } else {
        const playerDoc = await getPlayerDocFromId(req.user.uid);
        if (typeof playerDoc === 'undefined' || !playerDoc.exists) {
          res.status(404).json({ error: 'PLAYER NOT FOUND' });
        } else {
          const player = await createPlayerStatsObject(playerDoc, true);
          const coinToss = Math.round(Math.random());

          let opponentLevel = opponent.level;
          if (typeof opponentLevel === "undefined") {
            opponentLevel = EmptyPlayerStats.level;
          }

          let playerLevel = player.level;
          if (typeof playerLevel === "undefined") {
            playerLevel = EmptyPlayerStats.level;
          }

          const sessionEventQueue = {
            player_0_events: [],
            player_1_events: [],
            playerIds: [opponent.id, req.user.uid],
            lastProcessedEvent: [0, 0],
          };

          try {
            const databaseSession = await addEventQueue(sessionEventQueue);
            const initialGameState = {
              players: [
                createPlayer(
                  req.body.opponent,
                  "PlayerType.HUMAN",
                  opponentLevel,
                  sessionEventQueue.playerIds[0]
                ),
                createPlayer(
                  player.username,
                  "PlayerType.HUMAN",
                  playerLevel,
                  sessionEventQueue.playerIds[1]
                ),
              ],
              currentPlayerIndex: coinToss,
              state: "GameStateTypes.CHOOSE_FIELD_OR_START",
              isRunning: true,
              winners: [],
              board: Board.generate(
                { rows: 10, cols: 10 },
                Math.round(Math.random() * Math.pow(10, 8))
              ),
            };
            db.collection("multiplayerSessions")
              .doc(databaseSession.id)
              .set({
                player1: sessionEventQueue.playerIds[0],
                player2: sessionEventQueue.playerIds[1],
                gamestate: initialGameState,
                created: new Date(Date.now()),
                updated: new Date(Date.now()),
                lastAction: new Date(Date.now()),
                turns: 0,
              });
            await emitPlayerNotification(
              opponent.id,
              databaseSession.id,
              translate(
                translationKeys.SERVER_NOTIFICATION_CHALLENGE_TITLE,
                player.username
              ),
              translate(translationKeys.SERVER_NOTIFICATION_CHALLENGE_BODY),
              NotificationReasonType.CHALLENGED,
              "https://battlechoc.com/session/" + databaseSession.id
            );

            res.json({ sessionId: databaseSession.id });
          } catch (error) {
            console.log(error.toString());
            res.status(500).json({ error: error.toString() });
          }
        }
      }
    }
  }
});

const updateTrackRecord = async (
  session,
  endGameAction,
  resultReason,
  orderedEvents
) => {
  const winner = session.game.players.find(
    (player) => player.id === endGameAction.payload.winners[0].id
  );
  const winnerIndex = session.game.players.indexOf(winner);
  winner.statistics.won = true;
  winner.statistics.lost = false;
  if (typeof session.game.winners === "undefined") {
    session.game.winners = endGameAction.payload.winners;
  }
  const awards = computeAwards(session.game, winnerIndex, orderedEvents);
  console.log(JSON.stringify(awards));
  let winnerRecords = [
    { ...winner.statistics, winners: [winner], awards: awards },
  ];
  if (
    (await addTrackRecord(winner.id, winnerRecords[0], resultReason)) === true
  ) {
    await updatePlayerStats(winner.id, winnerRecords, awards);
  }

  const looser = session.game.players.find(
    (player) => player.id !== endGameAction.payload.winners[0].id
  );
  looser.statistics.won = false;
  looser.statistics.lost = true;
  let looserRecords = [{ ...looser.statistics, winners: [winner] }];
  if (
    (await addTrackRecord(looser.id, looserRecords[0], resultReason)) === true
  ) {
    await updatePlayerStats(looser.id, looserRecords);
  }
};

const emitEndGameNotification = async (session, endGameAction) => {
  const winner = session.game.players.find(
    (player) => player.id === endGameAction.payload.winners[0].id
  );
  const looser = session.game.players.find(
    (player) => player.id !== endGameAction.payload.winners[0].id
  );
  const receiverPlayerDoc = await getPlayerFromName(looser.name);
  if (typeof receiverPlayerDoc === "undefined" || !receiverPlayerDoc.exists) {
    console.error("Could not emit notification");
    return res.status(404).json({
      error: 'NOTIFICATION RECEIVER "' + looser.name + '" DOES NOT EXIST',
    });
  }

  const receiverPlayer = receiverPlayerDoc.data();
  if (typeof receiverPlayer.language !== "undefined") {
    setCurrentLanguage(receiverPlayer.language);
  }

  await emitPlayerNotification(
    looser.id,
    session.id,
    translate(translationKeys.SERVER_NOTIFICATION_GAME_LOST_TITLE),
    translate(translationKeys.SERVER_NOTIFICATION_GAME_LOST_BODY, winner.name),
    NotificationReasonType.GAME_LOST,
    "https://battlechoc.com/"
  );
};

const processEvents = (session, events, eventQueue) => {
  let unprocessedEvents = 0;
  let processedEvents = 0;
  let faildValidityChecks = 0;
  console.log("Processing events " + JSON.stringify(eventQueue));
  console.log(
    "events.length = " +
      events.length +
      " queue length = " +
      (eventQueue.lastProcessedEvent[0] + eventQueue.lastProcessedEvent[1])
  );
  if (
    events.length >
    eventQueue.lastProcessedEvent[0] + eventQueue.lastProcessedEvent[1]
  ) {
    events
      .filter((event) => !event.hasOwnProperty("processed"))
      .forEach((event) => {
        if (event.payload.issuer === session.game.players[0].id) {
          if (
            session.game.currentPlayerIndex === 0 ||
            event.type === GameActionTypes.endGame
          ) {
            if (eventQueue.lastProcessedEvent[0] === event.index) {
              const validityCheckResult = Rules.isActionValid(
                session.game,
                event
              );
              if (validityCheckResult === true) {
                console.log("Event valid: " + JSON.stringify(event));
                updateLastAction(session.id, new Date());
                Reducer.updateState(session, event, events);
                eventQueue.lastProcessedEvent[0] += 1;
                processedEvents += 1;
                event.processed = true;
              } else {
                console.warn(
                  "Validity check failed for " + JSON.stringify(event)
                );
                console.error(JSON.stringify(validityCheckResult));
                if (!event.hasOwnProperty("invalid")) {
                  eventQueue.lastProcessedEvent[0] += 1;
                  event.invalid = true;
                }
                faildValidityChecks += 1;
              }
            } else {
              unprocessedEvents += 1;
            }
          } else {
            unprocessedEvents += 1;
          }
        } else {
          if (
            session.game.currentPlayerIndex === 1 ||
            event.type === GameActionTypes.endGame
          ) {
            if (eventQueue.lastProcessedEvent[1] === event.index) {
              const validityCheckResult = Rules.isActionValid(
                session.game,
                event
              );
              if (validityCheckResult === true) {
                console.log("Event valid: " + JSON.stringify(event));
                updateLastAction(session.id, new Date());
                Reducer.updateState(session, event, events);
                eventQueue.lastProcessedEvent[1] += 1;
                processedEvents += 1;
                event.processed = true;
              } else {
                console.error(
                  "Validity check failed for " + JSON.stringify(event)
                );
                console.error(JSON.stringify(validityCheckResult));
                if (!event.hasOwnProperty("invalid")) {
                  eventQueue.lastProcessedEvent[1] += 1;
                  event.invalid = true;
                }
                faildValidityChecks += 1;
              }
            } else {
              unprocessedEvents += 1;
            }
          } else {
            unprocessedEvents += 1;
          }
        }
      });
  }

  return {
    unprocessedEvents: unprocessedEvents,
    processedEvents: processedEvents,
    faildValidityChecks: faildValidityChecks,
  };
};

const processEventsInOrder = (session, eventQueue) => {
  let events = orderedEventsFromQueue(eventQueue);
  const timeout = new Date().getTime() + 10000;

  var { unprocessedEvents, processedEvents, faildValidityChecks } =
    processEvents(session, events, eventQueue);
  console.log(unprocessedEvents, processedEvents, faildValidityChecks);
  if (faildValidityChecks > 0) {
    console.error("SOME EVENTS DID NOT PASS THE VALIDITY CHECK");
  }

  while (
    unprocessedEvents > 0 &&
    processedEvents > 0 &&
    new Date().getTime() > timeout
  ) {
    ({ unprocessedEvents, processedEvents, faildValidityChecks } =
      processEvents(session, events, eventQueue));
    console.log(unprocessedEvents, processedEvents, faildValidityChecks);
    if (faildValidityChecks > 0) {
      console.error("SOME EVENTS DID NOT PASS THE VALIDITY CHECK");
    }
  }

  if (new Date().getTime() > timeout) {
    console.error("Event loop hang up " + JSON.stringify(eventQueue));
    return { error: "INCORRECT EVENTS LOOP HANG UP" };
  } else {
    return { done: "PROCESSED EVENTS" };
  }
};

const updateLastChanged = async (date, sessionId) => {
  await db
    .collection("multiplayerSessions")
    .doc(sessionId)
    .update({ updated: date });
};

const getSessionData = async (sessionId) => {
  try {
    const sessionDoc = await db
      .collection("multiplayerSessions")
      .doc(sessionId)
      .get();
    if (sessionDoc.exists) {
      const sessionData = sessionDoc.data();
      return {
        id: sessionDoc.id,
        game: sessionData.gamestate,
        created: sessionData.created,
        last_changed: sessionData.updated,
        last_action: sessionData.lastAction,
        last_notification: sessionData.notified,
        players: [sessionData.player1, sessionData.player2],
        turns: sessionData.turns,
      };
    } else {
      console.warn(
        "Trying to fetch data for non existing session with id " + sessionId
      );
      return undefined;
    }
  } catch (err) {
    console.error("Could not fetch session from database.", err);
    return undefined;
  }
};

const updateLastNotification = async (id, notificationTimestamp) => {
  try {
    await db
      .collection("multiplayerSessions")
      .doc(id)
      .update({ notified: notificationTimestamp });
  } catch (err) {
    console.error(err);
  }
};

const updateLastAction = async (id, actionProcessedTimestamp) => {
  try {
    await db
      .collection("multiplayerSessions")
      .doc(id)
      .update({ lastAction: actionProcessedTimestamp });
  } catch (err) {
    console.error(err);
  }
};

const updateSessionGameState = async (id, gameState, turns, lastChanged) => {
  try {
    await db
      .collection("multiplayerSessions")
      .doc(id)
      .update({ gamestate: gameState, updated: lastChanges, turns: turns });
  } catch (err) {
    console.error(err);
  }
};

app.get("/multiplayer/session/:id", async (req, res) => {
  try {
    const session = await getSessionData(req.params.id);
    if (typeof session === "undefined") {
      res.status(404).json({ error: "REQUESTED SESSION DOES NOT EXIST" });
    } else {
      res.json(session);
    }
  } catch (err) {
    console.error("Could not retrieve session data.", err);
    res.status(500).json({ error: "COULD NOT RETRIEVE SESSION DATA." });
  }
});

const getEventQueue = async (eventQueueId) => {
  if (process.env.NODE_ENV !== "test") {
    return await db
      .collection("multiplayerEventQueues")
      .doc(eventQueueId)
      .get();
  } else {
    const eventQueue = await (
      await dbPool()
    ).query(
      "SELECT sessionEventQueue FROM multiplayerEventQueues WHERE id=$1",
      [eventQueueId]
    );
    return {
      exists: true,
      data: () => eventQueue.rows[0].sessioneventqueue,
    };
  }
};

const enqueueEvent = async (sessionId, event, playerIndex) => {
  if (process.env.NODE_ENV !== "test") {
    if (playerIndex === 0) {
      await db
        .collection("multiplayerEventQueues")
        .doc(sessionId)
        .update({
          player_0_events: admin.firestore.FieldValue.arrayUnion(event),
        });
    } else {
      await db
        .collection("multiplayerEventQueues")
        .doc(sessionId)
        .update({
          player_1_events: admin.firestore.FieldValue.arrayUnion(event),
        });
    }
  } else {
    const eventQueueQueryResult = await (
      await dbPool()
    ).query(
      "SELECT sessionEventQueue FROM multiplayerEventQueues WHERE id=$1",
      [sessionId]
    );
    let eventQueue = eventQueueQueryResult.rows[0].sessioneventqueue;
    if (playerIndex === 0) {
      eventQueue.player_0_events.push(event);
    } else {
      eventQueue.player_1_events.push(event);
    }
    await (
      await dbPool()
    ).query(
      "UPDATE multiplayerEventQueues SET sessionEventQueue=$1 WHERE id=$2",
      [eventQueue, sessionId]
    );
  }
};

const updateEventQueue = async (eventQueue, eventQueueId) => {
  if (process.env.NODE_ENV !== "test") {
    await db.collection("multiplayerEventQueues").doc(eventQueueId).update({
      lastProcessedEvent: eventQueue.lastProcessedEvent,
    });
  } else {
    await (
      await dbPool()
    ).query(
      "UPDATE multiplayerEventQueues SET sessionEventQueue=$1 WHERE id=$2",
      [eventQueue, eventQueueId]
    );
  }
};

app.post("/multiplayer/relay/action", async (req, res) => {
  console.log("Called relay event for session " + req.body.sessionId);
  console.log(JSON.stringify(req.body.event));
  let eventQueueDoc = await getEventQueue(req.body.sessionId);
  if (!eventQueueDoc.exists) {
    console.error(
      "Invalid session id given to relay action. " + req.body.sessionId
    );
    res.status(404).json({ error: "EVENT QUEUE FOR SESSION NOT FOUND" });
  } else {
    let eventQueue = eventQueueDoc.data();
    if (!eventQueue.playerIds.some((id) => id === req.user.uid)) {
      console.error(
        "A player is trying to relay an action but is not listed as one of the valid players of that session. " +
          req.body.sessionId +
          " " +
          req.user.uid
      );
      return res.status(401).end();
    }

    const playerIndex = eventQueue.playerIds.findIndex(
      (id) => id === req.body.event.payload.issuer
    );
    if (playerIndex >= 0) {
      try {
        console.log(
          req.body.sessionId + ": Trying to schedule event for execution."
        );
        await enqueueEvent(req.body.sessionId, req.body.event, playerIndex);
        await updateLastChanged(new Date(Date.now()), req.body.sessionId);
        console.log("Event scheduled for execution.");
      } catch (error) {
        console.error(
          `Failed to push event ${req.body.event.toString()} to the event list of player ${playerIndex} due to ${error}`
        );
        return res.status(500).json({ error: error.toString() });
      }
    } else {
      console.error("Unknown action issuer: " + req.body.event.payload.issuer);
      res.status(400).json({ error: "UNKNOWN ISSUER" });
    }

    try {
      eventQueueDoc = await getEventQueue(req.body.sessionId);
    } catch (error) {
      return res.status(500).json({ error: error });
    }

    eventQueue = eventQueueDoc.data();
    let session = await getSessionData(req.body.sessionId);
    let playerId = session.game.currentPlayerIndex;
    console.log(req.body.sessionId + ": Trying to process events.");
    let result = processEventsInOrder(session, eventQueue);
    if (result.hasOwnProperty("error")) {
      console.error("Error while trying to process event");
      res.status(400).json(result);
    } else {
      try {
        const turns =
          typeof eventQueue.player_0_events !== "undefined"
            ? eventQueue.player_0_events.filter(
                (event) => event.type === "battlechoc/gameplay/finishTurn"
              ).length
            : 0;
        console.log("Finished turns of player 0: " + turns);
        console.log(
          "Persisting sessions game state: " + JSON.stringify(session)
        );
        await updateSessionGameState(
          session.id,
          session.game,
          turns,
          new Date(Date.now())
        );
        await updateEventQueue(eventQueue, req.body.sessionId);
        let updatedPlayerId = session.game.currentPlayerIndex;
        if (playerId !== updatedPlayerId) {
          const receiverPlayerDoc = await getPlayerFromName(
            session.game.players[1 - playerId].name
          );
          if (
            typeof receiverPlayerDoc === "undefined" ||
            !receiverPlayerDoc.exists
          ) {
            console.error("Could not emit notification");
            return res.status(404).json({
              error:
                'NOTIFICATION RECEIVER "' +
                session.game.players[1 - playerId].name +
                '" DOES NOT EXIST',
            });
          }

          const receiverPlayer = receiverPlayerDoc.data();
          if (typeof receiverPlayer.language !== "undefined") {
            setCurrentLanguage(receiverPlayer.language);
          }

          await emitPlayerNotification(
            session.game.players[1 - playerId].id,
            req.body.sessionId,
            translate(
              translationKeys.SERVER_NOTIFICATION_TURN_FINISHED_TITLE,
              session.game.players[playerId].name
            ),
            translate(translationKeys.SERVER_NOTIFICATION_TURN_FINISHED_BODY),
            NotificationReasonType.OPPONENT_FINISHED_TURN,
            "https://battlechoc.com/session/" + req.body.sessionId
          );
        }
        res.status(200).end();
      } catch (error) {
        console.log("not able to finish event processing: ", error);
        res.status(500).json({ error: error.toString() });
      }
    }
  }
});

const emitPlayerNotification = async (
  receiverId,
  sessionId,
  title,
  body,
  reason,
  clickAction
) => {
  const permissions = await getPlayerMessagingPermissionTokens(receiverId);
  const expiredTokens = [];

  await Promise.all(
    permissions.map(async (permission) => {
      const payload = {
        to: permission.token,
        notification: {
          title: title,
          body: body,
        },
        data: {
          title: title,
          text: body,
          session: sessionId,
          reason: reason,
          click_action: clickAction,
        },
      };

      console.log("emitting notification to " + permission.token);

      try {
        const response = await axios.post(
          "https://fcm.googleapis.com/fcm/send",
          payload,
          {
            headers: {
              Authorization:
                "key=***REMOVED***",
            },
          }
        );
        if (
          response.data.failure === 1 &&
          typeof response.data.results !== "undefined" &&
          response.data.results.length > 0 &&
          response.data.results[0].error === "NotRegistered"
        ) {
          console.log(
            "Cleanup expired user registration token " + permission.token
          );
          expiredTokens.push(permission.token);
        } else {
          console.log("Successfully sent notification");
          console.log(`Token ${permission.token} is still valid`);
        }
      } catch (error) {
        console.warn("PLAYER NOTIFICATION FAILED" + error.toString());
      }
    })
  );

  if (expiredTokens.length === 0) {
    console.log("No token update needed. All tokens are still valid");
  } else {
    console.log(
      "Updating user tokens because some of them were invalid. Deleted tokens: " +
        expiredTokens.toString()
    );
    playerPermissions = await db
      .collection("permissions")
      .doc(receiverId)
      .get();
    expiredTokens.map((expiredToken) => {
      updatedPermissions = playerPermissions.data();
      const index = updatedPermissions.permissions.findIndex(
        (permission) => permission.token === expiredToken
      );
      if (index > -1) {
        updatedPermissions.permissions.splice(index, 1);
      }
    });
    await db.collection("permissions").doc(receiverId).set(updatedPermissions);
  }
};

const orderedEventsFromQueue = (eventQueue) => {
  let events = eventQueue.player_0_events;
  events = events.concat(eventQueue.player_1_events);
  events.sort((a, b) => {
    if (typeof a.emitted === "undefined") {
      return -1;
    } else if (typeof b.emitted === "undefined") {
      return 1;
    } else {
      if (a.emitted.seconds > b.emitted.seconds) {
        return 1;
      } else if (a.emitted.seconds < b.emitted.seconds) {
        return -1;
      } else {
        return a.emitted.nanoseconds > b.emitted.nanoseconds ? 1 : -1;
      }
    }
  });
  return events;
};

const surrenderGame = async (sessionId, playerId, resultReason) => {
  try {
    var eventQueueDoc = await getEventQueue(sessionId);
  } catch (error) {
    console.error(
      "Could not get multiplayer event queue for session " + sessionId
    );
    return false;
  }

  if (!eventQueueDoc.exists) {
    console.error("Event queue for does not exist for session " + sessionId);
    return false;
  } else {
    let eventQueue = eventQueueDoc.data();
    if (!eventQueue.playerIds.some((id) => id === playerId)) {
      console.error("Surrender game not allowed for " + playerId);
      return false;
    }

    let playerIndex = eventQueue.playerIds.findIndex((id) => id === playerId);
    let endGameEvent = {
      index:
        playerIndex === 0
          ? eventQueue.player_0_events.length
          : eventQueue.player_1_events.length,
      type: "battlechoc/gameplay/endGame",
      payload: {
        winners: [
          { id: eventQueue.playerIds.filter((id) => id !== playerId)[0] },
        ],
        issuer: playerId,
      },
      sessionId: sessionId,
    };

    try {
      await enqueueEvent(sessionId, endGameEvent, playerIndex);
      eventQueue.lastProcessedEvent[playerIndex] += 1;
    } catch (error) {
      console.warn(
        "Failed to push event " +
          endGameEvent.toString() +
          " to the event list of player " +
          playerIndex
      );
      return false;
    }

    let session = await getSessionData(sessionId);
    if (typeof session === "undefined") {
      console.error("Could not find session in database " + sessionId);
      return false;
    }
    session.game.isRunning = false;
    session.game.winners = [];
    session.game.winners.push({
      id: eventQueue.playerIds.filter((id) => id !== playerId)[0],
      type: PlayerType.HUMAN,
    });
    session.game.players.filter(
      (player) => player.id !== playerId
    )[0].statistics.won = true;
    session.game.players.filter(
      (player) => player.id !== playerId
    )[0].statistics.lost = false;
    session.game.players.filter(
      (player) => player.id === playerId
    )[0].statistics.won = false;
    session.game.players.filter(
      (player) => player.id === playerId
    )[0].statistics.lost = true;
    updateTrackRecord(
      session,
      endGameEvent,
      resultReason,
      orderedEventsFromQueue(eventQueue)
    );

    try {
      const turns =
        typeof eventQueue.player_0_events !== "undefined"
          ? eventQueue.player_0_events.filter(
              (event) => event.type === "battlechoc/gameplay/finishTurn"
            ).length
          : 0;
      await updateSessionGameState(
        session.id,
        session.game,
        turns,
        new Date(Date.now())
      );
      await updateEventQueue(eventQueue, sessionId);
      const looserId = playerId;
      const winnerId = eventQueue.playerIds.filter((id) => id !== playerId)[0];
      let looserName = "";
      let looserDoc = await db.collection("players").doc(looserId).get();
      if (looserDoc.existingPlayer) {
        looserName = looserDoc.data().name;
      }
      let winnerName = "";
      let winnerDoc = await db.collection("players").doc(winnerId).get();
      if (winnerDoc.existingPlayer) {
        winnerName = winnerDoc.data().name;
      }
      return {
        winner: {
          id: winnerId,
          name: winnerName,
        },
        looser: {
          id: looserId,
          name: looserName,
        },
      };
    } catch (err) {
      console.error("Could not update session state " + sessionId);
      return false;
    }
  }
};

app.post("/surrender", async (req, res) => {
  const surrenderingPlayer = await getPlayerFromId(req.user.uid);
  if (surrenderingPlayer) {
    if (surrenderingPlayer.coins >= SurrenderCosts) {
      await db
        .collection("players")
        .doc(req.user.uid)
        .update({
          coins: admin.firestore.FieldValue.increment(-SurrenderCosts),
        });
      const result = await surrenderGame(
        req.body.sessionId,
        req.user.uid,
        GameResultReason.SURRENDERED
      );
      if (result !== false) {
        const receiverPlayerDoc = await getPlayerFromName(result.winner.name);
        if (
          typeof receiverPlayerDoc === "undefined" ||
          !receiverPlayerDoc.exists
        ) {
          console.error("Could not emit notification");
          return res.status(404).json({
            error:
              'NOTIFICATION RECEIVER "' +
              result.winner.name +
              '" DOES NOT EXIST',
          });
        }

        const receiverPlayer = receiverPlayerDoc.data();
        if (typeof receiverPlayer.language !== "undefined") {
          setCurrentLanguage(receiverPlayer.language);
        }

        await emitPlayerNotification(
          result.winner.id,
          req.body.sessionId,
          translate(
            translationKeys.SERVER_NOTIFICATION_OPPONENT_SURENDERED_TITLE,
            result.looser.name
          ),
          translate(
            translationKeys.SERVER_NOTIFICATION_OPPONENT_SURENDERED_BODY
          ),
          NotificationReasonType.OPPONENT_SURRENDERED_GAME,
          "https://battlechoc.com/"
        );
        res.status(200).end();
      } else {
        return res.status(500).json({ error: "COULD NOT SURRENDER GAME" });
      }
    } else {
      return res
        .status(400)
        .json({ error: "NOT ALLOWED TO SURRENDER. TOO FEW COINS" });
    }
  } else {
    return res.status(404).json({ error: "REQUESTING PLAYER DOES NOT EXIST" });
  }
});

const getAllActiveMultiplayerSessionsForPlayer = async (playerId) => {
  const sessions = [];
  const player1Res = await db
    .collection("multiplayerSessions")
    .where("player1", "==", playerId)
    .where("gamestate.isRunning", "==", true)
    .get();
  const player2Res = await db
    .collection("multiplayerSessions")
    .where("player2", "==", playerId)
    .where("gamestate.isRunning", "==", true)
    .get();
  const allSessionDocs = player1Res.docs.concat(player2Res.docs);
  await Promise.all(
    allSessionDocs.map(async (sessionDoc) => {
      const sessionData = sessionDoc.data();
      const playerIndex =
        sessionData.gamestate.players[0].id === playerId ? 0 : 1;
      const session = {
        id: sessionDoc.id,
        players: [sessionData.player1, sessionData.player2],
        last_changed: sessionData.updated.getTime(),
        last_notification:
          typeof sessionData.notified === "undefined" ||
          sessionData.notified === null
            ? 0
            : sessionData.notified.getTime(),
        created: sessionData.created.getTime(),
        myTurn: sessionData.gamestate.currentPlayerIndex === playerIndex,
        turns: sessionData.turns,
        statistics: sessionData.gamestate.players[playerIndex].statistics,
      };

      const opponentId = (sessionData.player1 === playerId) ? sessionData.player2 : sessionData.player1;
      const opponentPlayerDoc = await getPlayerDocFromId(opponentId);
      if (opponentPlayerDoc.exists) {
        const opponent = await createPlayerStatsObject(opponentPlayerDoc, true);
        session.opponent = {
          name: opponent.username,
          ranking: await computeRankFromScore(opponent.score),
          level: opponent.level,
          drawn: opponent.drawn,
          losses: opponent.losses,
          winnings: opponent.winnings
        }
        sessions.push(session);
      }
    })
  );
  return sessions;
};

app.get("/multiplayer/sessions", async (req, res) => {
  try {
    const sessions = await getAllActiveMultiplayerSessionsForPlayer(
      req.user.uid
    );
    res.json({ sessions: sessions });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error });
  }
});

const calculateCosts = (entityType, level) => {
  if (!EntityDescriptors.has(entityType)) {
    throw new Error("Invalid entity type given: " + entityType);
  } else {
    return EntityDescriptors.get(entityType)(level[entityType]).coins;
  }
};

const getMaximumLevel = (entityType, level) => {
  if (!EntityDescriptors.has(entityType)) {
    throw new Error("Invalid entity type given: " + entityType);
  } else {
    let entity = EntityDescriptors.get(entityType)(level[entityType]);
    return entity.hasOwnProperty("level") ? entity.level.max - 1 : finalLevel;
  }
};

app.post("/update/level", async (req, res) => {
  try {
    const player = await getPlayerFromId(req.user.uid);
    if (player) {
      if (typeof player.coins !== "undefined") {
        let level = EmptyPlayerStats.level;
        if (typeof player.level !== "undefined") {
          level = player.level;
        }

        if (req.body.upgrade) {
          const limit = getMaximumLevel(req.body.entityType, level);
          const costs = calculateCosts(req.body.entityType, level);
          if (player.coins < costs) {
            console.warn(
              "Player tries to buy upgrade but cannot afford it",
              req.user.uid
            );
            res.status(400).json({ error: "NOT ENOUGH COINS" });
          } else if (level[req.body.entityType] + 1 > limit) {
            console.warn(
              "Player tries to buy upgrade but already reached max level",
              req.user.uid
            );
            res.status(400).json({ error: "LEVEL LIMIT REACHED" });
          } else {
            level[req.body.entityType] = level[req.body.entityType] + 1;
            await db
              .collection("players")
              .doc(req.user.uid)
              .update({
                coins: admin.firestore.FieldValue.increment(-costs),
                level: level,
              });
            res.json({ coins: player.coins - costs, level: level });
          }
        } else {
          if (level[req.body.entityType] > 0) {
            const previous = {
              level,
              [req.body.entityType]: level[req.body.entityType] - 1,
            };
            const costs = calculateCosts(req.body.entityType, previous);
            const coinBackGuarantee = Math.round(0.666 * costs);
            level[req.body.entityType] = level[req.body.entityType] - 1;
            await db
              .collection("players")
              .doc(req.user.uid)
              .update({
                coins: admin.firestore.FieldValue.increment(coinBackGuarantee),
                level: level,
              });
            res.json({ coins: player.coins + coinBackGuarantee, level: level });
          } else {
            res.status(400).json({ error: "ENTITY LEVEL IS ALREADY ZERO" });
          }
        }
      } else {
        res.status(400).json({ error: "PLAYER HAS NO COINS" });
      }
    } else {
      console.warn(
        "trying to update level of non existing player",
        req.user.uid
      );
      return res.status(404).json({ error: "PLAYER DOES NOT EXIST" });
    }
  } catch (err) {
    console.error("Could not update player level", err);
    res.status(500).json({ error: "COULD NOT UPDATE PLAYER LEVEL" });
  }
});

app.get("/highscore", async (req, res) => {
  try {
    const playerDoc = await db.collection("players").doc(req.user.uid).get();
    if (playerDoc.exists) {
      const pageSize = 10;
      let page = 1;
      if (typeof req.query.page === "undefined") {
        const rank = await computeRankFromScore(playerDoc.data().score);
        page = Math.ceil(rank / pageSize);
      } else {
        page = Number(req.query.page);
      }

      const playersCount = (await db.collection('players').where('score', '>', 0).get()).size;
      let lastPage = Math.ceil(playersCount / pageSize);
      let playersOnPageFiltered = await db.collection('players').where('score', '>', 0).orderBy('score', 'desc').limit(pageSize * page).get();
      pageDocs = playersOnPageFiltered.docs.slice((page - 1) * pageSize);
      const highscore = await createPlayerInfoObjects(pageDocs);
      highscore.sort((a, b) => {
        if (a.ranking > b.ranking) {
          return 1;
        } else if (a.ranking < b.ranking) {
          return -1;
        } else {
          return 0;
        }
      });
      res.json({
        page: page,
        lastPage: lastPage,
        list: highscore,
      });
    } else {
      console.warn("Given player seems not to exist.", req.user.uid);
      res.status(404).json({ error: "Player not found." });
    }
  } catch (err) {
    console.warn("Could not determine rank of player", err);
    res.status(500).json({ error: err.toString() });
  }
});

app.get("/rank", async (req, res) => {
  try {
    const playerDoc = await db.collection("players").doc(req.user.uid).get();
    if (playerDoc.exists) {
      res.json({ ranking: await computeRankFromScore(playerDoc.data().score) });
    } else {
      console.warn("Given player seems not to exist.", req.user.uid);
      res.status(404).json({ error: "Player not found." });
    }
  } catch (err) {
    console.warn("Could not determine rank of player.", err);
    res.status(500).json({ error: err.toString() });
  }
});

app.get("/check/available/:username", async (req, res) => {
  if (
    typeof req.params.username === "undefined" ||
    req.params.username === ""
  ) {
    res.status(400).json({ error: "Username empty" });
  } else {
    try {
      const playerDocs = await db
        .collection("players")
        .where("name", "==", req.params.name)
        .get();
      res.json({
        name: req.params.username,
        available:
          playerDocs.empty &&
          req.params.username.toUpperCase() !== "CHOCNONYMOUS",
      });
    } catch (err) {
      console.warn("Could not check availability of player name.", err);
      res.status(500).json({ error: err.toString() });
    }
  }
});

app.get("/user/name", async (req, res) => {
  try {
    const playerObject = await db.collection("players").doc(req.user.uid).get();
    if (playerObject.exists) {
      res.json({ name: playerObject.data().name });
    } else {
      res.status(404).json({ error: "Player does not exist" });
    }
  } catch (err) {
    console.warn("Could not look up playername", err);
    res.status(500).json({ error: "Could not look up playername" });
  }
});

app.get("/user/:name", async (req, res) => {
  try {
    const playerDocs = await db
      .collection("players")
      .where("name", "==", req.params.name)
      .get();
    if (!playerDocs.empty) {
      res.json(await createPlayerInfoObjects(playerDocs.docs));
    } else {
      res.status(404).json({ error: "Player does not exist" });
    }
  } catch (err) {
    console.warn("Could not lookup player", err);
    res.status(500).json({ error: err.toString() });
  }
});

app.get("/random/opponent", async (req, res) => {
  try {
    invalidOpponentIds = [req.user.uid];
    const player1Res = await db
      .collection("multiplayerSessions")
      .where("player1", "==", req.user.uid)
      .where("gamestate.isRunning", "==", true)
      .get();
    const player2Res = await db
      .collection("multiplayerSessions")
      .where("player2", "==", req.user.uid)
      .where("gamestate.isRunning", "==", true)
      .get();
    const allSessionDocs = player1Res.docs.concat(player2Res.docs);
    for (sessionDoc of allSessionDocs) {
      const sessionData = sessionDoc.data();
      invalidOpponentIds.push((sessionData.player1 === req.user.uid) ? sessionData.player2 : sessionData.player1);
    }
    let opponent = undefined;
    const eventualOpponentDocs = await db
      .collection("players")
      .where("score", ">", 0)
      .limit(5000)
      .get();
    if (!eventualOpponentDocs.empty) {
      let tries = Math.floor(Math.random() * eventualOpponentDocs.size);
      for (let eventualOpponent of eventualOpponentDocs.docs) {
        if (!invalidOpponentIds.includes(eventualOpponent.id)) {
          opponent = eventualOpponent;
          tries = tries - 1;
          if (tries === 0) {
            break;
          }
        }
      }
    }
    if (typeof opponent !== 'undefined') {
      res.json(await createPlayerInfoObject(opponent));
    } else {
      console.warn("Could not find a matching player for ", req.user.uid);
      res.status(404).json({ error: "NO MATCHING PLAYER FOUND" });
    }
  } catch (err) {
    console.error("Failed to determine random opponent", err);
    res.status(500).json({ error: "CANNONT DETERMINE RANDOM OPPONENT" });
  }
});

app.post("/user/permissions", async (req, res) => {
  try {
    let tokenType = "messaging";
    if (req.battlechocAndroidVersion > 0) {
      tokenType = "android-messaging";
    }

    const playerPermissions = await db
      .collection("permissions")
      .doc(req.user.uid)
      .get();
    if (!playerPermissions.exists) {
      await db
        .collection("permissions")
        .doc(req.user.uid)
        .set({ permissions: [{ token: req.body.token, type: tokenType }] });
    } else {
      const updatedPermissions = playerPermissions.data();
      const index = updatedPermissions.permissions.findIndex(
        (permission) => permission.token === expiredToken
      );
      if (index == -1) {
        updatedPermissions.permissions.push({
          token: req.body.token,
          type: tokenType,
        });
        await db
          .collection("permissions")
          .doc(req.user.uid)
          .set(updatedPermissions);
      } else {
        res.status(400).json({ error: "WON'T INSERT DUPLICATE TOKEN ENTRIES" });
      }
    }
    res.status(200).end();
  } catch (err) {
    console.warn("Could not add new permission token for player.", err);
    res.status(500).json({ error: "COULD NOT ADD PERMISSION TOKEN" });
  }
});

const addTrackRecord = async (userId, record, reportedReason) => {
  let gameResult = "draw";
  let winner;
  let winnerType;
  const id = typeof record.id === "undefined" ? uuidv4() : record.id;
  if (
    typeof record.winners === "undefined" ||
    record.winners.length === 0 ||
    (typeof record.lost === "undefined" && typeof record.won === "undefined")
  ) {
    gameResult = "open";
  } else {
    winnerType =
      record.winners[0].type === "PlayerType.HUMAN" ? "human" : "npc";
    winner = record.winners[0].id;
    if (record.won === true && record.lost !== true) {
      gameResult = "won";
    } else if (record.lost === true && record.won !== true) {
      gameResult = "lost";
    }
  }

  try {
    const awards = record.awards || null;
    const trackRecordObject = {
      winnerType: winnerType,
      winner: winner,
      stats: {
        entitiesBuilt: record.builtEntities,
        entitiesDestroyed: record.attacks,
        entitiesMolten: record.moltenFields,
        entitiesRevealed: record.espionages,
      },
      resultReason: reportedReason,
      result: gameResult,
      reported: new Date(),
      recordId: id,
      awards: { awards: awards },
    };
    const playerTrackRecordsDoc = await db
      .collection("trackRecords")
      .doc(userId)
      .get();
    if (playerTrackRecordsDoc.exists) {
      await db
        .collection("trackRecords")
        .doc(userId)
        .update({
          records: admin.firestore.FieldValue.arrayUnion(trackRecordObject),
        });
    } else {
      await db
        .collection("trackRecords")
        .doc(userId)
        .set({
          records: [trackRecordObject],
        });
    }
    return true;
  } catch (err) {
    console.warn(err);
    return false;
  }
};

const fetchPlayerStats = async (userId) => {
  try {
    const playerDoc = await getPlayerDocFromId(userId);
    if (playerDoc.exists) {
      return await createPlayerStatsObject(playerDoc, true, true);
    } else {
      console.error("Could not retrieve player stats.");
      return undefined;
    }
  } catch (err) {
    console.error("Could not retrieve player stats.", err);
    return undefined;
  }
};

const createOrUpdatePlayer = async (userId, player) => {
  try {
    const username = (typeof player.username === 'undefined' || player.username === '') ? EmptyPlayerStats.username : player.username;
    const coins = (typeof player.coins === 'number' && !isNaN(player.coins)) ? player.coins : 0;
    const score = (typeof player.score === 'number' && !isNaN(player.score)) ? player.score : 0;
    const language = (typeof player.language !== 'undefined' && isValidLanguage(player.language)) ? player.language : getDefaultLanguage();
    const level = typeof player.level !== 'undefined' ? player.level : EmptyPlayerStats.level;
    const tutorialStarted = typeof player.tutorialStarted !== 'undefined' ? player.tutorialStarted : false;
    const tutorialSkipped = typeof player.tutorialSkipped !== 'undefined' ? player.tutorialSkipped : false;
    const tutorialFinished = typeof player.tutorialFinished !== 'undefined' ? player.tutorialFinished : false;
    const existingPlayerDoc = await getPlayerDocFromId(userId);
    if (typeof existingPlayerDoc === 'undefined' || !existingPlayerDoc.exists) {
      const playerDocRef = db.collection('players').doc(userId);
      await playerDocRef.set({
        coins: coins,
        created: new Date(),
        friends: [],
        language: language,
        level: level,
        name: username,
        score: score,
        tutorial: {
          finished: tutorialFinished,
          skipped: tutorialSkipped,
          started: tutorialStarted,
        },
      });
      const playerDoc = await playerDocRef.get();
      if (playerDoc.exists) {
        await Promise.all(
          player.trackRecord.map(async (record) => {
            await addTrackRecord(userId, record, GameResultReason.NORMAL);
          })
        );
        return await createPlayerStatsObject(playerDoc, true, true);
      } else {
        console.error("Could not create a new player.");
        return undefined;
      }
    } else {
      const playerDocRef = db.collection("players").doc(userId);
      await playerDocRef.update({
        name: username,
        coins: coins,
        score: score,
        language: language,
        level: level,
        tutorial: {
          started: tutorialStarted,
          skipped: tutorialSkipped,
          finished: tutorialFinished,
        },
      });
      const playerDoc = await playerDocRef.get();
      if (playerDoc.exists) {
        await Promise.all(
          player.trackRecord.map(async (record) => {
            await addTrackRecord(userId, record, GameResultReason.NORMAL);
          })
        );
        return await createPlayerStatsObject(playerDoc, true, true);
      } else {
        console.error("Could not create a new player.");
        return await createPlayerStatsObject(existingPlayerDoc, true, true);
      }
    }
  } catch (err) {
    console.error("Could not create a new player.", err);
    return undefined;
  }
};

const createNewPlayer = async (userId) => {
  try {
    const existingPlayerDoc = await getPlayerDocFromId(userId);
    if (typeof existingPlayerDoc === 'undefined' || !existingPlayerDoc.exists) {
      const coins = 0;
      const score = 0;
      const username = EmptyPlayerStats.username;
      const language = getDefaultLanguage();
      const level = EmptyPlayerStats.level;
      const playerDocRef = db.collection("players").doc(userId);
      await playerDocRef.set({
        coins: coins,
        created: new Date(),
        friends: [],
        language: language,
        level: level,
        name: username,
        score: score,
        tutorial: {
          finished: false,
          skipped: false,
          started: false,
        },
      });
      const playerDoc = await playerDocRef.get();
      if (playerDoc.exists) {
        return await createPlayerStatsObject(playerDoc);
      } else {
        console.error("Could not create a new player.");
        return undefined;
      }
    } else {
      return await createPlayerStatsObject(existingPlayerDoc, true, true);
    }
  } catch (err) {
    console.error("Could not create a new player.", err);
    return undefined;
  }
};

const updatePlayerStats = async (userId, stats) => {
  try {
    if (typeof stats !== "undefined") {
      const coins = calculateCoinsFromTrackRecord(stats);
      const playerDocRef = db.collection("players").doc(userId);
      await playerDocRef.update({
        coins: admin.firestore.FieldValue.increment(coins),
        score: admin.firestore.FieldValue.increment(coins),
      });
      const playerDoc = await playerDocRef.get();
      if (playerDoc.exists) {
        return await createPlayerStatsObject(playerDoc, true, true);
      } else {
        console.error("Could not update player stats. Coins lost!");
        return undefined;
      }
    } else {
      return (await createPlayerStatsObject(await getPlayerDocFromId(userId), true, true));
    }
  } catch (err) {
    console.error("Could not update player stats. Coins lost!", err);
    return undefined;
  }
};

app.post("/user/merge", async (req, res) => {
  try {
    const existingPlayerDoc = await getPlayerDocFromId(req.user.uid);
    if (!existingPlayerDoc.exists) {
      const mergedData = await createOrUpdatePlayer(req.user.uid, req.body.playerInfo);
      res.status(200).json({ mergedPlayerInfo: mergedData });
    } else {
      let recordsAdded = [];
      if (typeof req.body.playerInfo.trackRecord !== "undefined") {
        const existingTrackRecordIds = await getListOfTrackRecordIds(
          req.user.uid
        );
        await Promise.all(
          req.body.playerInfo.trackRecord.map(async (record) => {
            if (
              typeof record.id !== "undefined" &&
              !existingTrackRecordIds.includes(record.id)
            ) {
              if (
                (await addTrackRecord(
                  req.user.uid,
                  record,
                  GameResultReason.NORMAL
                )) === true
              ) {
                recordsAdded.push(record);
              }
            }
          })
        );
      }
      const mergedData = await updatePlayerStats(req.user.uid, recordsAdded);
      res.status(200).json({ mergedPlayerInfo: mergedData });
    }
  } catch (err) {
    console.warn("Could not merge player stats.", err);
    res.status(500).json({ error: "COULD NOT MERGE PLAYER STATS" });
  }
});

app.post("/user/trackrecords", async (req, res) => {
  try {
    if (typeof req.body.stats !== "undefined") {
      let recordsAdded = [];
      await Promise.all(
        req.body.stats.map(async (record) => {
          if (
            (await addTrackRecord(
              req.user.uid,
              record,
              GameResultReason.NORMAL
            )) === true
          ) {
            recordsAdded.push(record);
          }
        })
      );
      let playerStats = await updatePlayerStats(req.user.uid, recordsAdded);
      res.status(200).json({ stats: playerStats });
    } else {
      res.status(400).json({ error: "INVALID REQUEST PARAMETERS" });
    }
  } catch (err) {
    console.warn("Could not add a new track records for player.", err);
    res.status(500).json({ error: "COULD NOT ADD TRACK RECORDS" });
  }
});

app.get("/user", async (req, res) => {
  try {
    let playerStats = await fetchPlayerStats(req.user.uid);
    if (typeof playerStats !== "undefined") {
      res.status(200).json({ stats: playerStats });
    } else {
      console.warn("Could not find stats for player ", req.user.uid);
      res.status(404).json({ error: "PLAYER NOT FOUND" });
    }
  } catch (err) {
    console.warn("Could not retrieve player stats.", err);
    res.status(500).json({ error: "COULD NOT FETCH PLAYER STATS" });
  }
});

app.get("/generaterandomname", async (req, res) => {
  try {
    const maxTries = 20;
    let generatedName;
    let nameFound = false;
    let regex = /^([a-zA-Z][a-zA-Z0-9_]{2,24})$/;
    for (let tries = 0; tries < maxTries; tries++) {
      generatedName = uniqueNamesGenerator(randomNameGeneratorConfig);
      if (
        regex.test(generatedName) &&
        generatedName.toUpperCase() !== "CHOCNONYMOUS"
      ) {
        if (typeof (await getPlayerFromName(generatedName)) === "undefined") {
          nameFound = true;
          break;
        }
      }
    }
    res
      .status(200)
      .json({ username: nameFound ? generatedName : "Chocnonymous" });
  } catch (err) {
    console.error("Could not generate a new random username.", err);
    res.status(500).json({ error: "COULD NOT GENERATE A NEW RANDOM USERNAME" });
  }
});

app.post("/user", async (req, res) => {
  try {
    let playerStats =
      typeof req.body.stats === "undefined"
        ? await createNewPlayer(req.user.uid)
        : await createOrUpdatePlayer(req.user.uid, req.body.stats);
    res.status(200).json({ stats: playerStats });
  } catch (err) {
    console.warn("Could not create a new player.", err);
    res.status(500).json({ error: "COULD NOT CREATE NEW PLAYER" });
  }
});

app.post("/user/username", async (req, res) => {
  try {
    let regex = /^([a-zA-Z][a-zA-Z0-9_]{2,24})$/;
    if (
      regex.test(req.body.username) &&
      req.body.username.toUpperCase() !== "CHOCNONYMOUS"
    ) {
      if (
        (
          await db
            .collection("players")
            .where("name", "==", req.body.username)
            .limit(1)
            .get()
        ).empty
      ) {
        await db.collection("players").doc(req.user.uid).update({
          name: req.body.username,
        });
        res.end();
      } else {
        res
          .status(400)
          .json({ error: "PLAYER WITH GIVEN NAME DOES ALREADY EXIST" });
      }
    } else {
      res.status(400).json({ error: "USERNAME NOT VALID" });
    }
  } catch (err) {
    console.warn(
      "Could not create a new player with given name or update the name of an already existing player.",
      err
    );
    res
      .status(500)
      .json({ error: "COULD NOT CREATE PLAYER OR UPDATE PLAYER NAME" });
  }
});

app.post("/user/language", async (req, res) => {
  if (isValidLanguage(req.body.language)) {
    try {
      setCurrentLanguage(req.body.language);
      await db.collection("players").doc(req.user.uid).update({
        language: req.body.language,
      });
      res.json({ language: req.body.language });
    } catch (err) {
      console.warn("Could not update players language.", err);
      res.status(500).json({ error: err.toString() });
    }
  } else {
    res.status(400).json({ error: "INVALID LANGUAGE GIVEN" });
  }
});

const fetchDatabaseConnectionString = async () => {
  try {
    const secretManagerServiceClient = new SecretManagerServiceClient();
    const [secretVersion] =
      await secretManagerServiceClient.accessSecretVersion({
        name: "projects/618424349380/secrets/heroku-token/versions/1",
      });
    const herokuToken = secretVersion.payload.data.toString("utf8");
    const heroku = new Heroku({ token: herokuToken });
    const herokuResponse = await heroku.get("/apps/battlechoc/config-vars");
    const herokuDatabaseUrl = herokuResponse.DATABASE_URL;
    if (typeof herokuDatabaseUrl !== "undefined") {
      await db
        .collection("config")
        .doc("db")
        .set({ url: Buffer.from(herokuDatabaseUrl).toString("base64") });
    }
    const entry = await db.collection("config").doc("db").get();
    if (entry.exists) {
      console.log(entry.data().url);
      const buffer = Buffer.from(entry.data().url, "base64");
      console.log(buffer.toString("ascii"));
    }
  } catch (error) {
    console.error(
      "Could not retrieve and set new database URL environment variable."
    );
    console.dir(error);
  }
};

const sessionCleanupFunction = async () => {
  console.log("Cleaning up stale multiplayer sessions ...");
  try {
    const sessions = [];
    console.log("executing query to cleamup");
    const sessionDocs = await db
      .collection("multiplayerSessions")
      .where("gamestate.isRunning", "==", true)
      .where("lastAction", "<=", new Date(Date.now() - 24 * 60 * 60 * 1000))
      .get();
    console.log("executed query to cleanup");
    await Promise.all(
      sessionDocs.docs.map(async (sessionDoc) => {
        const sessionData = sessionDoc.data();
        console.log(
          "Trying to cleanup session: " + JSON.stringify(sessionData)
        );
        const looserUid =
          sessionData.gamestate.players[
            sessionData.gamestate.currentPlayerIndex
          ].id;
        const result = await surrenderGame(
          sessionDoc.id,
          looserUid,
          GameResultReason.TIMEOUT
        );
        if (result !== false) {
          sessions.push({ id: sessionDoc.id });

          // notify the winner
          const winnerPlayerDoc = await getPlayerFromName(result.winner.name);
          if (
            typeof winnerPlayerDoc === "undefined" ||
            !winnerPlayerDoc.exists
          ) {
            console.error(
              'NOTIFICATION RECEIVER "' +
                result.winner.name +
                '" DOES NOT EXIST'
            );
          }

          const winnerPlayer = winnerPlayerDoc.data();
          if (typeof winnerPlayer.language !== "undefined") {
            setCurrentLanguage(winnerPlayer.language);
          }

          await emitPlayerNotification(
            result.winner.id,
            sessionDoc.id,
            translate(
              translationKeys.SERVER_NOTIFICATION_SESSION_TIMEDOUT_WINNER_TITLE,
              result.looser.name
            ),
            translate(
              translationKeys.SERVER_NOTIFICATION_SESSION_TIMEDOUT_WINNER_BODY,
              result.looser.name
            ),
            NotificationReasonType.SESSION_TIMEOUT_GAME_WON,
            "https://battlechoc.com/"
          );

          // notify the looser
          const looserPlayerDoc = await getPlayerFromName(result.looser.name);
          if (
            typeof looserPlayerDoc === "undefined" ||
            !looserPlayerDoc.exists
          ) {
            console.error(
              'NOTIFICATION RECEIVER "' +
                result.looser.name +
                '" DOES NOT EXIST'
            );
          }

          const looserPlayer = looserPlayerDoc.data();
          if (typeof looserPlayer.language === "undefined") {
            setCurrentLanguage(looserPlayer.language);
          }

          await emitPlayerNotification(
            result.looser.id,
            sessionDoc.id,
            translate(
              translationKeys.SERVER_NOTIFICATION_SESSION_TIMEDOUT_LOOSER_TITLE,
              result.winner.name
            ),
            translate(
              translationKeys.SERVER_NOTIFICATION_SESSION_TIMEDOUT_LOOSER_BODY
            ),
            NotificationReasonType.SESSION_TIMEOUT_GAME_LOST,
            "https://battlechoc.com/"
          );
        } else {
          console.error("Could not surrender session " + sessionDoc.id);
        }
      })
    );
    console.log("Cleaned up session: " + JSON.stringify(sessions));
  } catch (error) {
    console.error(error);
  }
};

module.exports = {
  app,
  dbPool,
  sessionCleanupFunction,
  fetchDatabaseConnectionString,
};
