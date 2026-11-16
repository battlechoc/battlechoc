import { useEffect } from "react";
import { createUseStyles } from "react-jss";
import {
  chain,
  getCurrentLanguage,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import Dialog from "../dialogs/Dialog";
import Button from "../controls/Button";
import IngredientIcon from "../ingredients/IngredientIcon";
import { itemName } from "../lab/itemText";
import { networkLabel } from "../account/safetyState";
import { chainApi } from "../../api/chain";
import { cardanoApi } from "../../api/cardano";
import { features, subjectOfWallet, walletAddresses } from "../../cardano";
import logger from "../../helper/logger";
import { canCancel, canSign, signWindow, walletStepView } from "./mintFlow";
import { useFlow } from "./useFlow";
import { ProblemBox, SignDoor } from "./FlowParts";
import {
  canConfirm,
  elsewhere,
  initialSalvage,
  pathOf,
  salvageFlow,
  salvagePollTarget,
  salvageRequest,
  signedHere,
  signerOf,
  walletWords,
} from "./salvageFlow";
import {
  countedList,
  missingList,
  plainMissing,
  plainOfFull,
  salvageRows,
} from "./salvageRows";
import { salvageKey } from "./salvageTexts";
import { adaText, burnChange, formatAda } from "./ada";
import { following } from "./operationPoll";
import { signOperation, useOperationPoll, useSignCode } from "./operationHooks";
import { held } from "./held";
import { keepCode, readCode } from "./signCodes";
import { signingHere } from "./signingHere";
import { fadeMask, useScrollCue } from "./useScrollCue";
import { dialogSheet, salvageSheet } from "./mintSheets";
import { MINT_LOOK } from "./mintLook";
import { say } from "./mintText";
import useSignClock from "./useSignClock";

// The salvage of a minted item (the owner's mockup, board 2): the confirmation ("Zerlegen?"),
// "your wallet opens now", the signature, "being salvaged" ("Wird zerlegt …"), or what stopped
// it. The flow's state and its rules are salvageFlow.js's; this component performs what the
// state asks for (the item's wallet from the account's keys, the extension's addresses, the
// burn, the signature, a cancel, the poll) and reports each answer as an event, as MintDialog.jsx
// does for minting, with the same effects (operationHooks.js). Closing never cancels anything: a
// burn that runs keeps running, and the watcher follows it until the ingredients arrive (the
// title screen's notice). Loaded when it opens (src/helper/loadChunk.js).

const useDialogStyles = createUseStyles(dialogSheet);
const useStyles = createUseStyles(salvageSheet);

// the operation's states a salvage runs in (the dialog keeps itself open through a blip)
const RUNNING = ["prepared", "submitted"];
const AFTER_YES = ["wallet", "sign", "running"];

// the problem's own button besides the step's (retry, recheck, reread: the account's keys read
// again, cancel, back)
const ACTIONS = {
  retry: ["MINT_AGAIN", "salvage-again"],
  recheck: ["MINT_RECHECK", "salvage-again"],
  reread: ["MINT_AGAIN", "salvage-again"],
  cancel: ["MINT_CANCEL", "salvage-cancel-operation"],
  back: ["MINT_BACK", "salvage-back"],
};

const TITLES = {
  wallet: "MINT_WALLET_TITLE",
  sign: "MINT_SIGN_WAITING",
  running: "SALVAGE_MINTED_RUNNING",
  nothing: "MINT_NOTHING_TITLE",
  failed: "SALVAGE_FAILED_TITLE",
};

// an amount of lovelace as the dialog shows it (adaText), nothing for one in another form
const amount = (lovelace, options = {}) => {
  try {
    return adaText(lovelace, getCurrentLanguage(), options);
  } catch {
    return "";
  }
};

// what the wallet will show for the burn `operation` (burnChange), nothing for amounts an older
// API sent in another form
const changeOf = (operation) => {
  try {
    return operation && operation.costs ? burnChange(operation.costs) : null;
  } catch {
    return null;
  }
};

const ingredientName = (id) => t(tr[`INGREDIENT_${id}`]);

// "1 Vanilla and 2 Milk" in the player's language
const listOf = (entries) => countedList(entries, getCurrentLanguage());

const ICON = { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none" };

const SalvageFlow = ({
  item,
  book,
  slotName,
  onClose,
  onToItem,
  onChanged,
  onPhase = () => {},
}) => {
  const classes = { ...useDialogStyles(), ...useStyles() };
  // the flow, driven as the minting's is (useFlow.js): its state, the wallet's api, the door
  const flow = useFlow(salvageFlow);
  const { state, current, send, apiOf, setDoor } = flow;

  // the account's keys (which wallet holds the item); null when they could not be read
  const readKeys = async () => {
    try {
      return await held(cardanoApi.identities());
    } catch (failure) {
      logger.info("could not read the linked keys", failure);
      return null;
    }
  };

  // the first state: the account's keys, this tab's sign code
  useEffect(() => {
    let gone = false;
    const close = following.openDialog();
    (async () => {
      const identities = await readKeys();
      if (gone) {
        return;
      }
      const network = features.network();
      const operationId = item.minted && item.minted.operationId;
      flow.begin(
        initialSalvage({
          item,
          identities,
          signCode: readCode(operationId),
          network: network ? networkLabel(network.name) : null,
          here: signingHere(),
        })
      );
    })();
    return () => {
      gone = true;
      close();
    };
    // the dialog is made anew for each item
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useOperationPoll(state ? salvagePollTarget(state) : null, send);
  useSignCode(state, send);

  // the item's mark changes with its burn: the stats are read again
  const operationState =
    state && state.operation ? state.operation.state : null;
  useEffect(() => {
    if (operationState) {
      onChanged();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operationState]);

  const running =
    state !== null &&
    (AFTER_YES.includes(state.step) ||
      ["addresses", "burn"].includes(state.pending) ||
      Boolean(state.operation && RUNNING.includes(state.operation.state)));
  const signing = state !== null && state.step === "sign";
  useEffect(() => {
    onPhase({ running, signing });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, signing]);

  const {
    ref: scrollArea,
    cue,
    measure: measureCue,
  } = useScrollCue(state ? state.step : null);

  const now = useSignClock(
    state !== null && state.step === "wallet",
    state && state.operation ? state.operation.signUntil : null
  );

  // POST /chain/burn for the state's request; once more when the flow asks again (the phone
  // path learned the holder's wallet from the server)
  const sendBurn = () => {
    const call = chainApi.burn(salvageRequest(current.current));
    // the sign code is this tab's as soon as the answer arrives, however late; the item is
    // locked by it, and its card says so (also while this dialog shows an answer it lost)
    call.then(
      (answer) => {
        const id = answer && answer.operation && answer.operation.id;
        const code = answer && answer.signCode;
        keepCode(id, code);
        send({ type: "signCode", operationId: id, signCode: code });
        onChanged();
      },
      () => {}
    );
    held(call).then(
      (answer) => send({ type: "prepared", answer }),
      (failure) => {
        const next = send({ type: "problem", failure, during: "burn" });
        if (next && next.pending === "burn") {
          sendBurn();
        } else if (next && next.step === "failed") {
          // the item may be locked (a prepare unheard) or gone: the card shows it as it is
          onChanged();
        }
      }
    );
  };

  // Yes, salvage: an injected wallet names its addresses and its account first (another account
  // than the holder's ends there: nothing is prepared); a phone's wallet app proves them on the
  // sign page
  const confirm = async () => {
    let next = current.current;
    const way = pathOf(next);
    if (way.path === "extension") {
      const before = next;
      next = send({ type: "request", what: "addresses" });
      if (next === before || next.pending !== "addresses") {
        return;
      }
      let api;
      try {
        api = await apiOf(way.wallet);
      } catch (failure) {
        send({ type: "problem", failure, during: "connect" });
        return;
      }
      let addresses;
      let subject;
      try {
        addresses = await walletAddresses(api);
        subject = await subjectOfWallet(api);
      } catch (failure) {
        send({ type: "problem", failure, during: "addresses" });
        return;
      }
      send({ type: "addresses", addresses, subject });
      next = send({ type: "request", what: "burn", path: "extension" });
    } else {
      next = send({ type: "request", what: "burn", path: "phone" });
    }
    if (next.pending === "burn") {
      sendBurn();
    }
  };

  const { cancel, back } = flow;

  const signWith = async (name) => {
    const before = current.current;
    const next = send({ type: "signing", via: "extension", now: Date.now() });
    if (next === before || next.step !== "sign") {
      return;
    }
    const own = pathOf(next);
    await signOperation({
      apiOf,
      name,
      code: next.signCode,
      operationId: next.operationId,
      other: own.path === "extension" && own.wallet === name ? undefined : name,
      send,
    });
  };

  const openWallet = () => {
    const way = pathOf(current.current);
    if (way.path === "extension" && way.wallet) {
      signWith(way.wallet);
    } else {
      setDoor(true);
    }
  };

  const openWalletAgain = () => flow.openWalletAgain(openWallet);

  // the problem's own button: the account's keys read again (the confirmation on a phone), else
  // the flow's (Check again and Try again read what this device can sign with anew)
  const problemAction = (action) => {
    if (action === "reread") {
      readKeys().then((identities) => send({ type: "identities", identities }));
      return;
    }
    flow.problemAction(action);
  };

  if (state === null) {
    return (
      <Dialog
        open
        close={onClose}
        title={t(tr.SALVAGE_TITLE, itemName(item.item), item.serial)}
      >
        <div
          className={classes.body}
          data-testid="salvage-minted"
          data-step="loading"
        >
          <p className={classes.text}>{t(tr.MINT_LOADING)}</p>
        </div>
      </Dialog>
    );
  }

  const step = state.step;
  const busy = state.pending !== null;
  const name = itemName(item.item);
  const cancellable = canCancel(state);
  const walletView = step === "wallet" ? walletStepView(state) : null;
  const ruledOut = Boolean(walletView) && !walletView.prompts;
  const away = step === "confirm" ? elsewhere(state) : null;

  let content;
  let actions;
  let ownAction = null;
  if (step === "confirm") {
    const recipe =
      book && Array.isArray(book.recipes)
        ? book.recipes.find((entry) => entry.item === item.item)
        : null;
    const amounts = recipe ? recipe.amounts : null;
    const rows = salvageRows(amounts, { minted: true });
    const full = rows.some((row) => row.rule === "full");
    const plain = plainOfFull(rows, amounts);
    const missing = plainMissing(rows, amounts);
    const signer = signerOf(state);
    const language = getCurrentLanguage();
    content = (
      <div
        className={classes.confirm}
        data-testid="salvage-confirm"
        data-kind="minted"
      >
        <p className={classes.text}>{t(tr.SALVAGE_MINTED_INTRO)}</p>
        <div className={classes.rows}>
          {rows.map((row) => (
            <div
              key={row.ingredient}
              className={classes.row}
              data-testid="salvage-row"
              data-ingredient={row.ingredient}
              data-amount={row.amount}
              data-rule={row.rule}
            >
              <IngredientIcon id={row.ingredient} size="1.5em" />
              <span className={classes.rowName}>
                {ingredientName(row.ingredient)}{" "}
                {row.rule === "full" ? (
                  <span className={classes.full}>
                    {t(
                      row.rarity === "legendary"
                        ? tr.SALVAGE_LEGENDARY_FULL
                        : tr.SALVAGE_RARE_FULL
                    )}
                  </span>
                ) : (
                  <span className={classes.half}>{t(tr.SALVAGE_HALF)}</span>
                )}
              </span>
              <span className={classes.amount}>{row.amount}</span>
            </div>
          ))}
          {rows.length > 0 ? <div className={classes.line} /> : null}
          <div className={classes.row} data-testid="salvage-deposit">
            <span className={classes.rowName}>{t(tr.SALVAGE_DEPOSIT)}</span>
            <span className={classes.amount}>
              {amount(String(chain.BURN_DEPOSIT_BACK_ESTIMATE_LOVELACE), {
                round: "down",
              })}
            </span>
          </div>
        </div>
        <p className={classes.note}>{t(tr.SALVAGE_MINTED_WHEN)}</p>
        {full ? (
          <p className={classes.advantage} data-testid="salvage-advantage">
            {t(tr.SALVAGE_MINTED_ADVANTAGE)}{" "}
            {plain.length > 0
              ? t(tr.SALVAGE_MINTED_COMPARE, listOf(plain))
              : t(tr.SALVAGE_MINTED_COMPARE_NONE)}
            {plain.length > 0 && missing.length > 0
              ? ` ${t(
                  tr.SALVAGE_MINTED_COMPARE_MISSING,
                  missingList(missing, getCurrentLanguage())
                )}`
              : null}
          </p>
        ) : null}
        <p
          className={`${classes.text} ${classes.soft}`}
          data-testid="salvage-wallet"
        >
          {t(
            tr.SALVAGE_MINTED_WALLET,
            formatAda(
              String(chain.BURN_NETWORK_FEE_ESTIMATE_LOVELACE),
              language
            )
          )}
          {signer && signer.address ? (
            <>
              <br />
              {signer.name
                ? say("SALVAGE_MINTED_SIGNER", {
                    wallet: signer.name,
                    address: signer.address,
                  })
                : say("SALVAGE_MINTED_SIGNER_NAMELESS", {
                    address: signer.address,
                  })}
            </>
          ) : null}
        </p>
        {slotName ? (
          <p className={classes.note} data-testid="salvage-unequips">
            {t(tr.SALVAGE_UNEQUIPS, slotName)}
          </p>
        ) : null}
      </div>
    );
    actions = (
      <div className={classes.buttons}>
        <Button
          color="accent"
          onClick={confirm}
          disabled={!canConfirm(state) || !recipe}
          data-testid="salvage-confirm-button"
        >
          {t(tr.SALVAGE_CONFIRM)}
        </Button>
        <Button
          color="secondary"
          onClick={onToItem}
          disabled={busy}
          data-testid="salvage-cancel"
        >
          {t(tr.SALVAGE_CANCEL)}
        </Button>
      </div>
    );
  } else if (step === "wallet") {
    const window_ = signWindow(state.operation, now);
    const words = walletWords(state);
    const confirmed = words === "confirmed";
    const change = changeOf(state.operation);
    ownAction = cancellable && walletView.back ? "back" : null;
    const box = (
      <div className={classes.walletBox} data-testid="salvage-wallet-box">
        <div className={classes.walletRow}>
          <span>{t(tr.MINT_YOU_GIVE)}</span>
          <span className={classes.give} data-testid="salvage-give">
            {t(tr.SALVAGE_GIVE_ITEM, name, item.serial)}
            {change && !change.gain ? (
              <>
                <br />
                {amount(change.net, { exact: confirmed, given: true })}
              </>
            ) : null}
          </span>
        </div>
        {change && change.gain ? (
          <div className={classes.walletRow}>
            <span>{t(tr.MINT_YOU_GET)}</span>
            <span className={classes.get} data-testid="salvage-get">
              {/* what the player keeps: an estimate rounds down, as the deposit does */}
              {amount(change.net, {
                exact: confirmed,
                gotten: true,
                round: "down",
              })}
              <span className={classes.stays} data-testid="salvage-fee">
                {t(
                  tr.SALVAGE_FEE_DEDUCTED,
                  amount(change.fee, { exact: confirmed })
                )}
              </span>
            </span>
          </div>
        ) : null}
      </div>
    );
    content = ruledOut ? (
      box
    ) : (
      <>
        <p className={classes.text}>
          {t(
            words === "loading"
              ? tr.MINT_LOADING
              : confirmed
                ? tr.MINT_WALLET_TEXT
                : tr[salvageKey("MINT_WALLET_TEXT_UNCONFIRMED")]
          )}
        </p>
        {box}
        {/* the ADA beside the token is named the wallet's only once the wallet vouched for
            its addresses (as on the sign page) */}
        {confirmed && change && change.free ? (
          <p className={classes.note} data-testid="salvage-free">
            {t(
              tr.SALVAGE_FREE_AGAIN,
              amount(change.free, { exact: confirmed, round: "down" })
            )}
          </p>
        ) : null}
        {words === "unconfirmed" ? (
          <p className={classes.text}>{t(tr.SALVAGE_SIGN_TWICE)}</p>
        ) : null}
        <p className={classes.text}>{t(tr.MINT_WALLET_CONFIRM)}</p>
        {window_ && !window_.over ? (
          <p
            className={`${classes.note} ${classes.soft}`}
            data-testid="salvage-time"
          >
            {window_.minutes === 1
              ? t(tr.MINT_WALLET_TIME_ONE)
              : t(tr.MINT_WALLET_TIME, window_.minutes)}
          </p>
        ) : null}
      </>
    );
    const backButton = walletView.back ? (
      <Button
        color="secondary"
        onClick={back}
        disabled={!cancellable}
        data-testid="salvage-back"
      >
        {t(tr.MINT_BACK)}
      </Button>
    ) : null;
    actions = ruledOut ? (
      backButton ? (
        <div className={classes.buttons}>{backButton}</div>
      ) : null
    ) : (
      <div className={classes.buttons}>
        <Button
          color="primary"
          onClick={openWallet}
          disabled={!canSign(state, now)}
          data-testid="salvage-open-wallet"
        >
          {t(tr.MINT_OPEN_WALLET)}
        </Button>
        {backButton}
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
            <path d="M4 20l8-8M14 4l6 6-4 4-6-6z" />
          </svg>
        </div>
        <p className={classes.text}>
          {t(
            state.via === "phone"
              ? tr.SALVAGE_SIGN_PHONE
              : tr.MINT_WALLET_CONFIRM
          )}
        </p>
      </>
    );
    const again = state.via === "phone" && state.pending === null;
    actions =
      again || cancellable ? (
        <div className={classes.buttons}>
          {again ? (
            <Button
              color="primary"
              onClick={openWalletAgain}
              data-testid="salvage-open-wallet"
            >
              {t(tr.MINT_OPEN_WALLET)}
            </Button>
          ) : null}
          {cancellable ? (
            <Button
              color="secondary"
              onClick={cancel}
              data-testid="salvage-cancel-operation"
            >
              {t(tr.MINT_CANCEL)}
            </Button>
          ) : null}
        </div>
      ) : null;
  } else if (step === "running") {
    content = (
      <div className={classes.steps} data-testid="salvage-running">
        {signedHere(state) ? (
          <div className={classes.step} data-testid="salvage-signed">
            <svg {...ICON} className={classes.stepIcon} aria-hidden="true">
              <path
                d="M4 12.5l5 5L20 6.5"
                stroke={MINT_LOOK.get}
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div>
              {t(tr.SALVAGE_MINTED_SIGNED)}
              <span className={classes.stepText}>
                {t(tr.SALVAGE_MINTED_DEPOSIT_BACK)}
              </span>
            </div>
          </div>
        ) : null}
        <div className={`${classes.step} ${classes.stepRunning}`}>
          <svg {...ICON} className={classes.stepIcon} aria-hidden="true">
            <circle
              cx="12"
              cy="12"
              r="9"
              stroke={MINT_LOOK.gold}
              strokeWidth="3"
            />
            <path
              d="M12 7v5l3 2"
              stroke={MINT_LOOK.gold}
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          <div>
            {t(tr.SALVAGE_MINTED_ON_THE_WAY)}
            <span className={classes.stepText}>
              {t(tr.SALVAGE_MINTED_FEW_MINUTES)}
            </span>
          </div>
        </div>
        {state.operation && state.operation.slow ? (
          <p className={classes.note} data-testid="salvage-slow">
            {t(tr.SALVAGE_SLOW)}
          </p>
        ) : null}
      </div>
    );
    actions = (
      <div className={classes.buttons}>
        <Button color="primary" onClick={onClose} data-testid="salvage-play-on">
          {t(tr.SALVAGE_MINTED_PLAY_ON)}
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
            onClick={flow.retry}
            disabled={busy}
            data-testid="salvage-again"
          >
            {t(tr.MINT_AGAIN)}
          </Button>
        ) : null}
        {cancellable ? (
          <Button
            color="secondary"
            onClick={cancel}
            data-testid="salvage-cancel-operation"
          >
            {t(tr.MINT_CANCEL)}
          </Button>
        ) : null}
        <Button
          color="secondary"
          onClick={onToItem}
          data-testid="salvage-to-item"
        >
          {t(tr.MINT_TO_ITEM)}
        </Button>
      </div>
    );
    if (cancellable) {
      ownAction = ownAction || "cancel";
    }
  }

  const shown = state.problem || away;
  const shownKey = shown ? salvageKey(shown.key) : null;
  const action =
    shown && shown.action && shown.action !== ownAction && ACTIONS[shown.action]
      ? shown.action
      : null;
  let title;
  if (step === "confirm") {
    title = t(tr.SALVAGE_TITLE, name, item.serial);
  } else if (step === "wallet" && ruledOut) {
    title = t(tr.SALVAGE_STATUS_TITLE);
  } else {
    title = t(tr[TITLES[step]]);
  }
  return (
    <Dialog open close={onClose} title={title}>
      <div
        className={classes.body}
        data-testid="salvage-minted"
        data-step={step}
      >
        <div
          className={classes.scroll}
          ref={scrollArea}
          onScroll={measureCue}
          style={
            fadeMask(cue)
              ? { maskImage: fadeMask(cue), WebkitMaskImage: fadeMask(cue) }
              : undefined
          }
          data-testid="salvage-scroll"
          data-more-above={cue.above ? "true" : "false"}
          data-more-below={cue.below ? "true" : "false"}
        >
          {shown ? (
            <ProblemBox
              classes={classes}
              testId="salvage-error"
              problemKey={shownKey}
              text={say(shownKey, shown.values)}
              detail={shown.detail}
              action={
                action
                  ? {
                      label: t(tr[ACTIONS[action][0]]),
                      testId: ACTIONS[action][1],
                      color: action === "cancel" ? "accent" : "secondary",
                      disabled:
                        action === "cancel" || action === "back"
                          ? !cancellable
                          : busy,
                      onClick: () => problemAction(action),
                    }
                  : null
              }
            />
          ) : null}
          {content}
        </div>
        {actions}
      </div>
      {flow.door && step === "wallet" && state.signCode ? (
        <SignDoor
          signCode={state.signCode}
          onClose={() => setDoor(false)}
          onWallet={(walletName) => {
            setDoor(false);
            signWith(walletName);
          }}
          onPhone={() => {
            setDoor(false);
            send({ type: "signing", via: "phone", now: Date.now() });
          }}
        />
      ) : null}
    </Dialog>
  );
};

/**
 * The salvage of the minted `item` (an entry of stats.items) while `open`: `book` (the recipe
 * book, GET /lab/recipes: what comes back by today's recipe), `slotName` (the building it is
 * equipped on, or null); `onClose()` (nothing is cancelled), `onToItem()` (back to the item's
 * card), `onChanged()` (the item's mark may have changed: the stats are read again),
 * `onPhase({ running, signing })` (a salvage runs here after Yes; a signature attempt is out).
 */
const SalvageMinted = ({ open, item, ...props }) =>
  open && item ? <SalvageFlow key={item.id} item={item} {...props} /> : null;

export default SalvageMinted;
