import { apiUrl } from "./account";
import { liveConnection } from "./match/liveConnection";

const CHECK_TIMEOUT_MS = 5000;
const RECHECK_MS = 20000;

/**
 * Whether the game reaches its server, for what needs it (profile, highscore, Choclab, friends,
 * the links to other sites): "online", "offline" (no internet) or "server-down" (the internet
 * works, the server does not answer: try again later). The browser's offline event is enough to
 * go offline; online is believed once the API's /health answers. When it does not, the site's
 * own host (GitHub Pages, elsewhere than the API) tells the two apart. While not online it asks
 * again every 20 s, and whenever the page comes back.
 */
class Connectivity {
  constructor() {
    this.status =
      typeof navigator === "undefined" || navigator.onLine !== false
        ? "online"
        : "offline";
    this.listeners = new Set();
    this.timer = undefined;
    this.checking = undefined;
  }

  get online() {
    return this.status === "online";
  }

  start() {
    window.addEventListener("offline", () => this.set("offline"));
    window.addEventListener("online", () => this.check());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        this.check();
      }
    });
    liveConnection.on("status", (status) => {
      if (status === "online") {
        this.set("online");
      }
    });
    this.check();
  }

  /** Calls the listener with the new status on every change; returns the unsubscribe. */
  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  set(status) {
    clearTimeout(this.timer);
    if (status !== "online") {
      this.timer = setTimeout(() => this.check(), RECHECK_MS);
    }
    if (status !== this.status) {
      this.status = status;
      this.listeners.forEach((listener) => listener(status));
    }
  }

  check() {
    if (navigator.onLine === false) {
      this.set("offline");
      return Promise.resolve("offline");
    }
    if (typeof this.checking === "undefined") {
      this.checking = answers(`${apiUrl.replace(/\/$/, "")}/health`)
        .then((server) =>
          server
            ? "online"
            : answers(`${window.location.origin}/connectivity-check`).then(
                (internet) => (internet ? "server-down" : "offline")
              )
        )
        .then((status) => {
          this.set(status);
          return status;
        })
        .finally(() => {
          this.checking = undefined;
        });
    }
    return this.checking;
  }
}

// any answer counts, a 404 too; no-cors needs no CORS headers for that (the answer stays
// unreadable) and fails only when nothing answers. The site's check path is in no cache.
const answers = (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  return fetch(url, {
    method: "HEAD",
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
