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
 * stats). Nothing for a plain item or a state this build does not know.
 */
const MintStatus = ({ item, wallet = null, onMint, onChanged }) => {
  const classes = useStyles();
  const mark = (item && item.minted) || null;
  const signing = Boolean(mark) && mark.state === "minting" && mark.signing;
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
  if (mark.state === "minted") {
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
  if (mark.state !== "minting") {
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
            setError(t(tr.MINT_CANCEL_TOO_LATE));
          } else if (code !== "NOT FOUND") {
            logger.warn("cancelling a mint failed", failure);
            setError(
              failure && failure.status >= 400 && failure.status < 500
                ? t(tr.MINT_FAILED)
                : t(tr.MINT_CANCEL_ANSWER_LOST)
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
      data-state="signing"
    >
      <span className={classes.title}>
        {minutes === null
          ? t(tr.MINT_MARK_WAITING_UNTIMED)
          : t(tr.MINT_MARK_WAITING, minutes)}
      </span>
      <div className={classes.buttons}>
        <Button
          color="primary"
          onClick={onMint}
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
