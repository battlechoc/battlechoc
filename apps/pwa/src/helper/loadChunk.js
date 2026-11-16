// a chunk that does not arrive is asked for again after these pauses, the last one over and over
// for the rest of a fast round
const RETRY_DELAYS_MS = [1000, 3000, 10000];
// the requests of a fast round (about two minutes with the pauses above); after it, one a minute
// for as long as the page is open: a chunk that a newer deploy removed (a 404) never arrives, and
// is not asked for every 10 s for the rest of the session
const MAX_TRIES = 15;
const SLOW_RETRY_MS = 60000;

// what wakeChunks() calls: every loader waiting for its chunk
const wakers = new Set();

/**
 * Asks every chunk still on its way for again at once (a new fast round): for when the game knows
 * the device is back online (index.jsx: connectivity's "online", which the browser's own event
 * may not bring).
 */
const wakeChunks = () => {
  [...wakers].forEach((wake) => wake());
};

/**
 * Calls `callback` when the page shows again, the window's `online` fires or wakeChunks() runs;
 * returns the unsubscribe. Outside a browser only wakeChunks() calls it.
 */
const wakeOnReturn = (callback) => {
  wakers.add(callback);
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => wakers.delete(callback);
  }
  const visible = () => {
    if (!document.hidden) {
      callback();
    }
  };
  window.addEventListener("online", callback);
  document.addEventListener("visibilitychange", visible);
  return () => {
    wakers.delete(callback);
    window.removeEventListener("online", callback);
    document.removeEventListener("visibilitychange", visible);
  };
};

/**
 * Wraps a dynamic import: the returned function loads the chunk once, however often it is
 * called, and never gives up while the page is open. React.lazy keeps a failed import for good
 * and throws it into the render, which would take the whole app down for one lost request; this
 * promise never rejects and resolves once the chunk is in. A failed request is tried again after
 * `delays` (the last one repeated) for `maxTries` requests, then every `slowMs`; `wake` (default
 * wakeOnReturn) asks at once and starts a fast round again. One request at a time. `timers`:
 * { setTimeout, clearTimeout } (tests).
 */
const loadChunk = (
  load,
  delays = RETRY_DELAYS_MS,
  {
    maxTries = MAX_TRIES,
    slowMs = SLOW_RETRY_MS,
    wake = wakeOnReturn,
    timers = globalThis,
  } = {}
) => {
  let loading;
  return () => {
    if (!loading) {
      loading = new Promise((resolve) => {
        // failed requests since the last fast round began
        let tries = 0;
        let timer = null;
        let asking = false;
        let done = false;
        let subscribed = false;
        let unsubscribe = null;
        const pause = () =>
          tries < maxTries
            ? delays[Math.min(tries - 1, delays.length - 1)]
            : slowMs;
        const attempt = () => {
          asking = true;
          let call;
          try {
            call = Promise.resolve(load());
          } catch (failure) {
            call = Promise.reject(failure);
          }
          call.then(
            (module) => {
              asking = false;
              done = true;
              if (timer !== null) {
                timers.clearTimeout(timer);
                timer = null;
              }
              if (unsubscribe) {
                unsubscribe();
              }
              resolve(module);
            },
            () => {
              asking = false;
              tries += 1;
              if (!subscribed) {
                subscribed = true;
                // the callback may come at once, before wake() returns: it reads no `unsubscribe`
                unsubscribe = wake(() => {
                  if (done || asking) {
                    return;
                  }
                  if (timer !== null) {
                    timers.clearTimeout(timer);
                    timer = null;
                  }
                  tries = 0;
                  attempt();
                });
                if (done && unsubscribe) {
                  unsubscribe();
                }
              }
              if (asking || done) {
                // a wake asked again already
                return;
              }
              timer = timers.setTimeout(() => {
                timer = null;
                attempt();
              }, pause());
            }
          );
        };
        attempt();
      });
    }
    return loading;
  };
};

export { loadChunk, RETRY_DELAYS_MS, wakeChunks, wakeOnReturn };
