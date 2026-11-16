// Following a minting operation (GET /chain/operations/:id) until it ends: the minting dialog
// while it shows the operation, else the watcher (MintWatch.jsx). The server allows 30 requests a
// minute per player for the readiness, the mint and the operations together (a cancel has its
// own bucket, 10 a minute per player, so polling in two tabs cannot starve it): so one poll every
// 5 s at most, none while the page is hidden, none once the operation ended, and one place at a
// time (`following`: the dialog holds the operation it shows, the watcher leaves a held one
// alone). An operation in a block (included) is followed slowly
// until it is final, so a rollback shows. No React and no requests of its own: node tests it
// (test/unit/operationPoll.test.js); it loads with the Choclab and the minting chunks.

/** The shortest gap between two polls of an operation (ms). */
export const MIN_POLL_MS = 5000;

/** The gap while an operation is settled (in a block, waiting to be final) (ms). */
export const SLOW_POLL_MS = 30000;

// a failure that may pass by itself: no answer, a server error, a limit
const passing = (failure) =>
  Boolean(failure) &&
  (failure.retryable === true ||
    (failure.retryable === undefined && !failure.response));

/**
 * Polls `fetch()` (resolving with the operation) at once and then every `every` ms (at least
 * MIN_POLL_MS) while `page` (the document) is visible; a round that comes due while it is hidden
 * runs when it is visible again. Every answer goes to `onAnswer(answer)`; once `ended(answer)`,
 * nothing more is asked. A failure that may pass is tried again on the next round; any other goes
 * to `onFailure(failure)` and ends the poll. After an answer that is `settled(answer)` (in a
 * block, not final yet) the next poll comes after `slowEvery` ms. `timers`: { setTimeout,
 * clearTimeout } (tests).
 * Returns `stop()`: nothing more is asked, and an answer still on its way is dropped.
 */
export const pollOperation = ({
  fetch,
  onAnswer,
  onFailure = () => {},
  ended,
  settled = () => false,
  every = MIN_POLL_MS,
  slowEvery = SLOW_POLL_MS,
  page = globalThis.document,
  timers = globalThis,
}) => {
  const gap = Math.max(every, MIN_POLL_MS);
  let stopped = false;
  let timer = null;
  let asking = false;
  // a round came due while the page was hidden: it runs when the page shows again
  let due = false;

  const finish = () => {
    stopped = true;
    if (timer !== null) {
      timers.clearTimeout(timer);
      timer = null;
    }
    if (page) {
      page.removeEventListener("visibilitychange", onVisibility);
    }
  };

  const later = (wait = gap) => {
    timer = timers.setTimeout(() => {
      timer = null;
      round();
    }, wait);
  };

  const round = () => {
    if (stopped || asking) {
      return;
    }
    if (page && page.hidden) {
      due = true;
      return;
    }
    due = false;
    asking = true;
    Promise.resolve()
      .then(fetch)
      .then(
        (answer) => {
          asking = false;
          if (stopped) {
            return;
          }
          onAnswer(answer);
          if (ended(answer)) {
            finish();
          } else if (!stopped) {
            later(settled(answer) ? Math.max(slowEvery, gap) : gap);
          }
        },
        (failure) => {
          asking = false;
          if (stopped) {
            return;
          }
          if (passing(failure)) {
            later();
          } else {
            finish();
            onFailure(failure);
          }
        }
      );
  };

  function onVisibility() {
    if (due && !page.hidden) {
      round();
    }
  }

  if (page) {
    page.addEventListener("visibilitychange", onVisibility);
  }
  round();
  return finish;
};

/**
 * Who follows which operation: `hold(id)` (the dialog, while it shows operation `id`; returns
 * the release), `isHeld(id)`, `subscribe(listener)` (told on every change; returns the
 * unsubscribe); whether a minting dialog is open at all (`openDialog()` returns the close,
 * `dialogOpen()`): the watcher's "minted" message waits while one is; and the last view heard of
 * an operation (`note(operation)`, `noted(id)`, null before any; `lingering()`: the ids last heard
 * included, which the watcher follows until they are final).
 */
export const createFollowing = () => {
  const held = new Map();
  // the last view heard of each operation (the card shows a signature's minutes left from it)
  const views = new Map();
  const listeners = new Set();
  let dialogs = 0;
  const changed = () => listeners.forEach((listener) => listener());
  const once = (undo) => {
    let done = false;
    return () => {
      if (!done) {
        done = true;
        undo();
        changed();
      }
    };
  };
  return {
    hold: (id) => {
      held.set(id, (held.get(id) || 0) + 1);
      changed();
      return once(() => {
        const count = held.get(id) - 1;
        if (count > 0) {
          held.set(id, count);
        } else {
          held.delete(id);
        }
      });
    },
    isHeld: (id) => held.has(id),
    openDialog: () => {
      dialogs += 1;
      changed();
      return once(() => {
        dialogs -= 1;
      });
    },
    dialogOpen: () => dialogs > 0,
    note: (operation) => {
      if (operation && typeof operation.id === "string") {
        views.set(operation.id, operation);
        changed();
      }
    },
    noted: (id) => views.get(id) || null,
    // the operations last heard in a block (included), not final yet: a rollback may come
    lingering: () =>
      [...views.values()]
        .filter((view) => view.state === "included")
        .map((view) => view.id),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

/** The game's one record of who follows which operation. */
export const following = createFollowing();
