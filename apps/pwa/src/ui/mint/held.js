import { ChainUnreachableError } from "../../api/chainClient.js";

// A request the game waits on for minting (the dialog's Mint now, signature and cancel, the
// card's Cancel, every poll of an operation) counts as unanswered after ANSWER_MS: the authed
// client has no timeout of its own, and a hung request would leave buttons disabled or an
// operation unfollowed until a remount.

/** How long such a request may take before it counts as unanswered (ms). */
export const ANSWER_MS = 20000;

/**
 * `call` (a promise) as it settles, or rejected with ChainUnreachableError("network") once it has
 * not answered within `ms`. Only the waiting ends: `call` itself goes on, and a caller that
 * needs its late answer hangs on `call`.
 */
export const held = (call, ms = ANSWER_MS) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new ChainUnreachableError("network")),
      ms
    );
    call.then(
      (answer) => {
        clearTimeout(timer);
        resolve(answer);
      },
      (failure) => {
        clearTimeout(timer);
        reject(failure);
      }
    );
  });
