import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createUseStyles } from "react-jss";
import Dialog from "../dialogs/Dialog";
import Button from "../controls/Button";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import {
  confirmWithPasskey,
  confirmWithWords,
  normalizeWords,
  PasskeyCancelledError,
  wordsAreValid,
} from "../../cardano";
import logger from "../../helper/logger";

// "Is it you?" (plan 2, owner 2026-11-08): a key change needs a fresh proof by an existing key —
// the passkey (`passkeyIds`: the player's passkeys) or the 24 recovery words typed in. A wallet
// joins with plan 3. `onConfirmed(confirmToken)` does the change; every failure changes nothing.

const WORD_COUNT = 24;

const useStyles = createUseStyles((theme) => ({
  body: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    marginTop: 16,
  },
  text: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    color: "white",
    textAlign: "center",
    maxWidth: "28em",
    margin: "0 auto 0.8em",
  },
  area: {
    display: "block",
    boxSizing: "border-box",
    width: "100%",
    maxWidth: "28em",
    minHeight: "6em",
    margin: "0 auto",
    padding: "0.7em",
    borderRadius: 12,
    border: `0.15em solid ${theme.color.secondary.light}`,
    fontFamily: theme.font.body,
    fontSize: `max(16px, ${theme.font.size.md})`,
    resize: "none",
  },
  error: {
    fontWeight: 700,
    color: theme.color.gold.light,
    margin: "0.8em auto 0",
  },
  buttons: {
    display: "flex",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: "0.8em",
    margin: "1em 0",
  },
}));

const ConfirmChange = ({ open, passkeyIds = [], onClose, onConfirmed }) => {
  const classes = useStyles();
  const [text, setText] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  useEffect(() => {
    if (open) {
      setText("");
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const words = normalizeWords(text);

  const run = async (proof) => {
    if (running.current) {
      return;
    }
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      const token = await proof();
      if (token) {
        await onConfirmed(token);
      }
    } catch (failure) {
      if (!(failure instanceof PasskeyCancelledError)) {
        logger.warn("could not confirm the change", failure);
        setError(t(tr.CONFIRM_FAILED));
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  const withWords = () =>
    run(async () => {
      if (!(await wordsAreValid(words))) {
        setError(t(tr.WORDS_INVALID));
        return undefined;
      }
      return confirmWithWords(words);
    });

  if (!open) {
    return null;
  }
  return createPortal(
    <Dialog
      open={open}
      close={() => !busy && onClose()}
      closable={!busy}
      mode="stacked"
      icon="user"
      title={t(tr.CONFIRM_TITLE)}
    >
      <div className={classes.body}>
        <p className={classes.text}>{t(tr.CONFIRM_TEXT)}</p>
        {passkeyIds.length > 0 ? (
          <div className={classes.buttons}>
            <Button
              color="primary"
              disabled={busy}
              onClick={() => run(() => confirmWithPasskey(passkeyIds))}
            >
              {t(tr.CONFIRM_PASSKEY)}
            </Button>
          </div>
        ) : null}
        <textarea
          className={classes.area}
          data-testid="confirm-words"
          aria-label={t(tr.CONNECT_TEXT)}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        {error ? (
          <p className={`${classes.text} ${classes.error}`} role="alert">
            {error}
          </p>
        ) : null}
        <div className={classes.buttons}>
          <Button
            color="secondary"
            disabled={busy || words.length !== WORD_COUNT}
            onClick={withWords}
          >
            {t(tr.CONNECT_CONTINUE)}
          </Button>
        </div>
      </div>
    </Dialog>,
    document.body
  );
};

export default ConfirmChange;
