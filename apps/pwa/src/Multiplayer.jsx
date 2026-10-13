import {
  onAuthStateChanged,
  signInAnonymously,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { doc, getDoc, onSnapshot, Timestamp } from "firebase/firestore";
import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
} from "firebase/messaging";
import { app, auth, firestore } from "./firebase";
import OfflineStore from "./OfflineStore";
import {
  GameActionTypes,
  AttackType,
  EmptyPlayerStats,
  NotificationReasonType,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import { Jukebox } from "./ui/misc";
import {
  ServerRequest,
  generateNewAndroidMessagingToken,
  setAndroidDefaults,
} from "./helper/settings";
import logger from "./helper/logger";
import { v4 as uuidv4 } from "uuid";

let signinOnAppStart = true;
class Multiplayer {
  constructor() {
    this.localPlayerIndex = 0;
    this.callbacks = {
      updatePlayerStats: () =>
        logger.warn("calling updatePlayerStats without beeing initialized"),
      notifyPlayerSignedIn: () =>
        logger.warn("calling notifyPlayerSignedIn without beeing initialized"),
      updateMultiplayerSessions: () =>
        logger.warn(
          "calling updateMultiplayerSessions without beeing initialized"
        ),
      loadFriendsList: () =>
        logger.warn("calling loadFriendsList without beeing initialized"),
      setPlayerRank: () =>
        logger.warn("calling setPlayerRank without beeing initialized"),
      startSessionRefresh: () =>
        logger.warn("calling stopSessionRefresh without beeing initialized"),
      stopSessionRefresh: () =>
        logger.warn("calling stopSessionRefresh without beeing initialized"),
      showQuickMessage: () =>
        logger.warn("calling showQuickMessage without beeing initialized"),
      detonateAtPosition: () =>
        logger.warn("calling detonateAtPosition without beeing initialized"),
      showNotification: () =>
        logger.warn("calling showNotification without beeing initialized"),
    };

    onAuthStateChanged(auth, (user) => {
      this.authStateChanged(user);
    });

    isSupported()
      .then((supported) => {
        if (supported) {
          this.messaging = getMessaging(app);
          onMessage(this.messaging, (payload) => {
            this.handlePushMessage(payload);
          });
        }
      })
      .catch((error) => logger.info(error));
  }

  shouldAskForNotificationPermission() {
    return (
      auth.currentUser &&
      "Notification" in window &&
      Notification.permission === "default"
    );
  }

  handlePushMessage(payload) {
    console.log("Push message received: " + JSON.stringify(payload));

    if (
      this.currentGameSession === undefined ||
      this.currentGameSession !== payload.data.session ||
      ![
        NotificationReasonType.OPPONENT_FINISHED_TURN,
        NotificationReasonType.GAME_LOST,
      ].includes(payload.data.reason)
    ) {
      this.callbacks.showQuickMessage({
        text: payload.data.title + " " + payload.data.text,
        variant: "info",
      });
    }

    if (
      [
        NotificationReasonType.CHALLENGED,
        NotificationReasonType.OPPONENT_SURRENDERED_GAME,
        NotificationReasonType.GAME_LOST,
        NotificationReasonType.SESSION_TIMEOUT_GAME_LOST,
        NotificationReasonType.SESSION_TIMEOUT_GAME_WON,
      ].includes(payload.data.reason)
    ) {
      console.log("updating multiplayer sessions");
      this.getMultiplayerSessions(() =>
        this.callbacks.showQuickMessage({ text: t(tr.SESSION_REFRESH_FAILED) })
      );
    }
  }

  askForNotificationPermission() {
    Notification.requestPermission().then(async (permission) => {
      if (permission === "granted" && typeof this.messaging !== "undefined") {
        // the app's own service worker handles background messages, firebase
        // falls back to /firebase-messaging-sw.js when none is registered (dev)
        const serviceWorkerRegistration =
          "serviceWorker" in navigator
            ? await navigator.serviceWorker.getRegistration()
            : undefined;
        getToken(this.messaging, {
          vapidKey:
            "BJ6zc8pE57SS98ocjLmtHBuaGgDjIirTpAALyYIR_zywwBJbmssDWhbn78WPhoJfjN28htOBI4bwlVzjwHMCqak",
          serviceWorkerRegistration,
        })
          .then(async (currentToken) => {
            if (currentToken) {
              await ServerRequest("post", "/user/permissions", {
                token: currentToken,
              });
            } else {
              logger.info(
                "No Instance ID token available. Request permission to generate one."
              );
            }
          })
          .catch((error) => {
            logger.info("An error occurred while retrieving token. ", error);
          });
      } else {
        logger.info("Unable to get permission to notify.");
      }
    });
  }

  async setRandomPlayerName() {
    const generatedName = await this.fetchRandomName();
    ServerRequest("post", "/user/username", { username: generatedName })
      .then(async () => {
        this.callbacks.showNotification({
          title: t(tr.PLAYER_NAME_GENERATED_TITLE),
          message: t(tr.PLAYER_NAME_GENERATED_BODY, generatedName),
        });
        this.callbacks.updatePlayerStats({ username: generatedName });
        OfflineStore.playerStore.get("stats").then((playerStats) => {
          playerStats.username = generatedName;
          OfflineStore.playerStore.set("stats", playerStats);
        });
      })
      .catch((error) => console.warn(error));
  }
  async authStateChanged(user) {
    if (user) {
      if (typeof this.callbacks.notifyPlayerSignedIn !== "undefined") {
        this.callbacks.notifyPlayerSignedIn({
          email: user.email,
          uid: user.uid,
          name: user.displayName,
          isAnonymous: user.isAnonymous,
        });
      }

      if (signinOnAppStart) {
        setAndroidDefaults();
        signinOnAppStart = false;
      } else {
        generateNewAndroidMessagingToken();
      }

      try {
        await ServerRequest("post", "/user");
        const mergedStats = await this.mergePlayerStats();
        if (typeof mergedStats !== "undefined") {
          if (
            mergedStats.username === EmptyPlayerStats.username &&
            (mergedStats.tutorialFinished === true ||
              mergedStats.tutorialSkipped === true)
          ) {
            await this.setRandomPlayerName();
          }
        }
      } catch (err) {
        logger.info("could not create player entry.", err);
      }

      this.localPlayer = user;

      if (window.navigator.onLine) {
        this.fetchFriendsList();
        this.computeRank();
      }
    } else {
      logger.info("try to signin");
      this.localPlayer = undefined;
      this.signInAnonymouslyIfNotAlreadySignedIn();
    }
  }

  registerCallbacks(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  isLocalPlayer(playerIdx) {
    return playerIdx === this.localPlayerIndex;
  }

  computeTrackRecordStats(trackRecord) {
    if (typeof trackRecord !== "undefined" && auth.currentUser) {
      let finishedGames = trackRecord.filter(
        (record) => typeof record.winners !== "undefined"
      );
      const winnings = finishedGames.filter(
        (record) =>
          record.winners.filter(
            (winner) =>
              winner.id === auth.currentUser.uid ||
              winner.name === "Charlie Bucket"
          ).length === 1
      ).length;
      const drawn = finishedGames.filter(
        (record) =>
          typeof record.winners !== "undefined" && record.winners.length > 1
      ).length;
      return {
        winnings: winnings,
        drawn: drawn,
        losses: finishedGames.length - winnings - drawn,
      };
    } else {
      return { winnings: 0, drawn: 0, losses: 0 };
    }
  }

  async pushGameStats(gameStats) {
    if (auth.currentUser) {
      try {
        const data = (
          await ServerRequest("post", "/user/trackrecords", {
            stats: gameStats,
          })
        ).data;
        this.callbacks.updatePlayerStats(data.stats);
      } catch (err) {
        logger.warn("Could not update player track record.");
        logger.warn(err);
      }
    } else {
      OfflineStore.playerStore
        .get("stats")
        .then((playerStats) => {
          if (typeof playerStats.trackRecord === "undefined") {
            playerStats.trackRecord = [];
          }
          playerStats.trackRecord.push(...gameStats);
          let trackRecordStats = this.computeTrackRecordStats(
            playerStats.trackRecord
          );
          playerStats.winnings = trackRecordStats.winnings;
          playerStats.drawn = trackRecordStats.drawn;
          playerStats.losses = trackRecordStats.losses;
          let calculatedCoins = this.calculateCoinsFromTrackRecord(gameStats);
          playerStats.coins = playerStats.coins + calculatedCoins;
          playerStats.score = isNaN(playerStats.score)
            ? calculatedCoins
            : playerStats.score + calculatedCoins;
          try {
            OfflineStore.playerStore.set("stats", playerStats);
          } catch (error) {
            logger.warn(error);
          }
          this.callbacks.updatePlayerStats(playerStats);
        })
        .catch((err) =>
          logger.warn("could not retrieve offline player stats", err)
        );
    }
  }

  async mergePlayerStats() {
    if (auth.currentUser) {
      try {
        var offlineAccount = await OfflineStore.playerStore.get("stats");
      } catch (err) {
        logger.warn("failed to get player infos from offline store", err);
        return this.fetchPlayerStats();
      }

      if (typeof offlineAccount === "undefined") {
        return this.fetchPlayerStats();
      } else {
        try {
          const data = (
            await ServerRequest("post", "/user/merge", {
              playerInfo: offlineAccount,
            })
          ).data;
          OfflineStore.playerStore
            .set("stats", data.mergedPlayerInfo)
            .catch((error) =>
              logger.warn("could not set new player stats in idb.", error)
            );
          this.callbacks.updatePlayerStats(data.mergedPlayerInfo);
          return data.mergedPlayerInfo;
        } catch (err) {
          logger.warn("Could not merge stats.", err);
          return this.fetchPlayerStats();
        }
      }
    }
  }

  async fetchPlayerStats() {
    if (auth.currentUser) {
      let data;
      try {
        data = (await ServerRequest("get", "/user")).data;
        if (typeof data.stats === "undefined") {
          data = await ServerRequest("post", "/user");
        }
      } catch (err) {
        logger.warn("not able to fetch player stats from backend", err);
        data = { stats: EmptyPlayerStats };
      }

      try {
        this.callbacks.updatePlayerStats(data.stats);
      } catch (err) {
        return logger.warn("cannot persist player coins", err);
      }
    } else {
      try {
        var offlineAccount = await OfflineStore.playerStore.get("stats");
      } catch (error) {
        OfflineStore.playerStore.set("stats", EmptyPlayerStats);
        this.callbacks.updatePlayerStats(EmptyPlayerStats);
        return logger.warn(error);
      }

      if (typeof offlineAccount === "undefined") {
        OfflineStore.playerStore.set("stats", EmptyPlayerStats);
        this.callbacks.updatePlayerStats(EmptyPlayerStats);
      } else {
        let trackRecordStats = this.computeTrackRecordStats(
          offlineAccount.trackRecord
        );
        offlineAccount.winnings = trackRecordStats.winnings;
        offlineAccount.drawn = trackRecordStats.drawn;
        offlineAccount.losses = trackRecordStats.losses;
        this.callbacks.updatePlayerStats(offlineAccount);
      }
    }
  }

  calculateCoinsFromTrackRecord(trackRecord, runningGame = false) {
    if (typeof trackRecord !== "undefined" && trackRecord.length > 0) {
      return trackRecord.reduce((currentCoins, gameStats) => {
        let coins =
          gameStats.attacks +
          gameStats.builtEntities * 2 +
          gameStats.espionages * 10 +
          gameStats.moltenFields * 50;
        if (runningGame) {
          return coins;
        }

        if (typeof gameStats.winners !== "undefined") {
          if (gameStats.winners.length === 1) {
            if (!this.isLocalPlayer(gameStats.winners[0].idx)) {
              coins = 0;
            }
          } else if (gameStats.winners.length === 2) {
            coins = Math.floor(coins / 2);
          }
        } else {
          if (gameStats.lost) {
            coins = 0;
          }
        }

        return currentCoins + coins;
      }, 0);
    }
    return 0;
  }

  async tutorialStarted() {
    OfflineStore.playerStore
      .get("stats")
      .then((playerStats) => {
        playerStats.tutorialStarted = true;
        playerStats.tutorialSkipped = false;
        try {
          OfflineStore.playerStore.set("stats", playerStats);
        } catch (error) {
          logger.warn(error);
        }
        this.callbacks.updatePlayerStats(playerStats);
      })
      .catch((err) =>
        logger.warn("could not retrieve offline player stats", err)
      );

    if (auth.currentUser) {
      let retryCounter = 0;
      const intervalId = setInterval(async () => {
        try {
          const data = (await ServerRequest("post", "/user/tutorial/started"))
            .data;
          clearInterval(intervalId);
          this.callbacks.updatePlayerStats(data.stats);
        } catch (err) {
          retryCounter++;
          logger.info(
            "Could not update player tutorial started state. Retry " +
              retryCounter
          );
          logger.info(err);
          if (retryCounter >= 3) {
            logger.warn(
              "Updating tutorial state did not work even with 3 retries."
            );
            clearInterval(intervalId);
          }
        }
      }, 2000);
    }
  }

  async tutorialSkipped() {
    OfflineStore.playerStore
      .get("stats")
      .then((playerStats) => {
        playerStats.tutorialStarted = false;
        playerStats.tutorialSkipped = true;
        try {
          OfflineStore.playerStore.set("stats", playerStats);
        } catch (error) {
          logger.warn(error);
        }
        this.callbacks.updatePlayerStats(playerStats);
      })
      .catch((err) =>
        logger.warn("could not retrieve offline player stats", err)
      );

    if (auth.currentUser) {
      let retryCounter = 0;
      const intervalId = setInterval(async () => {
        try {
          const data = (await ServerRequest("post", "/user/tutorial/skipped"))
            .data;
          clearInterval(intervalId);
          console.log(data);
          if (data.stats.username === EmptyPlayerStats.username) {
            await this.setRandomPlayerName();
          }
          this.callbacks.updatePlayerStats(data.stats);
        } catch (err) {
          retryCounter++;
          logger.info(
            "Could not update player tutorial skipped state. Retry " +
              retryCounter
          );
          logger.info(err);
          if (retryCounter >= 3) {
            logger.warn(
              "Updating tutorial state did not work even with 3 retries."
            );
            clearInterval(intervalId);
          }
        }
      }, 2000);
    }
  }

  async tutorialFinished() {
    OfflineStore.playerStore
      .get("stats")
      .then((playerStats) => {
        playerStats.tutorialFinished = true;
        try {
          OfflineStore.playerStore.set("stats", playerStats);
        } catch (error) {
          logger.warn(error);
        }
        this.callbacks.updatePlayerStats(playerStats);
      })
      .catch((err) =>
        logger.warn("could not retrieve offline player stats", err)
      );

    if (auth.currentUser) {
      try {
        const data = (await ServerRequest("post", "/user/tutorial/finished"))
          .data;
        this.callbacks.updatePlayerStats(data.stats);
      } catch (err) {
        logger.warn("Could not update player tutorial finished state.");
        logger.warn(err);
      }
    }
  }

  async updatePlayerTutorialInfos(playerInfos) {
    try {
      OfflineStore.playerStore.set("stats", playerInfos);
    } catch (error) {
      logger.warn(error);
    }

    if (auth.currentUser) {
      try {
        await ServerRequest("post", "/user/tutorialinfos", {
          infos: {
            tutorialStarted: playerInfos.tutorialStarted,
            tutorialFinished: playerInfos.tutorialFinished,
            tutorialSkipped: playerInfos.tutorialSkipped,
          },
        });
      } catch (err) {
        logger.warn("Could not update player tutorial infos");
        logger.warn(err);
      }
    }
  }

  signOut(notifyPlayerSignedOut) {
    firebaseSignOut(auth)
      .then(() => {
        if (typeof notifyPlayerSignedOut === "function") {
          notifyPlayerSignedOut();
        } else {
          logger.warn("player notification callback is not a function");
        }
      })
      .catch((error) => logger.info("Error while sign out", error));
  }

  async challengePlayer(playerName) {
    if (typeof playerName !== "undefined" && auth.currentUser !== "undefined") {
      try {
        await ServerRequest("post", "/user/challenge", {
          opponent: playerName,
        });
      } catch (error) {
        logger.warn(error);
      }
    }
  }

  async getMultiplayerSessions(errorHandler = null, returnSession = null) {
    if (auth.currentUser) {
      this.callbacks.startSessionRefresh();
      try {
        let response = await ServerRequest("get", "/multiplayer/sessions");
        this.callbacks.updateMultiplayerSessions(response.data.sessions);
        if (returnSession) {
          return response.data.sessions.filter(
            (session) => session.id === returnSession
          );
        }
      } catch (error) {
        logger.warn("error while fetching player sessions " + error);
        if (typeof errorHandler === "function") {
          errorHandler();
        }
      } finally {
        this.callbacks.stopSessionRefresh();
      }
    } else {
      logger.warn("user not logged in");
    }
  }

  async fetchFriendsList() {
    if (auth.currentUser) {
      try {
        let response = await ServerRequest("get", "/user/friends");
        this.callbacks.loadFriendsList(response.data);
        return response.data;
      } catch (error) {
        logger.warn("error while fetching friends " + error);
      }
    } else {
      logger.warn("user not logged in");
    }
  }

  async computeRank() {
    if (auth.currentUser) {
      try {
        let data = (await ServerRequest("get", "/rank")).data;
        this.callbacks.setPlayerRank(data.ranking);
      } catch {
        this.callbacks.setPlayerRank("Offline");
      }
    } else {
      this.callbacks.setPlayerRank("Offline");
    }
  }

  async removeFriend(friend) {
    if (auth.currentUser) {
      try {
        await ServerRequest("delete", "/user/friend", { friend: friend });
        await this.fetchFriendsList();
      } catch (error) {
        logger.warn("error while removing friend " + error);
      }
    } else {
      logger.warn("user not logged in");
    }
  }

  async addFriend(friend) {
    if (auth.currentUser) {
      try {
        await ServerRequest("post", "/user/friend/", { friend: friend });
        await this.fetchFriendsList();
      } catch (error) {
        logger.warn("error while adding friend " + error);
      }
    } else {
      logger.warn("user not logged in");
    }
  }

  async fetchHighscore(page) {
    if (auth.currentUser) {
      try {
        return (
          await ServerRequest(
            "get",
            "/highscore" + (typeof page !== "undefined" ? "?page=" + page : "")
          )
        ).data;
      } catch (error) {
        logger.warn("error while adding friend " + error);
        throw error;
      }
    } else {
      logger.warn("user not logged in");
    }
  }

  async findRandomPlayer() {
    return (await ServerRequest("get", "/random/opponent")).data;
  }

  async surrenderGame(sessionId) {
    return ServerRequest("post", "/surrender", { sessionId: sessionId });
  }

  signInAnonymouslyIfNotAlreadySignedIn() {
    return new Promise((resolve, reject) => {
      if (auth.currentUser) {
        logger.info("already signed in. will not sign in again as anonymous");
        resolve(auth.currentUser);
      } else {
        logger.info("not signed in. trying to sign in anonymously");
        signInAnonymously(auth)
          .then((signInResult) => {
            logger.info("done signing in. logged in anonymously.");
            logger.info(signInResult);
            this.callbacks.notifyPlayerSignedIn({
              uid: signInResult.user.uid,
              isAnonymous: signInResult.user.isAnonymous,
            });
            resolve(signInResult.user);
          })
          .catch((error) => {
            reject(error);
          });
      }
    });
  }

  signIn() {
    return new Promise((resolve, reject) => {
      if (typeof this.localPlayer === "undefined") {
        signInAnonymously(auth).catch(function (error) {
          reject(error);
        });
        onAuthStateChanged(auth, (user) => {
          if (user) {
            resolve(user);
          }
        });
      } else {
        resolve(this.localPlayer);
      }
    });
  }

  refreshGameState(gameState) {
    this.gameState = gameState;
  }

  emitAction(action) {
    switch (action.type) {
      case GameActionTypes.build:
        this.gameActions
          .build(action.payload)
          .catch((error) => logger.info(error));
        break;
      case GameActionTypes.attack:
        this.gameActions
          .attack(action.payload)
          .then(() => {
            let attackType = action.payload.attackType;
            if (attackType === AttackType.BUNNY) {
              if (
                this.gameState.players[1 - this.localPlayerIndex]
                  .attacksPerTurn[AttackType.BUNNY] > 0
              ) {
                Jukebox.playSound(Jukebox.SOUNDS.ATTACK_BUNNY);
              } else {
                Jukebox.playSound(Jukebox.SOUNDS.BUNNY_CAUGHT);
              }
            } else if (
              [AttackType.FRUIT, AttackType.TRUFFLE].includes(attackType)
            ) {
              Jukebox.playSound(Jukebox.SOUNDS.ATTACK_EXPLOSION);
              this.callbacks.detonateAtPosition(
                action.payload.row,
                action.payload.col
              );
            }
          })
          .catch((error) => logger.info(error));
        break;
      case GameActionTypes.chooseField:
        this.gameActions
          .chooseField(action.payload)
          .catch((error) => logger.info(error));
        break;
      case GameActionTypes.chooseStart:
        this.gameActions
          .chooseStart(action.payload)
          .catch((error) => logger.info(error));
        break;
      case GameActionTypes.finishTurn:
        this.gameActions
          .finishTurn(action.payload)
          .catch((error) => logger.info(error));
        break;
      case GameActionTypes.finishBuildPhase:
        this.gameActions
          .finishBuildPhase(action.payload)
          .catch((error) => logger.info(error));
        break;
      case GameActionTypes.endGame:
        this.gameActions
          .endGame(action.payload)
          .catch((error) => logger.info(error));
        break;
      default:
        logger.warn(
          "invalid action type shall be emitted. check implementation. call the coders."
        );
    }
  }

  processEvents(events) {
    events.sort((a, b) => {
      if (typeof a.index === "undefined") {
        return -1;
      } else if (typeof b.index === "undefined") {
        return 1;
      } else {
        return a.index > b.index ? 1 : -1;
      }
    });
    let sliced = events;
    if (this.opponentEventIndex > 1) {
      const posOfOpponentEventIndex = events
        .map(function (ev) {
          return ev.index;
        })
        .indexOf(this.opponentEventIndex - 1);
      if (posOfOpponentEventIndex >= 0) {
        sliced = events.slice(posOfOpponentEventIndex);
      }
    }
    sliced.forEach((action) => {
      if (action.index === this.opponentEventIndex) {
        console.log("emitting action: " + action.index + " -- " + action.type);
        this.emitAction(action);
        this.opponentEventIndex = this.opponentEventIndex + 1;
      }
    });
  }

  validateEvents(events) {
    if (events.length > this.serverEventIndex) {
      events.sort((a, b) => {
        if (typeof a.index === "undefined") {
          return -1;
        } else if (typeof b.index === "undefined") {
          return 1;
        } else {
          return a.index > b.index ? 1 : -1;
        }
      });
      const newEventIndex = events.length;

      logger.info("Start new action validation");

      for (let action of events.slice(0, this.serverEventIndex)) {
        let localState = this.validActions.get(action.uid);
        this.validActions.set(localState.action.uid, {
          action: localState.action,
          valid: true,
        });
      }
      let noInvalidAction = true;
      this.validActions.forEach((action) => {
        if (!action.valid) {
          noInvalidAction = false;
          logger.info(
            "Local action that does not exists in server " +
              JSON.stringify(action.action)
          );
        }
      });

      if (noInvalidAction) {
        logger.info("All actions are valid local and on server-side");
      }

      this.serverEventIndex = newEventIndex;
    }
  }

  relayAction(action) {
    if (
      typeof this.currentGameSession !== "undefined" &&
      action.payload.issuer === this.localPlayerId
    ) {
      action.index = this.playerEventIndex;
      action.uid = uuidv4();
      this.playerEventIndex += 1;
      action.emitted = Timestamp.fromDate(new Date());
      this.validActions.set(action.uid, { action: action, valid: false });

      ServerRequest("post", "/multiplayer/relay/action", {
        event: action,
        sessionId: this.currentGameSession,
      }).catch((error) => logger.warn(error));
    }
  }

  reset() {
    this.localPlayerIndex = 0;
    this.opponentEventIndex = 0;
    this.playerEventIndex = 0;
    this.serverEventIndex = 0;
    this.validActions = new Map();
    this.currentGameSession = undefined;
    if (typeof this.unsubscribeGameSession !== "undefined") {
      this.unsubscribeGameSession();
      this.unsubscribeGameSession = undefined;
    }
  }

  async fetchRandomName() {
    try {
      return (await ServerRequest("get", "/generaterandomname")).data.username;
    } catch (err) {
      console.warn("Could not crete a valid random player name. ", err);
      return "Chocnonymous";
    }
  }

  async enterGameSession(sessionId, gameActions) {
    const sessionEventQueueReference = doc(
      firestore,
      "multiplayerEventQueues",
      sessionId
    );
    try {
      var sessionEventQueueDoc = await getDoc(sessionEventQueueReference);
      var session = (
        await ServerRequest("get", "/multiplayer/session/" + sessionId)
      ).data;
      if (typeof session === "undefined") {
        logger.error("trying to enter a non existing session");
        return;
      }
    } catch (error) {
      logger.error(
        "error while fetching session information",
        error.toString()
      );
      return;
    }

    if (!sessionEventQueueDoc.exists()) {
      return;
    } else {
      this.gameActions = gameActions;
      const sessionEventQueue = sessionEventQueueDoc.data();
      if (session.game.isRunning) {
        this.localPlayerIndex = session.game.players.findIndex(
          (player) => player.id === auth.currentUser.uid
        );
        this.unsubscribeGameSession = onSnapshot(
          sessionEventQueueReference,
          (snapshot) => {
            const eventQueue = snapshot.data();
            this.processEvents(
              1 - this.localPlayerIndex === 0
                ? eventQueue.player_0_events
                : eventQueue.player_1_events
            );
            this.validateEvents(
              this.localPlayerIndex === 0
                ? eventQueue.player_0_events
                : eventQueue.player_1_events
            );
          },
          (error) => {
            logger.error(
              "encountered error while trying to establish observer of multiplayer session",
              error.toString()
            );
          }
        );

        let opponentPlayerEvents =
          1 - this.localPlayerIndex === 0
            ? sessionEventQueue.player_0_events
            : sessionEventQueue.player_1_events;
        opponentPlayerEvents.sort((a, b) => {
          if (typeof a.index === "undefined") {
            return -1;
          } else if (typeof b.index === "undefined") {
            return 1;
          } else {
            return a.index > b.index ? 1 : -1;
          }
        });
        this.opponentEventIndex = 0;
        opponentPlayerEvents.forEach((action) => {
          if (action.index === this.opponentEventIndex) {
            this.opponentEventIndex = this.opponentEventIndex + 1;
          }
        });

        console.log("recovered opponent index: " + this.opponentEventIndex);
        let localPlayerEvents =
          this.localPlayerIndex === 0
            ? sessionEventQueue.player_0_events
            : sessionEventQueue.player_1_events;
        localPlayerEvents.sort((a, b) => {
          if (typeof a.index === "undefined") {
            return -1;
          } else if (typeof b.index === "undefined") {
            return 1;
          } else {
            return a.index > b.index ? 1 : -1;
          }
        });
        this.playerEventIndex = localPlayerEvents.length;
        this.serverEventIndex = localPlayerEvents.length;
        this.validActions = new Map();
        for (let action of localPlayerEvents) {
          if (typeof action.uid !== "undefined") {
            this.validActions.set(action.uid, { action: action, valid: true });
          } else {
            this.validActions.set(uuidv4(), { action: action, valid: true });
          }
        }
        this.currentGameSession = session.id;
        this.localPlayerId = auth.currentUser.uid;
        return session;
      } else {
        throw ReferenceError("session is not running anymore");
      }
    }
  }
}

const multiplayer = new Multiplayer();

export { multiplayer };
