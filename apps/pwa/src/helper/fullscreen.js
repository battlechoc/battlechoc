import { useState, useEffect } from "react";
import logger from "./logger";

const isFullscreen = () =>
  Boolean(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement
  );

// iOS has no fullscreen for pages, the installed app on a phone and the desktop app fill the
// screen already
const fullscreenSupported = () => {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  const isElectronApp = userAgent.toLowerCase().indexOf(" electron/") > -1;
  const isiOS = /^(iPhone|iPad|iPod)/.test(navigator.platform);
  const isPWA =
    window.matchMedia("(display-mode: fullscreen)").matches &&
    /iPad|iPhone|iPod|Android/.test(userAgent);
  return (
    !isiOS &&
    !isPWA &&
    !isElectronApp &&
    typeof document.documentElement.requestFullscreen === "function"
  );
};

const enterFullscreen = () =>
  document.documentElement
    .requestFullscreen()
    .catch(() => logger.info("fullscreen request failed"));

/**
 * Fullscreen for a match, held sideways on Android. Needs the player's click: call it
 * synchronously in the click's handler. Not on iOS (pages have no fullscreen there).
 */
const enterMatchFullscreen = () => {
  const isiOS = /^(iPhone|iPad|iPod)/.test(navigator.platform);
  if (
    isFullscreen() ||
    isiOS ||
    typeof document.documentElement.requestFullscreen !== "function"
  ) {
    return;
  }
  document.documentElement
    .requestFullscreen()
    .then(() => {
      if (/Android/i.test(navigator.userAgent)) {
        window.screen.orientation
          .lock("landscape")
          .catch(() => logger.info("Unable to lock orientation to landscape"));
      }
    })
    .catch((error) => logger.warn(error.name + ": " + error.message));
};

/** Ends the landscape lock of a match (Android). */
const releaseOrientation = () => {
  if (/Android/i.test(navigator.userAgent) && window.screen.orientation) {
    window.screen.orientation.unlock();
  }
};

/** Whether a fullscreen button makes sense now: supported and not fullscreen yet. */
const useFullscreenAvailable = () => {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const update = () => setAvailable(fullscreenSupported() && !isFullscreen());
    document.addEventListener("fullscreenchange", update, false);
    update();
    return () =>
      document.removeEventListener("fullscreenchange", update, false);
  }, []);
  return available;
};

export {
  isFullscreen,
  fullscreenSupported,
  enterFullscreen,
  enterMatchFullscreen,
  releaseOrientation,
  useFullscreenAvailable,
};
