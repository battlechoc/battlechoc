import OfflineStore from "./OfflineStore";
import {
  EmptyPlayerStats,
  translate as t,
  translationKeys as tr,
  engine,
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

// a name the player chose (the default "Chocnonymous" is no name)
const isNamed = (stats) =>
  Boolean(stats) &&
  typeof stats.username === "string" &&
  stats.username !== EmptyPlayerStats.username;

class Multiplayer {
  constructor() {
    const notInitialized = (name) => () =>
      logger.warn(`calling ${name} without being initialized`);
    this.callbacks = {
      updatePlayerStats: notInitialized("updatePlayerStats"),
      notifyPlayerSignedIn: notInitialized("notifyPlayerSignedIn"),
      setPlayerRank: notInitialized("setPlayerRank"),
      showQuickMessage: notInitialized("showQuickMessage"),
      showNotification: notInitialized("showNotification"),
      nameConflict: notInitialized("nameConflict"),
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
        !mergedStats.usernamePending &&
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

  /* ---------- a name chosen offline ---------- */

  // Offline the player can still change the name: it is kept on the device, marked as not on
  // the server yet (stats.usernamePending, a sign beside the name), and claimed there as soon as
  // the server answers; the sign then just goes away. If somebody else has the name, the player
  // gets a random one instead and a dialog says so (callbacks.nameConflict); it can be changed
  // in the profile.
  async setUsernameOffline(username) {
    const stats = (await OfflineStore.playerStore.get("stats")) || { ...EmptyPlayerStats };
    await OfflineStore.playerStore.set("stats", { ...stats, username, usernamePending: true });
    this.callbacks.updatePlayerStats({ username, usernamePending: true });
  }

  // a new name from the profile: claimed on the server right away, or kept on the device until
  // the server answers; rejects when the server turns it down
  async changeUsername(username, online) {
    if (!online) {
      await this.setUsernameOffline(username);
      return;
    }
    await ServerRequest("post", "/user/username", { username });
    await this.usernameSynced(username);
  }

  // the name now belongs to the player on the server
  async usernameSynced(username) {
    const stats = (await OfflineStore.playerStore.get("stats")) || { ...EmptyPlayerStats };
    await OfflineStore.playerStore.set("stats", { ...stats, username, usernamePending: false });
    this.callbacks.updatePlayerStats({ username, usernamePending: false });
  }

  // The merge of the device's profile and the claiming of its name both read and write the
  // stored stats: they run one after the other, so neither writes back a name the other has
  // just replaced.
  exclusive(task) {
    const run = (this.statsLock || Promise.resolve()).then(task);
    this.statsLock = run.catch(() => undefined);
    return run;
  }

  // claims the name kept on the device (see setUsernameOffline)
  syncPendingUsername() {
    return this.exclusive(async () => {
      const stats = await OfflineStore.playerStore.get("stats");
      if (!stats || !stats.usernamePending) {
        return;
      }
      await account.ensure();
      try {
        await ServerRequest("post", "/user/username", { username: stats.username });
        await this.usernameSynced(stats.username);
      } catch (error) {
        if (error.response && error.response.status === 400) {
          // taken by someone else (or not allowed any more)
          await this.replaceTakenName(stats.username);
        } else {
          logger.info("could not claim the name chosen offline", error);
        }
      }
    }).catch((error) => logger.info("could not claim the name chosen offline", error));
  }

  // the device's name belongs to somebody else on the server: a random one instead, and the
  // dialog that says so; if that fails too, the name stays pending for the next try
  async replaceTakenName(taken) {
    const generated = await this.fetchRandomName();
    if (generated === EmptyPlayerStats.username) {
      return;
    }
    await ServerRequest("post", "/user/username", { username: generated });
    await this.usernameSynced(generated);
    this.callbacks.nameConflict({ taken, generated });
  }

  // the server's stats, with a name chosen offline that it does not know yet
  async withPendingName(stats) {
    const local = await OfflineStore.playerStore.get("stats").catch(() => undefined);
    return local && local.usernamePending
      ? { ...stats, username: local.username, usernamePending: true }
      : stats;
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
        this.callbacks.updatePlayerStats(await this.withPendingName(data.stats));
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
      // offline matches give XP only; ingredients come from verified online matches
      playerStats.score = (playerStats.score || 0) + this.calculateXpFromTrackRecord(gameStats);
      // and they move the AI ladder, as the server will when it gets the records
      playerStats.aiLadder = gameStats.reduce(
        (ladder, record) =>
          engine.nextAiLadder(ladder, record.won ? "won" : record.lost ? "lost" : "draw"),
        engine.aiLadderOf(playerStats)
      );
      await OfflineStore.playerStore.set("stats", playerStats);
      this.callbacks.updatePlayerStats(playerStats);
    } catch (error) {
      logger.warn("could not store offline player stats", error);
    }
  }

  mergePlayerStats() {
    if (!this.signedIn()) {
      return Promise.resolve(undefined);
    }
    return this.exclusive(() => this.mergeOfflineProfile());
  }

  async mergeOfflineProfile() {
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
      // A name chosen offline stays until the server has it (or turns it down). So does a name
      // the device has but the server's account does not, e.g. from before this server: the
      // merge takes it when it is free, so here it is taken (syncPendingUsername replaces it).
      const unclaimed =
        offlineAccount.usernamePending ||
        (isNamed(offlineAccount) && !isNamed(data.mergedPlayerInfo));
      const merged = unclaimed
        ? { ...data.mergedPlayerInfo, username: offlineAccount.username, usernamePending: true }
        : data.mergedPlayerInfo;
      await OfflineStore.playerStore
        .set("stats", merged)
        .catch((error) => logger.warn("could not set new player stats in idb.", error));
      this.callbacks.updatePlayerStats(merged);
      if (merged.usernamePending) {
        this.syncPendingUsername();
      }
      return merged;
    } catch (error) {
      logger.warn("Could not merge stats.", error);
      return this.fetchPlayerStats();
    }
  }

  async fetchPlayerStats() {
    if (this.signedIn()) {
      try {
        const data = (await ServerRequest("get", "/user")).data;
        const stats = await this.withPendingName(data.stats);
        this.callbacks.updatePlayerStats(stats);
        return stats;
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

  // offline estimate of the XP of finished matches (the server computes the real value):
  // winners and draws get the full XP of their achievements, losers half
  calculateXpFromTrackRecord(trackRecord) {
    if (!Array.isArray(trackRecord)) {
      return 0;
    }
    return trackRecord.reduce((total, record) => {
      const xp = (Array.isArray(record.awards) ? record.awards : []).reduce(
        (sum, award) => sum + (award && typeof award.xp === "number" ? award.xp : 0),
        0
      );
      return total + (record.lost === true ? Math.floor(xp / 2) : xp);
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
        const stats = await this.withPendingName(data.stats);
        this.callbacks.updatePlayerStats(stats);
        return stats;
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

  /* ---------- ranking ---------- */

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
