import { apiUrl } from "./account";
import { liveConnection } from "./match/liveConnection";

const CHECK_TIMEOUT_MS = 5000;
const RECHECK_MS = 20000;

/**
 * Whether the game reaches its server, for what needs it (profile, highscore, Choclab, friends,
 * the links to other sites). The browser's offline event is enough to go offline; online is
 * believed once the API answers, so a Wi-Fi without internet or a server that is down count as
 * offline too. While offline it asks again every 20 s, and whenever the page comes back.
 */
class Connectivity {
  constructor() {
    this.online = typeof navigator === "undefined" || navigator.onLine !== false;
    this.listeners = new Set();
    this.timer = undefined;
    this.checking = undefined;
  }

  start() {
    window.addEventListener("offline", () => this.set(false));
    window.addEventListener("online", () => this.check());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        this.check();
      }
    });
    liveConnection.on("status", (status) => {
      if (status === "online") {
        this.set(true);
      }
    });
    this.check();
  }

  /** Calls the listener with true or false on every change; returns the unsubscribe. */
  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  set(online) {
    clearTimeout(this.timer);
    if (!online) {
      this.timer = setTimeout(() => this.check(), RECHECK_MS);
    }
    if (online !== this.online) {
      this.online = online;
      this.listeners.forEach((listener) => listener(online));
    }
  }

  check() {
    if (navigator.onLine === false) {
      this.set(false);
      return Promise.resolve(false);
    }
    if (typeof this.checking === "undefined") {
      this.checking = reachable()
        .then((online) => {
          this.set(online);
          return online;
        })
        .finally(() => {
          this.checking = undefined;
        });
    }
    return this.checking;
  }
}

// any answer of the API's /health counts; no-cors needs no CORS headers for that (the answer
// stays unreadable) and fails only when nothing answers
const reachable = () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  return fetch(`${apiUrl.replace(/\/$/, "")}/health`, {
    mode: "no-cors",
    cache: "no-store",
    signal: controller.signal,
  })
    .then(
      () => true,
      () => false
    )
    .finally(() => clearTimeout(timeout));
};

const connectivity = new Connectivity();

export { connectivity };
