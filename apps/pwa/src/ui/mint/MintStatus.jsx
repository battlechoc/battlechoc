import { useState, useSyncExternalStore } from "react";
import { createUseStyles } from "react-jss";
import { statusSheet } from "./mintSheets";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import Button from "../controls/Button";
import { chainApi } from "../../api/chain";
import logger from "../../helper/logger";
import { following } from "./operationPoll";
import { held } from "./held";
import useSignClock from "./useSignClock";
import { salvageKey } from "./salvageTexts";

// What the item card shows of minting (the owner's mockup, board 1): the Mint action under Equip
// for a plain item, and the item's mark for one that is minted or being minted. Both render only
// where minting shows (the card's caller asks useChainEnabled). Light on purpose: it is part of
// the Choclab's chunk; the dialog, the flow and the wallet code load when the dialog opens.

const useStyles = createUseStyles(statusSheet);

// the minutes left of a prepared operation's sign window at `now`, or null when unknown
const minutesLeft = (operation, now) => {
  if (!operation || operation.state !== "prepared") {
    return null;
  }
  const left = Date.parse(operation.signUntil) - now;
  return left > 0 ? Math.ceil(left / 60000) : null;
};

/** The Mint action of a plain item: "Mint" (`onMint`) and what it does. */
export const MintAction = ({ onMint, disabled = false }) => {
  const classes = useStyles();
  return (
    <div className={classes.action}>
      <Button
        color="gold"
        onClick={onMint}
        disabled={disabled}
        data-testid="mint-open"
      >
        {t(tr.MINT_ACTION)}
      </Button>
      <p className={classes.actionText}>{t(tr.MINT_ACTION_TEXT)}</p>
    </div>
  );
};

/**
 * The mark of `item` (an entry of stats.items) on its card: minted (the wallet's name when the
 * game knows it, `wallet`), being minted, or waiting for the player's signature (Continue opens
 * the dialog: `onMint`; Cancel cancels the prepared operation, then `onChanged` reloads the
 * stats); for a minted item's salvage (plan E), waiting for the signature (Continue: `onSalvage`)
 * or being salvaged (its ingredients on the way). Nothing for a plain item or a state this build
 * does not know.
 */
const MintStatus = ({
  item,
  wallet = null,
  onMint,
  onSalvage = () => {},
  onChanged,
}) => {
  const classes = useStyles();
  const mark = (item && item.minted) || null;
  // a salvage prepared, not signed: the item is still minted and usable
  const salvage =
    Boolean(mark) &&
    mark.state === "minted" &&
    mark.kind === "burn" &&
    mark.signing === true &&
    typeof mark.operationId === "string";
  const signing =
    salvage || (Boolean(mark) && mark.state === "minting" && mark.signing);
  // the words of the salvage where minting has its own (salvageTexts.js)
  const words = (key) => t(tr[salvage ? salvageKey(key) : key]);
  const operationId = mark && mark.operationId;
  const view = useSyncExternalStore(following.subscribe, () =>
    operationId ? following.noted(operationId) : null
  );
  const now = useSignClock(signing, view ? view.signUntil : null);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState(null);

  // why a cancel did not happen: it stays under the mark the reloaded stats show
  const why = error ? (
    <p className={classes.error} role="alert" data-testid="mint-problem">
      {error}
    </p>
  ) : null;
  if (!mark) {
    return null;
  }
  if (mark.state === "burning") {
    // signed, in a block, or seen on the chain: no actions; a burn that waits for the network
    // longer than usual (also after a rollback) says that nothing is lost
    return (
      <div
        className={`${classes.box} ${classes.running}`}
        data-testid="mint-status"
        data-state="burning"
      >
        {t(tr.ITEM_BURNING)}
        {view && view.slow ? (
          <span className={classes.slow}>{` ${t(tr.SALVAGE_SLOW)}`}</span>
        ) : null}
      </div>
    );
  }
  if (mark.state === "minted" && !salvage) {
    return (
      <div
        className={classes.box}
        data-testid="mint-status"
        data-state="minted"
      >
        <span className={classes.title}>{t(tr.MINT_MARK_MINTED)}</span>
        {wallet
          ? t(tr.MINT_MARK_MINTED_TEXT, wallet)
          : t(tr.MINT_MARK_MINTED_TEXT_NAMELESS)}
        {why}
      </div>
    );
  }
  if (mark.state !== "minting" && !salvage) {
    return null;
  }
  if (!signing) {
    return (
      <div
        className={`${classes.box} ${classes.running}`}
        data-testid="mint-status"
        data-state="minting"
      >
        <span className={classes.title}>{t(tr.MINT_MARK_MINTING)}</span>
        {t(tr.MINT_MARK_MINTING_TEXT)}
        {why}
      </div>
    );
  }

  const cancel = () => {
    setCancelling(true);
    setError(null);
    // a cancel that hangs counts as unanswered after a while: the buttons come back
    held(chainApi.cancel(operationId))
      .then(
        (operation) => following.note(operation),
        (failure) => {
          // too late (signed, ended meanwhile): the reloaded stats tell; no answer: say so
          const code = failure && failure.code;
          if (code === "OPERATION NOT OPEN") {
            // signed meanwhile, or over: say why the box changes
            setError(words("MINT_CANCEL_TOO_LATE"));
          } else if (code !== "NOT FOUND") {
            logger.warn("cancelling an operation failed", failure);
            setError(
              failure && failure.status >= 400 && failure.status < 500
                ? words("MINT_FAILED")
                : words("MINT_CANCEL_ANSWER_LOST")
            );
          }
        }
      )
      .finally(() => {
        setCancelling(false);
        onChanged();
      });
  };

  const minutes = minutesLeft(view, now);
  return (
    <div
      className={`${classes.box} ${classes.running}`}
      data-testid="mint-status"
      data-state={salvage ? "salvage-signing" : "signing"}
    >
      <span className={classes.title}>
        {minutes === null
          ? t(
              salvage
                ? tr.SALVAGE_MARK_WAITING_UNTIMED
                : tr.MINT_MARK_WAITING_UNTIMED
            )
          : t(
              salvage ? tr.SALVAGE_MARK_WAITING : tr.MINT_MARK_WAITING,
              minutes
            )}
      </span>
      <div className={classes.buttons}>
        <Button
          color="primary"
          onClick={salvage ? onSalvage : onMint}
          disabled={cancelling}
          data-testid="mint-continue"
        >
          {t(tr.MINT_CONTINUE_SIGN)}
        </Button>
        <Button
          color="secondary"
          onClick={cancel}
          disabled={cancelling}
          data-testid="mint-cancel"
        >
          {t(tr.MINT_CANCEL)}
        </Button>
      </div>
      {why}
    </div>
  );
};

export default MintStatus;
