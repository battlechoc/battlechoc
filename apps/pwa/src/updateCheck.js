import logger from "./helper/logger.js";

/**
 * "Check for updates" (dialogs/Info.jsx): asks the server for the service worker again. The
 * browser does that by itself when the game starts; this is for a game that stays open.
 *
 * Resolves
 * - "installing": the server has a new build, its worker installs (it downloads the game, which
 *   takes a while). Once it is in charge, registerServiceWorker.js's onUpdate opens the update
 *   dialog. `onFailed` is called if the worker gives up (its download failed).
 * - "current": the worker on the server is the one the game has.
 * - "failed": the server did not answer (no connection).
 * - "unavailable": the game has no worker (the dev server, a browser without workers).
 *
 * `container` is navigator.serviceWorker.
 */
export const checkForUpdate = async (container, { onFailed } = {}) => {
  const registration = container ? await container.getRegistration() : null;
  if (!registration) {
    return "unavailable";
  }
  try {
    await registration.update();
  } catch (error) {
    logger.warn("The check for updates failed", String(error));
    return "failed";
  }
  // update() resolves once a changed worker has started installing
  const worker = registration.installing || registration.waiting;
  if (!worker) {
    return "current";
  }
  if (onFailed) {
    worker.addEventListener("statechange", () => {
      if (worker.state === "redundant") {
        onFailed();
      }
    });
  }
  return "installing";
};
