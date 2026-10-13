import OfflineStore from "./OfflineStore";
import {
  EmptyPlayerStats,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import { ServerRequest } from "./helper/settings";
import { account } from "./account";
import logger from "./helper/logger";

// Player profile and social features against the battlechoc API (device account). Online
// matches are live (match/liveLobby.js).

const urlBase64ToUint8Array = (base64) => {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
};

class Multiplayer {
  constructor() {
    const notInitialized = (name) => () =>
      logger.warn(`calling ${name} without being initialized`);
    this.callbacks = {
      updatePlayerStats: notInitialized("updatePlayerStats"),
      notifyPlayerSignedIn: notInitialized("notifyPlayerSignedIn"),
      loadFriendsList: notInitialized("loadFriendsList"),
      setPlayerRank: notInitialized("setPlayerRank"),
      showQuickMessage: notInitialized("showQuickMessage"),
      showNotification: notInitialized("showNotification"),
    };

    account
      .ensure()
      .then(() => this.accountReady())
      .catch((error) => logger.info("playing offline, no account yet", error));
  }

  signedIn() {
    return account.isReady();
  }

  async accountReady() {
    this.callbacks.notifyPlayerSignedIn({
      uid: account.playerId,
      isAnonymous: true,
    });
    try {
      await ServerRequest("post", "/user");
      const mergedStats = await this.mergePlayerStats();
      if (
        typeof mergedStats !== "undefined" &&
        mergedStats.username === EmptyPlayerStats.username &&
        (mergedStats.tutorialFinished === true ||
          mergedStats.tutorialSkipped === true)
      ) {
        await this.setRandomPlayerName();
      }
    } catch (error) {
      logger.info("could not load the player entry", error);
    }
    if (window.navigator.onLine) {
      this.fetchFriendsList();
      this.computeRank();
    }
  }

  /* ---------- web push ---------- */

  shouldAskForNotificationPermission() {
    return (
      this.signedIn() &&
      "Notification" in window &&
      "PushManager" in window &&
      Notification.permission === "default"
    );
  }

  askForNotificationPermission() {
    Notification.requestPermission().then((permission) => {
      if (permission === "granted") {
        this.subscribeToPush().catch((error) =>
          logger.info("could not subscribe to push messages", error)
        );
      } else {
        logger.info("Unable to get permission to notify.");
      }
    });
  }

  async subscribeToPush() {
    const { publicKey } = (await ServerRequest("get", "/push/key")).data;
    if (!publicKey || !("serviceWorker" in navigator)) {
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      }));
    await ServerRequest("post", "/push/subscription", {
      subscription: subscription.toJSON(),
    });
  }

  // a push message forwarded by the service worker while the app is open
  handlePushMessage(payload) {
    if (payload && (payload.title || payload.text)) {
      this.callbacks.showQuickMessage({
        text: [payload.title, payload.text].filter(Boolean).join(" "),
        variant: "info",
      });
    }
  }

  /* ---------- profile ---------- */

  async setRandomPlayerName() {
    const generatedName = await this.fetchRandomName();
    ServerRequest("post", "/user/username", { username: generatedName })
      .then(async () => {
        this.callbacks.showNotification({
          title: t(tr.PLAYER_NAME_GENERATED_TITLE),
          message: t(tr.PLAYER_NAME_GENERATED_BODY, generatedName),
        });
        this.callbacks.updatePlayerStats({ username: generatedName });
        const playerStats = await OfflineStore.playerStore.get("stats");
        if (playerStats) {
          playerStats.username = generatedName;
          OfflineStore.playerStore.set("stats", playerStats);
        }
      })
      .catch((error) => logger.warn(error));
  }

  registerCallbacks(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  computeTrackRecordStats(trackRecord) {
    if (!Array.isArray(trackRecord)) {
      return { winnings: 0, drawn: 0, losses: 0 };
    }
    const finished = trackRecord.filter(
      (record) => Array.isArray(record.winners) && record.winners.length > 0
    );
    const winnings = finished.filter((record) => record.won === true).length;
    const drawn = finished.filter((record) => record.winners.length > 1).length;
    return {
      winnings,
      drawn,
      losses: finished.length - winnings - drawn,
    };
  }

  // finished matches: credited by the server, or kept on the device while offline (they are
  // imported on the next start with an account, see mergePlayerStats)
  async pushGameStats(gameStats) {
    if (this.signedIn()) {
      try {
        const data = (
          await ServerRequest("post", "/user/trackrecords", { stats: gameStats })
        ).data;
        this.callbacks.updatePlayerStats(data.stats);
        return;
      } catch (error) {
        logger.warn("Could not update player track record.", error);
      }
    }
    try {
      const playerStats = (await OfflineStore.playerStore.get("stats")) || {
        ...EmptyPlayerStats,
      };
      playerStats.trackRecord = [...(playerStats.trackRecord || []), ...gameStats];
      Object.assign(playerStats, this.computeTrackRecordStats(playerStats.trackRecord));
      const coins = this.calculateCoinsFromTrackRecord(gameStats);
      playerStats.coins = (playerStats.coins || 0) + coins;
      playerStats.score = (playerStats.score || 0) + coins;
      await OfflineStore.playerStore.set("stats", playerStats);
      this.callbacks.updatePlayerStats(playerStats);
    } catch (error) {
      logger.warn("could not store offline player stats", error);
    }
  }

  async mergePlayerStats() {
    if (!this.signedIn()) {
      return undefined;
    }
    let offlineAccount;
    try {
      offlineAccount = await OfflineStore.playerStore.get("stats");
    } catch (error) {
      logger.warn("failed to get player infos from offline store", error);
    }
    if (typeof offlineAccount === "undefined") {
      return this.fetchPlayerStats();
    }
    try {
      const data = (
        await ServerRequest("post", "/user/merge", { playerInfo: offlineAccount })
      ).data;
      OfflineStore.playerStore
        .set("stats", data.mergedPlayerInfo)
        .catch((error) => logger.warn("could not set new player stats in idb.", error));
      this.callbacks.updatePlayerStats(data.mergedPlayerInfo);
      return data.mergedPlayerInfo;
    } catch (error) {
      logger.warn("Could not merge stats.", error);
      return this.fetchPlayerStats();
    }
  }

  async fetchPlayerStats() {
    if (this.signedIn()) {
      try {
        const data = (await ServerRequest("get", "/user")).data;
        this.callbacks.updatePlayerStats(data.stats);
        return data.stats;
      } catch (error) {
        logger.warn("not able to fetch player stats from backend", error);
      }
    }
    let offlineAccount;
    try {
      offlineAccount = await OfflineStore.playerStore.get("stats");
    } catch (error) {
      logger.warn(error);
    }
    if (typeof offlineAccount === "undefined") {
      OfflineStore.playerStore.set("stats", EmptyPlayerStats);
      this.callbacks.updatePlayerStats(EmptyPlayerStats);
      return EmptyPlayerStats;
    }
    Object.assign(offlineAccount, this.computeTrackRecordStats(offlineAccount.trackRecord));
    this.callbacks.updatePlayerStats(offlineAccount);
    return offlineAccount;
  }

  // offline estimate of the coins of finished matches (the server computes the real value)
  calculateCoinsFromTrackRecord(trackRecord) {
    if (!Array.isArray(trackRecord)) {
      return 0;
    }
    return trackRecord.reduce((total, record) => {
      if (record.won !== true && !(Array.isArray(record.winners) && record.winners.length > 1)) {
        return total;
      }
      const coins = (Array.isArray(record.awards) ? record.awards : []).reduce(
        (sum, award) => sum + (award && typeof award.coins === "number" ? award.coins : 0),
        0
      );
      return total + (record.won === true ? coins : Math.floor(coins / 2));
    }, 0);
  }

  async updateTutorialState(step, changes) {
    try {
      const playerStats = await OfflineStore.playerStore.get("stats");
      if (playerStats) {
        Object.assign(playerStats, changes);
        await OfflineStore.playerStore.set("stats", playerStats);
        this.callbacks.updatePlayerStats(playerStats);
      }
    } catch (error) {
      logger.warn("could not update offline player stats", error);
    }
    if (this.signedIn()) {
      try {
        const data = (await ServerRequest("post", "/user/tutorial/" + step)).data;
        this.callbacks.updatePlayerStats(data.stats);
        return data.stats;
      } catch (error) {
        logger.warn(`Could not update the tutorial state ${step}.`, error);
      }
    }
    return undefined;
  }

  tutorialStarted() {
    return this.updateTutorialState("started", { tutorialStarted: true, tutorialSkipped: false });
  }

  async tutorialSkipped() {
    const stats = await this.updateTutorialState("skipped", { tutorialStarted: false, tutorialSkipped: true });
    if (stats && stats.username === EmptyPlayerStats.username) {
      await this.setRandomPlayerName();
    }
  }

  tutorialFinished() {
    return this.updateTutorialState("finished", { tutorialFinished: true });
  }

  /* ---------- friends, ranking ---------- */

  async fetchFriendsList() {
    if (!this.signedIn()) {
      return undefined;
    }
    try {
      const response = await ServerRequest("get", "/user/friends");
      this.callbacks.loadFriendsList(response.data);
      return response.data;
    } catch (error) {
      logger.warn("error while fetching friends " + error);
      return undefined;
    }
  }

  async computeRank() {
    try {
      if (!this.signedIn()) {
        throw new Error("offline");
      }
      const data = (await ServerRequest("get", "/rank")).data;
      this.callbacks.setPlayerRank(data.ranking);
    } catch {
      this.callbacks.setPlayerRank("Offline");
    }
  }

  async removeFriend(friend) {
    try {
      await ServerRequest("delete", "/user/friend", { friend });
      await this.fetchFriendsList();
    } catch (error) {
      logger.warn("error while removing friend " + error);
    }
  }

  async addFriend(friend) {
    try {
      await ServerRequest("post", "/user/friend", { friend });
      await this.fetchFriendsList();
    } catch (error) {
      logger.warn("error while adding friend " + error);
    }
  }

  async fetchHighscore(page) {
    return (
      await ServerRequest(
        "get",
        "/highscore" + (typeof page !== "undefined" ? "?page=" + page : "")
      )
    ).data;
  }

  async fetchRandomName() {
    try {
      return (await ServerRequest("get", "/generaterandomname")).data.username;
    } catch (error) {
      logger.warn("Could not create a random player name.", error);
      return EmptyPlayerStats.username;
    }
  }
}

const multiplayer = new Multiplayer();

export { multiplayer };
