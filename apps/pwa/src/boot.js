import {
  live,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import OfflineStore from "./OfflineStore";
import { multiplayer } from "./Multiplayer";
import { Jukebox } from "./ui/misc";
import {
  updatePlayerStats,
  setPlayerRank,
  notifyPlayerSignedIn,
  showQuickMessage,
  showNotification,
  nameConflictChanged,
  gameResumeable,
  earlyUnlockDecided,
} from "./ui/uiSlice";
import { challengeViewed } from "./match/liveSlice";
import { loadUnlockState } from "./unlocks";
import { applyLanguage } from "./helper/language";
import { rememberLanguage } from "./helper/rememberLanguage";
import { isFullscreen } from "./helper/fullscreen";
import { testHooksEnabled } from "./testHooks";
import logger from "./helper/logger";

/**
 * What the address the game was opened with asks for, read once before it is reset to the
 * origin: `?testclock` (a manual match clock, test builds only), a friend's challenge
 * (battlechoc.com/?challenge=K7Q2-M9XD), a player's profile (/<username>) or a debug board
 * (/situation/<md5>, test builds only).
 */
export const readLaunchAddress = (location = window.location, history = window.history) => {
  const query = new URLSearchParams(location.search);
  const launch = {
    testClock: testHooksEnabled && query.has("testclock"),
    // also the code an iPhone's home-screen app gets typed in (ChallengeDialog)
    challengeCode: live.normalizeChallengeCode(query.get("challenge")) || undefined,
    player: undefined,
    situation: undefined,
  };
  const path = location.pathname;
  // /privacy-policy/ is a page of its own (public/privacy-policy/index.html)
  if (/^(\/[a-zA-Z][a-zA-Z0-9_]{2,15})$/.test(path)) {
    launch.player = path.slice(1);
  } else if (testHooksEnabled && path.startsWith("/situation/")) {
    launch.situation = path.replace("/situation/", "").slice(0, 32);
  }
  if (path !== "/" || query.has("challenge")) {
    history.pushState({}, null, location.origin);
  }
  return launch;
};

/**
 * The start of the game once the app is on the screen: the player's profile callbacks, the
 * language, a friend's challenge, the live connection (`connectLive`), the match kept for
 * Resume, the music on focus, the unlocks and the iOS hint. `onLanguage` re-renders the app in
 * the language once its texts are in.
 */
export const boot = ({ dispatch, challengeCode, connectLive, onLanguage }) => {
  multiplayer.registerCallbacks({
    updatePlayerStats: (stats) => dispatch(updatePlayerStats(stats)),
    setPlayerRank: (rank) => dispatch(setPlayerRank(rank)),
    notifyPlayerSignedIn: (player) => dispatch(notifyPlayerSignedIn(player)),
    showQuickMessage: (message) => dispatch(showQuickMessage(message)),
    showNotification: (notification) => dispatch(showNotification(notification)),
    // a name chosen offline was taken meanwhile: the player chooses another (NameConflict)
    nameConflict: (conflict) => dispatch(nameConflictChanged(conflict)),
  });

  // the language the player chose, else the browser's (ja-JP → ja; English when the game
  // has no texts in it); a device may still hold the old codes jp and vn
  OfflineStore.settingsStore
    .get("language")
    .then((stored) => applyLanguage(stored || navigator.language))
    .then((code) => {
      rememberLanguage(code);
      onLanguage();
    })
    .catch((error) => logger.warn("could not load the language", error));

  if (typeof challengeCode !== "undefined") {
    // the card shows at once, before the game has loaded; the server's answer fills it in
    // (without one, the card says the server cannot be reached)
    dispatch(challengeViewed({ code: challengeCode, state: "connecting" }));
  }
  connectLive();

  OfflineStore.hasGameToResume().then((resumeable) => dispatch(gameResumeable(resumeable)));

  window.onfocus = () => Jukebox.playMusic();
  window.onblur = () => Jukebox.pauseMusic();

  // what the player has unlocked: decided from the stats on the device (src/unlocks.js)
  multiplayer
    .fetchPlayerStats()
    .then((stats) => loadUnlockState(stats))
    .then((unlockState) => dispatch(earlyUnlockDecided(unlockState.early)))
    .catch((error) => logger.warn("could not load the unlocks", error));

  const iOSDevice = /^(iPhone|iPad|iPod)/.test(navigator.platform);
  const isPWA = window.matchMedia("(display-mode: fullscreen)").matches;
  if (iOSDevice && !isFullscreen() && !isPWA) {
    OfflineStore.settingsStore.get("iOSMessage").then((iOSMessage) => {
      if (typeof iOSMessage === "undefined") {
        dispatch(
          showQuickMessage({
            text: t(tr.IOS_MESSAGE),
            variant: "apple-pwa-hint",
            autoHideDuration: 6000,
          })
        );
        OfflineStore.settingsStore.set("iOSMessage", "hide next time");
      }
    });
  }
};
