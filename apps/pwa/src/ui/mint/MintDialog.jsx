import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createUseStyles } from "react-jss";
import { dialogSheet, DONE_ICON } from "./mintSheets";
import {
  getCurrentLanguage,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import Dialog from "../dialogs/Dialog";
import Button from "../controls/Button";
import ItemIcon from "../lab/ItemIcon";
import { itemName } from "../lab/itemText";
import { scrollCue } from "../lab/itemActions";
import { injectedWalletKeys } from "../../cardano/walletList";
import { networkLabel } from "../account/safetyState";
import { chainApi } from "../../api/chain";
import {
  features,
  keyStore,
  signPageUrl,
  signPrepared,
  subjectOfWords,
  walletAddresses,
  walletApiOf,
} from "../../cardano";
import OfflineStore from "../../OfflineStore";
import logger from "../../helper/logger";
import { loadChunk } from "../../helper/loadChunk";
import {
  canCancel,
  canContinue,
  canSign,
  checklistOf,
  costsOf,
  elsewhere,
  feeChoice,
  initialState,
  mintFlow,
  mintRequest,
  noSigning,
  pollTarget,
  signWindow,
  walletTextKey,
} from "./mintFlow";
import { formatAda } from "./ada";
import { following, pollOperation } from "./operationPoll";
import { MINT_EXPLAINED } from "./mintSettings";
import { held } from "./held";
import { dropCode, keepCode, onCode, readCode } from "./signCodes";
import { MINT_LOOK } from "./mintLook";
import { say } from "./mintText";
import MintChecklist from "./MintChecklist";
import MintCosts from "./MintCosts";
import MintConnect from "./MintConnect";
import useSignClock from "./useSignClock";

// the wallet door (plan 3), for a signature with a wallet this browser did not inject: not
// precached, so asked for again until it arrives (a lost request never throws into the Hud)
const WalletDoor = lazy(loadChunk(() => import("../account/WalletDoor")));

// The minting dialog (the owner's mockup, board 1): explain, the checklist, the costs, "your
// wallet opens now", the signature, minting, minted, or nothing happened. The flow's state and
// every rule are mintFlow.js's; this component performs what the state asks for (the readiness,
// the wallet's addresses, Mint now, the signature, a cancel, the poll) and reports each answer
// as an event. A request event that sets `pending` is the request to send. Closing never cancels
// anything: an operation that runs keeps running, and the watcher (MintWatch) follows it. It is
// loaded when it opens (src/ui/mint's dialog chunk), with the flow and the wallet code; the
// Evolution SDK comes later, lazily through cardano/keys.js, once an address is read.

// the operation's states it is followed in
const RUNNING = ["prepared", "submitted"];

const useStyles = createUseStyles(dialogSheet);

// how far the scroll area's edge fades where more of the step is beyond it
const FADE = "2em";

// the mask that fades the scroll area's edges with more beyond them (none when all is in view)
const fadeMask = ({ above, below }) => {
  if (above && below) {
    return `linear-gradient(to bottom, transparent, #000 ${FADE}, #000 calc(100% - ${FADE}), transparent)`;
  }
  if (below) {
    return `linear-gradient(to bottom, #000 calc(100% - ${FADE}), transparent)`;
  }
  if (above) {
    return `linear-gradient(to top, #000 calc(100% - ${FADE}), transparent)`;
  }
  return undefined;
};

// the readiness entry of the wallet the flow mints to (its CIP-30 `name`), or null
const pickedEntry = (state) => {
  const request = mintRequest(state);
  const wallets =
    state.readiness && Array.isArray(state.readiness.wallets)
      ? state.readiness.wallets
      : [];
  const subject = request
    ? request.subject
    : state.operation && state.operation.subject;
  return wallets.find((entry) => entry.subject === subject) || null;
};

// the CIP-30 name of `entry` when this browser injected that wallet, else null
const injectedName = (entry) => {
  try {
    const wallet =
      entry && typeof entry.name === "string" && window.cardano
        ? window.cardano[entry.name]
        : null;
    return wallet && typeof wallet.enable === "function" ? entry.name : null;
  } catch {
    return null;
  }
};

// what this device can sign with (the flow's `here`): the wallets this browser injected, and
// whether it opens a phone's wallet app (the wallet door's paths, which never sign through the QR
// code)
const signingHere = () => {
  let wallets;
  try {
    wallets = injectedWalletKeys(window.cardano);
  } catch {
    wallets = [];
  }
  return {
    wallets,
    deeplink: features
      .walletPaths({ injected: wallets.length > 0 })
      .has("deeplink"),
  };
};

// the costs of the state, nothing for amounts an older API sent in another form
const safeCosts = (state) => {
  try {
    return costsOf(state);
  } catch {
    return null;
  }
};

const amount = (lovelace, exact) => {
  try {
    const shown = formatAda(
      lovelace,
      getCurrentLanguage(),
      exact ? { exact } : {}
    );
    return exact
      ? t(tr.MINT_AMOUNT, shown, "ADA")
      : t(tr.MINT_ABOUT, shown, "ADA");
  } catch {
    return "";
  }
};

// the problem's own button besides the step's (recheck, retry, cancel, back)
const ACTIONS = {
  recheck: ["MINT_RECHECK", "mint-recheck"],
  retry: ["MINT_AGAIN", "mint-again"],
  cancel: ["MINT_CANCEL", "mint-cancel"],
  back: ["MINT_BACK", "mint-back"],
};

const TITLES = {
  explain: "MINT_EXPLAIN_TITLE",
  check: "MINT_CHECK_TITLE",
  costs: "MINT_COSTS_TITLE",
  wallet: "MINT_WALLET_TITLE",
  sign: "MINT_SIGN_WAITING",
  minting: "MINT_MINTING_TITLE",
  done: "MINT_DONE_TITLE",
  nothing: "MINT_NOTHING_TITLE",
  failed: "MINT_FAILED_TITLE",
};

// the steps after Mint now: an operation runs (or ran) for the item
const AFTER_MINT_NOW = ["wallet", "sign", "minting", "done"];
// Mint now is out (the wallet's addresses, then the request): the server may be preparing it
const MINT_NOW_OUT = ["addresses", "mint"];

const MintFlow = ({
  item,
  onClose,
  onToItem,
  onChanged,
  onGoTo,
  onPhase = () => {},
}) => {
  const classes = useStyles();
  const [state, setState] = useState(null);
  const current = useRef(null);
  const alive = useRef(true);
  const wallet = useRef({ name: null, api: null });
  const [door, setDoor] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // every event goes through the flow; the new state is known at once (the effects read it)
  const send = useCallback((event) => {
    const before = current.current;
    if (!alive.current || !before) {
      return before;
    }
    const next = mintFlow(before, event);
    if (next !== before) {
      current.current = next;
      setState(next);
    }
    return next;
  }, []);

  const askReadiness = useCallback(() => {
    const before = current.current;
    const next = send({ type: "request", what: "readiness", itemId: item.id });
    if (next === before || next.pending !== "readiness") {
      return;
    }
    held(chainApi.readiness(item.id)).then(
      (answer) => send({ type: "readiness", answer, itemId: item.id }),
      (failure) => send({ type: "problem", failure, during: "readiness" })
    );
  }, [item.id, send]);

  // the first state: the explainer read before, this device's own key (never a mint target),
  // this tab's sign code of the item's operation; then the readiness
  useEffect(() => {
    alive.current = true;
    // this run's own end (a second run of the effect never sees the first one's answers)
    let gone = false;
    const close = following.openDialog();
    (async () => {
      const explained = await OfflineStore.settingsStore
        .get(MINT_EXPLAINED)
        .catch(() => false);
      let wordsSubject = null;
      try {
        const words = await keyStore.load();
        wordsSubject = words ? await subjectOfWords(words) : null;
      } catch (failure) {
        logger.info("could not read the key on this device", failure);
      }
      if (gone) {
        return;
      }
      const network = features.network();
      const operationId = item.minted && item.minted.operationId;
      const first = initialState({
        item,
        explained: Boolean(explained),
        signCode: readCode(operationId),
        network: network ? networkLabel(network.name) : null,
        wordsSubject,
        here: signingHere(),
      });
      current.current = first;
      setState(first);
      askReadiness();
    })();
    return () => {
      gone = true;
      alive.current = false;
      close();
    };
    // the dialog is made anew for each item
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // after Check again: the checklist asks anew
  const needsReadiness =
    state !== null &&
    state.step === "check" &&
    state.readiness === null &&
    state.pending === null &&
    !state.problem;
  useEffect(() => {
    if (needsReadiness) {
      askReadiness();
    }
  }, [needsReadiness, askReadiness]);

  // one place polls an operation: the dialog while it shows it
  const target = state ? pollTarget(state) : null;
  useEffect(() => {
    if (!target) {
      return undefined;
    }
    const release = following.hold(target);
    const stop = pollOperation({
      fetch: () => held(chainApi.operation(target)),
      onAnswer: (operation) => {
        following.note(operation);
        send({ type: "operation", operation });
      },
      onFailure: (failure) =>
        send({ type: "problem", failure, during: "operation" }),
      ended: (operation) => !operation || !RUNNING.includes(operation.state),
    });
    return () => {
      stop();
      release();
    };
  }, [target, send]);

  // the item's mark changes with its operation: the stats are read again
  const operationState =
    state && state.operation ? state.operation.state : null;
  useEffect(() => {
    if (operationState) {
      onChanged();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operationState]);

  // this tab's sign code lives as long as the flow holds it: dropped when the flow lets go of it
  // (signed, ended, no longer taken, or the flow left the operation), kept when the dialog closes
  const signCode = state ? state.signCode : null;
  const operationId = state ? state.operationId : null;
  const heldCode = useRef(null);
  useEffect(() => {
    const holding = signCode && operationId ? operationId : null;
    if (heldCode.current && heldCode.current !== holding) {
      dropCode(heldCode.current);
    }
    heldCode.current = holding;
  }, [signCode, operationId]);

  // an operation learned without its code (the dialog was closed while Mint now was out, then
  // opened again; Mint now's answer came after the dialog stopped waiting for it): this tab may
  // have kept it, or keeps it when that answer arrives
  const learned =
    state && state.operation && state.operation.state === "prepared"
      ? state.operation.id
      : null;
  useEffect(() => {
    if (!learned || signCode) {
      return undefined;
    }
    const code = readCode(learned);
    if (code) {
      send({ type: "signCode", operationId: learned, signCode: code });
      return undefined;
    }
    return onCode((id, kept) => {
      if (id === learned) {
        send({ type: "signCode", operationId: id, signCode: kept });
      }
    });
  }, [learned, signCode, send]);

  // the wallet door belongs to the wallet step and its sign code: it never stays open (nor opens
  // again by itself on a later operation) once the step moves on or the code is gone (the poll
  // ended the operation, another tab cancelled it)
  const doorStep = state ? state.step : null;
  useEffect(() => {
    if (door && !(doorStep === "wallet" && signCode)) {
      setDoor(false);
    }
  }, [door, doorStep, signCode]);

  // a problem that asks for a new connection: the wallet's api is asked for anew
  const problem = state ? state.problem : null;
  useEffect(() => {
    if (problem && problem.reconnect) {
      wallet.current = { name: null, api: null };
    }
  }, [problem]);

  // whether a minting runs here (the steps after Mint now, or an operation the flow follows),
  // and whether a signature attempt is out: Lab keeps the dialog open through a connection
  // that blips while one runs, and through anything while a signature is out
  const running =
    state !== null &&
    (AFTER_MINT_NOW.includes(state.step) ||
      MINT_NOW_OUT.includes(state.pending) ||
      Boolean(state.operation && RUNNING.includes(state.operation.state)));
  const signing = state !== null && state.step === "sign";
  useEffect(() => {
    onPhase({ running, signing });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, signing]);

  // the scroll area's cue: whether more of the step is above or below its view, from its real
  // scroll state (measured after every render, on scrolling, and when its size or a child's
  // changes)
  const scrollArea = useRef(null);
  const [cue, setCue] = useState({ above: false, below: false });
  const measureCue = useCallback(() => {
    const area = scrollArea.current;
    if (!area) {
      return;
    }
    const next = scrollCue(area);
    setCue((before) =>
      before.above === next.above && before.below === next.below ? before : next
    );
  }, []);
  useLayoutEffect(() => {
    measureCue();
  });
  const shownStep = state ? state.step : null;
  useEffect(() => {
    const area = scrollArea.current;
    window.addEventListener("resize", measureCue);
    const observer =
      area && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measureCue)
        : null;
    if (observer) {
      observer.observe(area);
      [...area.children].forEach((child) => observer.observe(child));
    }
    return () => {
      window.removeEventListener("resize", measureCue);
      if (observer) {
        observer.disconnect();
      }
    };
  }, [measureCue, shownStep]);

  const now = useSignClock(
    state !== null && state.step === "wallet",
    state && state.operation ? state.operation.signUntil : null
  );

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

  const back = () => {
    const before = current.current;
    if (before.step === "explain" && !before.explained) {
      onToItem();
      return;
    }
    const next = send({ type: "back" });
    if (
      next !== before &&
      next.pending === "cancel" &&
      before.pending !== "cancel"
    ) {
      sendCancel();
    }
  };

  const howItWorks = () => {
    send({ type: "next", now: Date.now() });
    OfflineStore.settingsStore
      .set(MINT_EXPLAINED, true)
      .catch((failure) => logger.info("could not keep mintExplained", failure));
  };

  // Mint now: an injected wallet shows its own addresses first (never a mint without them on
  // that path); a wallet elsewhere (a phone) signs on the sign page, which proves them there
  const mintNow = async () => {
    let next = current.current;
    const name = injectedName(pickedEntry(next));
    if (name) {
      const before = next;
      next = send({ type: "request", what: "addresses" });
      if (next === before || next.pending !== "addresses") {
        return;
      }
      let addresses;
      try {
        const api = await apiOf(name);
        try {
          addresses = await walletAddresses(api);
        } catch (failure) {
          send({ type: "problem", failure, during: "addresses" });
          return;
        }
      } catch (failure) {
        send({ type: "problem", failure, during: "connect" });
        return;
      }
      send({ type: "addresses", addresses });
      next = send({ type: "request", what: "mint", path: "extension" });
    } else {
      next = send({ type: "request", what: "mint", path: "phone" });
    }
    if (next.pending !== "mint") {
      return;
    }
    const call = chainApi.mint(mintRequest(next));
    // the sign code is this tab's as soon as the answer arrives, however late: kept, and told to
    // the flow that learned the operation without it (this dialog, or one opened again since)
    call.then(
      (answer) => {
        const id = answer && answer.operation && answer.operation.id;
        const code = answer && answer.signCode;
        keepCode(id, code);
        send({ type: "signCode", operationId: id, signCode: code });
        if (!alive.current) {
          // closed meanwhile: the item is locked now, and its card says so
          onChanged();
        }
      },
      () => {}
    );
    held(call).then(
      (answer) => send({ type: "prepared", answer }),
      (failure) => send({ type: "problem", failure, during: "mint" })
    );
  };

  // the signature with an injected wallet `name` (the picked one, or the door's choice)
  const signWith = async (name) => {
    const before = current.current;
    const next = send({ type: "signing", via: "extension", now: Date.now() });
    if (next === before || next.step !== "sign") {
      return;
    }
    const picked = pickedEntry(next);
    const other = picked && picked.name === name ? undefined : name;
    const code = next.signCode;
    // every outcome names the operation it was for: a late one of a left operation is dropped
    const operationId = next.operationId;
    let api;
    try {
      api = await apiOf(name);
    } catch (failure) {
      send({
        type: "problem",
        failure,
        during: "connect",
        wallet: other,
        operationId,
      });
      return;
    }
    let signed;
    try {
      const info = await held(chainApi.signInfo(code));
      signed = await signPrepared(api, {
        api: chainApi,
        code,
        info,
        network: features.network(),
      });
    } catch (failure) {
      send({
        type: "problem",
        failure,
        during: "sign",
        wallet: other,
        operationId,
      });
      return;
    }
    try {
      const answer = await held(chainApi.sign(code, signed.witness));
      send({ type: "signed", answer });
    } catch (failure) {
      send({
        type: "problem",
        failure,
        during: "submit",
        wallet: other,
        operationId,
      });
    }
  };

  const openWallet = () => {
    const name = injectedName(pickedEntry(current.current));
    if (name) {
      signWith(name);
    } else {
      setDoor(true);
    }
  };

  // Open wallet again on the phone path's waiting step: the wallet step, and its door at once
  // when signing is still open (the window, this tab's code)
  const openWalletAgain = () => {
    const next = send({ type: "walletAgain" });
    if (next.step === "wallet" && canSign(next, Date.now())) {
      openWallet();
    }
  };

  const lineAction = (action, line) => {
    if (action === "connect") {
      setConnecting(true);
    } else if (action === "goTo") {
      onGoTo(line.operation.itemId);
    } else {
      send({ type: "retry" });
    }
  };

  const problemAction = (action) => {
    if (action === "cancel") {
      cancel();
    } else if (action === "back") {
      back();
    } else {
      send({ type: "retry" });
    }
  };

  if (state === null) {
    return (
      <Dialog open close={onClose} title={t(tr.MINT_CHECK_TITLE)}>
        <div
          className={classes.body}
          data-testid="mint-dialog"
          data-step="loading"
        >
          <p className={classes.text}>{t(tr.MINT_CHECKING)}</p>
        </div>
      </Dialog>
    );
  }

  const step = state.step;
  const busy = state.pending !== null;
  const costs = safeCosts(state);
  const name = itemName(item.item);
  const cancellable = canCancel(state);
  const ruledOut = noSigning(state);
  // the picked wallet cannot sign on this device: the cost screen says where to mint, and
  // prepares nothing (Mint now would end at a door with no way to sign)
  const away = step === "costs" ? elsewhere(state) : null;

  // the step's own buttons, and whether the problem's action repeats one of them
  // the step's content scrolls when the dialog is short; its buttons (`actions`) stay below it
  let content;
  let actions;
  let ownAction = null;
  if (step === "explain") {
    content = (
      <>
        <p className={classes.text}>{t(tr.MINT_EXPLAIN_TEXT)}</p>
        <div className={classes.cards}>
          {[
            ["MINT_EXPLAIN_YOURS_TITLE", "MINT_EXPLAIN_YOURS"],
            ["MINT_EXPLAIN_GIVE_TITLE", "MINT_EXPLAIN_GIVE"],
            ["MINT_EXPLAIN_PLAY_TITLE", "MINT_EXPLAIN_PLAY"],
          ].map(([title, text]) => (
            <div key={title} className={classes.card}>
              <span className={classes.cardTitle}>{t(tr[title])}</span>
              {t(tr[text])}
            </div>
          ))}
        </div>
        <p className={classes.note}>{t(tr.MINT_FINAL)}</p>
      </>
    );
    actions = (
      <div className={classes.buttons}>
        <Button color="primary" onClick={howItWorks} data-testid="mint-how">
          {t(tr.MINT_HOW)}
        </Button>
        <Button color="secondary" onClick={back} data-testid="mint-back">
          {t(tr.MINT_BACK)}
        </Button>
      </div>
    );
  } else if (step === "check") {
    const lines = checklistOf(state, Date.now());
    ownAction = "recheck";
    content = (
      <>
        <p className={classes.text}>{t(tr.MINT_CHECK_TEXT)}</p>
        {state.readiness === null && state.pending === "readiness" ? (
          <p
            className={`${classes.text} ${classes.soft}`}
            data-testid="mint-checking"
          >
            {t(tr.MINT_CHECKING)}
          </p>
        ) : null}
        <MintChecklist
          lines={lines}
          onAction={lineAction}
          onPick={(subject) => send({ type: "pickWallet", subject })}
          disabled={busy}
        />
      </>
    );
    actions = (
      <div className={classes.buttons}>
        <Button
          color="primary"
          onClick={() => send({ type: "next", now: Date.now() })}
          disabled={busy || !canContinue(lines)}
          data-testid="mint-next"
        >
          {t(tr.MINT_NEXT)}
        </Button>
        <button
          type="button"
          className={classes.link}
          onClick={() => send({ type: "retry" })}
          disabled={busy}
          data-testid="mint-recheck"
        >
          {t(tr.MINT_RECHECK)}
        </button>
        <button
          type="button"
          className={classes.link}
          onClick={() => send({ type: "explain" })}
          disabled={busy}
          data-testid="mint-what"
        >
          {t(tr.MINT_WHAT)}
        </button>
      </div>
    );
  } else if (step === "costs") {
    content = (
      <>
        <p className={classes.text}>{t(tr.MINT_COSTS_TEXT)}</p>
        <MintCosts
          costs={costs}
          choice={state.readiness ? feeChoice(state.readiness.gameFees) : null}
          fee={state.fee}
          onPickFee={(fee) => send({ type: "pickFee", fee })}
          disabled={busy}
        />
        <p className={classes.note}>{t(tr.MINT_FINAL)}</p>
      </>
    );
    actions = (
      <div className={classes.buttons}>
        <Button
          color="gold"
          onClick={mintNow}
          disabled={busy || mintRequest(state) === null || away !== null}
          data-testid="mint-now"
        >
          {t(tr.MINT_NOW)}
        </Button>
        <Button
          color="secondary"
          onClick={back}
          disabled={busy}
          data-testid="mint-back"
        >
          {t(tr.MINT_BACK)}
        </Button>
        <button
          type="button"
          className={classes.link}
          onClick={() => send({ type: "explain" })}
          disabled={busy}
          data-testid="mint-what"
        >
          {t(tr.MINT_WHAT)}
        </button>
      </div>
    );
  } else if (step === "wallet") {
    const window_ = signWindow(state.operation, now);
    const confirmed = walletTextKey(state) === "MINT_WALLET_TEXT";
    const exactShown = Boolean(costs) && costs.exact && costs.confirmed;
    ownAction = cancellable && !ruledOut ? "back" : null;
    const box = (
      <div className={classes.walletBox} data-testid="mint-wallet-box">
        <div className={classes.walletRow}>
          <span>{t(tr.MINT_YOU_GIVE)}</span>
          <span className={classes.give} data-testid="mint-total">
            {/* what leaves the wallet (a wallet shows the net change of its balance: the
                item's own deposit comes back to it), exact only once the wallet vouched for
                the addresses: before that the sign page may build the minting anew for them,
                and the fee can change */}
            {costs ? `− ${amount(costs.give, exactShown)}` : ""}
            {costs && costs.gameFee && !costs.gameFee.ada ? (
              <>
                <br />
                {`− ${t(tr.MINT_AMOUNT, costs.gameFee.amount, costs.gameFee.label)}`}
              </>
            ) : null}
          </span>
        </div>
        <div className={classes.walletRow}>
          <span>{t(tr.MINT_YOU_GET)}</span>
          <span className={classes.get}>
            {t(tr.MINT_GET_ITEM, name, item.serial)}
            {costs && costs.stays ? (
              <span className={classes.stays} data-testid="mint-stays">
                {t(tr.MINT_GET_DEPOSIT, amount(costs.stays, exactShown))}
              </span>
            ) : null}
          </span>
        </div>
      </div>
    );
    // signing is ruled out (the signature may have gone out unheard, or the minting must start
    // again): the problem and what was signed for, nothing that asks for the wallet (its own
    // action, Back, is the problem's)
    content = ruledOut ? (
      box
    ) : (
      <>
        <p className={classes.text}>{t(tr[walletTextKey(state)])}</p>
        {box}
        {confirmed ? null : (
          <p className={classes.text}>{t(tr.MINT_SIGN_TWICE)}</p>
        )}
        <p className={classes.text}>{t(tr.MINT_WALLET_CONFIRM)}</p>
        {window_ && !window_.over ? (
          <p
            className={`${classes.note} ${classes.soft}`}
            data-testid="mint-time"
          >
            {window_.minutes === 1
              ? t(tr.MINT_WALLET_TIME_ONE)
              : t(tr.MINT_WALLET_TIME, window_.minutes)}
          </p>
        ) : null}
      </>
    );
    actions = ruledOut ? null : (
      <div className={classes.buttons}>
        <Button
          color="primary"
          onClick={openWallet}
          disabled={!canSign(state, now)}
          data-testid="mint-open-wallet"
        >
          {t(tr.MINT_OPEN_WALLET)}
        </Button>
        <Button
          color="secondary"
          onClick={back}
          disabled={!cancellable}
          data-testid="mint-back"
        >
          {t(tr.MINT_BACK)}
        </Button>
      </div>
    );
  } else if (step === "sign") {
    ownAction = cancellable ? "cancel" : null;
    content = (
      <>
        <div className={classes.coin} aria-hidden="true">
          <svg
            width="58"
            height="58"
            viewBox="0 0 24 24"
            fill="none"
            stroke={MINT_LOOK.goldInk}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8 3h8l-1 8h4v4H5v-4h4z" />
            <path d="M4 20h16" />
          </svg>
        </div>
        <p className={classes.text}>
          {t(
            state.via === "phone" ? tr.MINT_SIGN_PHONE : tr.MINT_WALLET_CONFIRM
          )}
        </p>
      </>
    );
    // the phone path: the deep link may have failed, or the player came back before signing;
    // the wallet opens again, and nothing is cancelled
    const again = state.via === "phone" && state.pending === null;
    actions =
      again || cancellable ? (
        <div className={classes.buttons}>
          {again ? (
            <Button
              color="primary"
              onClick={openWalletAgain}
              data-testid="mint-open-wallet"
            >
              {t(tr.MINT_OPEN_WALLET)}
            </Button>
          ) : null}
          {cancellable ? (
            <Button
              color="secondary"
              onClick={cancel}
              data-testid="mint-cancel"
            >
              {t(tr.MINT_CANCEL)}
            </Button>
          ) : null}
        </div>
      ) : null;
  } else if (step === "minting") {
    content = (
      <>
        <div
          className={classes.coin}
          aria-hidden="true"
          data-testid="mint-coin"
        >
          <svg
            width="58"
            height="58"
            viewBox="0 0 24 24"
            fill="none"
            stroke={MINT_LOOK.goldInk}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8 3h8l-1 8h4v4H5v-4h4z" />
            <path d="M4 20h16" />
          </svg>
        </div>
        <p className={classes.text}>{t(tr.MINT_MINTING_TEXT)}</p>
        {state.operation && state.operation.slow ? (
          <p className={classes.note} data-testid="mint-slow">
            {t(tr.MINT_MINTING_SLOW)}
          </p>
        ) : null}
      </>
    );
    actions = (
      <div className={classes.buttons}>
        <Button
          color="primary"
          onClick={onClose}
          data-testid="mint-keep-playing"
        >
          {t(tr.MINT_KEEP_PLAYING)}
        </Button>
      </div>
    );
  } else if (step === "done") {
    content = (
      <>
        <div className={classes.done}>
          <ItemIcon
            item={item.item}
            size={DONE_ICON}
            large
            minted={{ state: "minted" }}
            serial={item.serial}
          />
        </div>
        <div
          className={classes.name}
        >{`${name} ${t(tr.ITEM_SERIAL, item.serial)}`}</div>
        <p className={classes.text}>{t(tr.MINT_DONE_TEXT)}</p>
      </>
    );
    actions = (
      <div className={classes.buttons}>
        <Button color="primary" onClick={onToItem} data-testid="mint-to-item">
          {t(tr.MINT_TO_ITEM)}
        </Button>
      </div>
    );
  } else {
    // nothing happened, or it failed: the problem says why
    const again =
      step === "nothing" || (state.problem && state.problem.action === "retry");
    ownAction = again ? "retry" : null;
    content = null;
    actions = (
      <div className={classes.buttons}>
        {again ? (
          <Button
            color="primary"
            onClick={() => send({ type: "retry" })}
            disabled={busy}
            data-testid="mint-again"
          >
            {t(tr.MINT_AGAIN)}
          </Button>
        ) : null}
        {cancellable ? (
          <Button color="secondary" onClick={cancel} data-testid="mint-cancel">
            {t(tr.MINT_CANCEL)}
          </Button>
        ) : null}
        <Button color="secondary" onClick={onToItem} data-testid="mint-to-item">
          {t(tr.MINT_TO_ITEM)}
        </Button>
      </div>
    );
    if (cancellable) {
      ownAction = ownAction || "cancel";
    }
  }

  const shown = state.problem || away;
  const action =
    shown && shown.action && shown.action !== ownAction && ACTIONS[shown.action]
      ? shown.action
      : null;
  return (
    <Dialog
      open
      close={onClose}
      title={
        <span className={step === "done" ? classes.gold : undefined}>
          {t(
            tr[
              step === "wallet" && ruledOut ? "MINT_STATUS_TITLE" : TITLES[step]
            ]
          )}
        </span>
      }
    >
      <div className={classes.body} data-testid="mint-dialog" data-step={step}>
        <div
          className={classes.scroll}
          ref={scrollArea}
          onScroll={measureCue}
          style={
            fadeMask(cue)
              ? { maskImage: fadeMask(cue), WebkitMaskImage: fadeMask(cue) }
              : undefined
          }
          data-testid="mint-scroll"
          data-more-above={cue.above ? "true" : "false"}
          data-more-below={cue.below ? "true" : "false"}
        >
          {shown ? (
            <div
              className={classes.problem}
              role="alert"
              data-testid="mint-problem"
              data-key={shown.key}
            >
              <p className={classes.problemText}>
                {say(shown.key, shown.values)}
              </p>
              {shown.detail ? (
                <p className={classes.detail}>
                  {t(tr.LINK_DETAILS, shown.detail)}
                </p>
              ) : null}
              {action ? (
                <Button
                  color={action === "cancel" ? "accent" : "secondary"}
                  onClick={() => problemAction(action)}
                  disabled={
                    action === "cancel" || action === "back"
                      ? !cancellable
                      : busy
                  }
                  data-testid={ACTIONS[action][1]}
                >
                  {t(tr[ACTIONS[action][0]])}
                </Button>
              ) : null}
            </div>
          ) : null}
          {content}
        </div>
        {actions}
      </div>
      {connecting ? (
        <MintConnect
          onDone={() => {
            setConnecting(false);
            send({ type: "retry" });
          }}
        />
      ) : null}
      {door && step === "wallet" && state.signCode ? (
        <Suspense fallback={null}>
          <WalletDoor
            open
            purpose="sign"
            signPageUrl={signPageUrl(state.signCode)}
            onClose={() => setDoor(false)}
            onWallet={(walletName) => {
              setDoor(false);
              signWith(walletName);
            }}
            onPhone={() => {
              setDoor(false);
              send({ type: "signing", via: "phone", now: Date.now() });
            }}
            onDone={() => setDoor(false)}
          />
        </Suspense>
      ) : null}
    </Dialog>
  );
};

/**
 * The minting dialog for `item` (an entry of stats.items), while `open`. `onClose()`: closed
 * (nothing is cancelled); `onToItem()`: back to the item's card; `onChanged()`: the item's mark
 * may have changed (the stats are read again); `onGoTo(itemId)`: another item's card (its
 * operation runs); `onPhase({ running, signing })`: whether a minting runs here (after Mint now)
 * and whether a signature attempt is out.
 */
const MintDialog = ({
  open,
  item,
  onClose,
  onToItem,
  onChanged,
  onGoTo,
  onPhase,
}) =>
  open && item ? (
    <MintFlow
      key={item.id}
      item={item}
      onClose={onClose}
      onToItem={onToItem}
      onChanged={onChanged}
      onGoTo={onGoTo}
      onPhase={onPhase}
    />
  ) : null;

export default MintDialog;
