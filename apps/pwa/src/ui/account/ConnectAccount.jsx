import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createUseStyles } from "react-jss";
import Dialog from "../dialogs/Dialog";
import Button from "../controls/Button";
import RecoveryWords from "./RecoveryWords";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import {
  cardanoApi,
  connectAccount,
  keyStore,
  NetworkMismatchError,
  normalizeWords,
  subjectOfWords,
  wordsAreValid,
} from "../../cardano";
import logger from "../../helper/logger";

// "I already have an account" (the owner's pick "C", 2026-11-08): one box for the 24 recovery
// words with a counter and Paste. A device with progress of its own asks which progress to keep
// (any finished match, an item or a recipe counts: GET /user/progress). Signing in reloads the
// game as the saved player; every failure leaves this device's account as it was. Switching never
// loses this device's progress silently: words of its own that are not backed up have to be
// backed up first, and progress that was never saved is said to be gone.

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
    // at least 16px: iOS Safari zooms into a smaller field on focus
    fontSize: `max(16px, ${theme.font.size.md})`,
    display: "block",
    boxSizing: "border-box",
    width: "100%",
    maxWidth: "28em",
    minHeight: "8em",
    margin: "0 auto",
    padding: "0.7em",
    borderRadius: 12,
    border: `0.15em solid ${theme.color.secondary.light}`,
    fontFamily: theme.font.body,
    resize: "none",
  },
  counter: {
    display: "flex",
    justifyContent: "space-between",
    width: "100%",
    maxWidth: "28em",
    margin: "0.4em auto 0",
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    color: "white",
  },
  link: {
    padding: 0,
    border: 0,
    background: "none",
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    color: "white",
    textDecoration: "underline",
    cursor: "pointer",
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
    marginTop: "1em",
  },
}));

// the clipboard can be read (a secure page and a browser that offers it)
const canPaste = () =>
  typeof navigator !== "undefined" &&
  navigator.clipboard &&
  typeof navigator.clipboard.readText === "function";

const signInError = (failure) => {
  // only the server's own answer for words that save nobody (a 404 can also be a missing route)
  const answer = failure && failure.response;
  if (
    answer &&
    answer.status === 404 &&
    answer.data &&
    answer.data.error === "UNKNOWN IDENTITY"
  ) {
    return t(tr.WORDS_UNKNOWN);
  }
  if (failure instanceof NetworkMismatchError) {
    return t(tr.SAVE_ERROR_NETWORK);
  }
  return t(tr.SIGN_IN_FAILED);
};

/**
 * The dialog (`open`, `onClose`); `stacked` when it opens over another dialog (the profile). It
 * is drawn into the page's body, above whatever opened it.
 */
const ConnectAccount = ({ open, onClose, stacked = false }) => {
  const classes = useStyles();
  const [text, setText] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  // this device's own account when it asks: { lost } (never saved) or { words } (saved with words
  // on this device that are not backed up yet); the words dialog for backing them up
  const [device, setDevice] = useState({ lost: false, words: null });
  const [backingUp, setBackingUp] = useState(false);
  // one run at a time: a second tap while the words are checked or the switch runs does nothing
  const running = useRef(false);

  useEffect(() => {
    if (open) {
      setError(null);
      setAsking(false);
    }
  }, [open]);

  const words = normalizeWords(text);

  // closing forgets the words (a shared device), but not while a switch runs
  const close = () => {
    if (running.current) {
      return;
    }
    setText("");
    onClose();
  };

  const fail = (message) => {
    setError(message);
    setAsking(false);
    setBusy(false);
    running.current = false;
  };

  // the sign-in itself; the game reloads as the saved player, whatever happens after the sign-in
  const signIn = async () => {
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await connectAccount(words);
    } catch (failure) {
      logger.warn("could not sign in with the words", failure);
      fail(signInError(failure));
      return;
    }
    window.location.reload();
  };

  const proceed = async () => {
    if (running.current) {
      return;
    }
    running.current = true;
    setBusy(true);
    setError(null);
    let progress;
    try {
      if (!(await wordsAreValid(words))) {
        fail(t(tr.WORDS_INVALID));
        return;
      }
      // the words of the account this device already is: nothing to choose
      const [answer, identities, subject] = await Promise.all([
        cardanoApi.progress(),
        cardanoApi.identities().catch(() => []),
        subjectOfWords(words),
      ]);
      const same = identities.some((identity) => identity.subject === subject);
      if (typeof answer.hasProgress !== "boolean") {
        throw new Error(
          "the server did not say whether this device has progress"
        );
      }
      progress = answer.hasProgress && !same;
      if (progress) {
        // what switching would cost this device (its keys are `identities`, its words local)
        const local = await keyStore.load().catch(() => null);
        const localSubject = local ? await subjectOfWords(local) : null;
        const ownWords = identities.some(
          (identity) => identity.subject === localSubject
        );
        const backedUp = await keyStore.backedUp().catch(() => false);
        setDevice({
          lost: identities.length === 0,
          words: ownWords && !backedUp ? local : null,
        });
      }
    } catch (failure) {
      logger.warn("could not prepare the sign-in", failure);
      fail(t(tr.SIGN_IN_FAILED));
      return;
    }
    if (progress) {
      running.current = false;
      setBusy(false);
      setAsking(true);
      return;
    }
    await signIn();
  };

  const paste = async () => {
    try {
      setText(await navigator.clipboard.readText());
    } catch (failure) {
      logger.warn("could not read the clipboard", failure);
    }
  };

  if (!open) {
    return null;
  }
  return createPortal(
    <Dialog
      open={open}
      close={close}
      closable={!busy}
      mode={stacked ? "stacked" : "default"}
      icon="user"
      title={t(tr.CONNECT_TITLE)}
    >
      <div className={classes.body}>
        {asking ? (
          <>
            <p className={classes.text}>
              {t(device.lost ? tr.KEEP_WHICH_LOST : tr.KEEP_WHICH)}
            </p>
            {device.words ? (
              <div className={classes.buttons}>
                <p className={`${classes.text} ${classes.error}`}>
                  {t(tr.BACK_UP_FIRST)}
                </p>
                <Button
                  color="gold"
                  data-testid="connect-back-up"
                  onClick={() => setBackingUp(true)}
                >
                  {t(tr.BACK_UP_NOW)}
                </Button>
              </div>
            ) : null}
            <div className={classes.buttons}>
              <Button
                color="secondary"
                disabled={busy}
                onClick={() => setAsking(false)}
              >
                {t(tr.KEEP_THIS_DEVICE)}
              </Button>
              <Button
                color="primary"
                disabled={busy || device.words !== null}
                onClick={signIn}
              >
                {t(tr.KEEP_SAVED)}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className={classes.text}>{t(tr.CONNECT_TEXT)}</p>
            <textarea
              className={classes.area}
              data-testid="connect-words"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <div className={classes.counter}>
              <span>{t(tr.WORDS_COUNT, words.length)}</span>
              {canPaste() ? (
                <button className={classes.link} onClick={paste}>
                  {t(tr.PASTE)}
                </button>
              ) : null}
            </div>
            {error ? (
              <p className={`${classes.text} ${classes.error}`} role="alert">
                {error}
              </p>
            ) : null}
            <div className={classes.buttons}>
              <Button
                color="primary"
                disabled={busy || words.length !== WORD_COUNT}
                onClick={proceed}
              >
                {t(tr.CONNECT_CONTINUE)}
              </Button>
            </div>
          </>
        )}
      </div>
      <RecoveryWords
        open={backingUp}
        words={device.words || []}
        onClose={() => setBackingUp(false)}
        onBackedUp={async () => {
          await keyStore.markBackedUp();
          setDevice({ ...device, words: null });
        }}
      />
    </Dialog>,
    document.body
  );
};

export default ConnectAccount;
