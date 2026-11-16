import { useCallback, useEffect, useRef, useState } from "react";
import { chainApi } from "../../api/chain";
import { walletApiOf } from "../../cardano";
import { canSign } from "./mintFlow";
import { following } from "./operationPoll";
import { held } from "./held";
import { signingHere } from "./signingHere";

// What the minting dialog (MintDialog.jsx, mintFlow.js) and the salvage of a minted item
// (SalvageMinted.jsx, salvageFlow.js) do alike with their flow: one hook drives either reducer
// through a ref (the new state is known at once: the effects read it), keeps the wallet's api it
// connected, the wallet door's being open, and performs the taps both have: a cancel, Back (it
// cancels on the wallet step), Open wallet again on the phone path's waiting step.

/**
 * The flow of `reducer` (a pure (state, event) → state): { state, current (a ref to the latest),
 * alive (a ref: the dialog is open), begin(first) (the first state), send(event) (passes it to the
 * reducer; answers the new state), apiOf(name) (the injected wallet `name`'s api, connected once
 * and again after a problem that asks for it), door, setDoor (the wallet door; it closes itself
 * once the wallet step or this tab's code is gone), cancel(), back(),
 * openWalletAgain(openWallet), retry() (with `here` read anew), problemAction(action, backTap) }.
 */
export const useFlow = (reducer) => {
  const [state, setState] = useState(null);
  const current = useRef(null);
  const alive = useRef(true);
  const wallet = useRef({ name: null, api: null });
  const [door, setDoor] = useState(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // every event goes through the flow; the new state is known at once (the effects read it)
  const send = useCallback(
    (event) => {
      const before = current.current;
      if (!alive.current || !before) {
        return before;
      }
      const next = reducer(before, event);
      if (next !== before) {
        current.current = next;
        setState(next);
      }
      return next;
    },
    [reducer]
  );

  const begin = useCallback((first) => {
    current.current = first;
    setState(first);
  }, []);

  // the wallet door belongs to the wallet step and its sign code: it never stays open (nor opens
  // again by itself on a later operation) once the step moves on or the code is gone
  const step = state ? state.step : null;
  const signCode = state ? state.signCode : null;
  useEffect(() => {
    if (door && !(step === "wallet" && signCode)) {
      setDoor(false);
    }
  }, [door, step, signCode]);

  // a problem that asks for a new connection: the wallet's api is asked for anew
  const problem = state ? state.problem : null;
  useEffect(() => {
    if (problem && problem.reconnect) {
      wallet.current = { name: null, api: null };
    }
  }, [problem]);

  const apiOf = async (name) => {
    if (wallet.current.name === name && wallet.current.api) {
      return wallet.current.api;
    }
    const api = await walletApiOf(name);
    wallet.current = { name, api };
    return api;
  };

  const sendCancel = () => {
    const operation = current.current.operation;
    held(chainApi.cancel(operation.id)).then(
      (answer) => {
        following.note(answer);
        send({ type: "operation", operation: answer });
      },
      (failure) =>
        send({
          type: "problem",
          failure,
          during: "cancel",
          operationId: operation.id,
        })
    );
  };

  const cancel = () => {
    const before = current.current;
    const next = send({ type: "request", what: "cancel" });
    if (next !== before && next.pending === "cancel") {
      sendCancel();
    }
  };

  // Back: on the wallet step it cancels the prepared operation (the flow says so with `pending`)
  const back = () => {
    const before = current.current;
    const next = send({ type: "back" });
    if (
      next !== before &&
      next.pending === "cancel" &&
      before.pending !== "cancel"
    ) {
      sendCancel();
    }
  };

  // Open wallet again on the phone path's waiting step: the wallet step, and its door at once
  // when signing is still open (the window, this tab's code)
  const openWalletAgain = (openWallet) => {
    const next = send({ type: "walletAgain" });
    if (next.step === "wallet" && canSign(next, Date.now())) {
      openWallet();
    }
  };

  // Try again (Check again): the flow's retry, with what this device can sign with read anew (a
  // wallet extension enabled since the dialog opened)
  const retry = () => send({ type: "retry", here: signingHere() });

  // the problem's own button: "cancel", "back" (`backTap`: the dialog's Back), else Try again
  const problemAction = (action, backTap = back) => {
    if (action === "cancel") {
      cancel();
    } else if (action === "back") {
      backTap();
    } else {
      retry();
    }
  };

  return {
    state,
    current,
    alive,
    begin,
    send,
    apiOf,
    door,
    setDoor,
    cancel,
    back,
    openWalletAgain,
    retry,
    problemAction,
  };
};
