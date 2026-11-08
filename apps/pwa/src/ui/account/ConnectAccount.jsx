import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createUseStyles } from "react-jss";
import Dialog from "../dialogs/Dialog";
import Button from "../controls/Button";
import RecoveryWords from "./RecoveryWords";
import ConfirmChange from "./ConfirmChange";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import {
  BackupFileError,
  decryptBackup,
  isBackupFile,
  PasskeyCancelledError,
  PasskeyPrfError,
  PasskeyUnknownError,
  passkeySupport,
  features,
  wordsFromPasskey,
  cardanoApi,
  connectAccount,
  switchToSession,
  keyStore,
  NetworkMismatchError,
  normalizeWords,
  subjectOfWords,
  wordsAreValid,
} from "../../cardano";
import logger from "../../helper/logger";
import { account } from "../../api/account";

// the wallet door (plan 3) and the Cardano Foundation's component: loaded when it opens
const WalletDoor = lazy(() => import("./WalletDoor"));

/** The game's keys changed (a wallet linked here): the profile reads them again. */
export const KEYS_CHANGED = "battlechoc:keys-changed";

// "I already have an account" (the owner's pick "C", 2026-11-08): one box for the 24 recovery
// words with a counter and Paste. A device with progress of its own asks which progress to keep
// (any finished match, an item or a recipe counts: GET /user/progress). Signing in reloads the
// game as the saved player; every failure leaves this device's account as it was. Switching never
// loses this device's progress silently: words of its own that are not backed up have to be
// backed up first, and progress that was never saved is said to be gone. Plan 2: the words can
// also come from a passkey ("Use my passkey") or a backup file and its password.

const WORD_COUNT = 24;
// the largest file read as a backup (one is a few hundred bytes)
const MAX_FILE_SIZE = 64 * 1024;

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
  fileForm: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    marginBottom: "0.8em",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "0.2em",
    width: "min(20em, 100%)",
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    color: "white",
  },
  password: {
    padding: "0.45em 0.7em",
    borderRadius: 10,
    border: `0.15em solid ${theme.color.secondary.light}`,
    fontFamily: theme.font.body,
    fontSize: `max(16px, ${theme.font.size.md})`,
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
    // a wallet's own words find nothing here: the wallet door is the way for them
    return t(
      features.showWalletDoor() ? tr.WORDS_UNKNOWN_USE_WALLET : tr.WORDS_UNKNOWN
    );
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
  // the words of this attempt and where they came from ("words" typed, "passkey", "file")
  const chosen = useRef({ words: [], source: "words" });
  const [canPasskey, setCanPasskey] = useState(false);
  // a backup file waiting for its password
  const [fileText, setFileText] = useState(null);
  const [password, setPassword] = useState("");
  const fileInput = useRef(null);
  // one run at a time: a second tap while the words are checked or the switch runs does nothing
  const running = useRef(false);
  // the wallet door (plan 3), the proof it needs first (a player with keys), what it said
  const [door, setDoor] = useState(false);
  const [doorToken, setDoorToken] = useState(undefined);
  const [proving, setProving] = useState(false);
  const [passkeyIds, setPasskeyIds] = useState([]);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setAsking(false);
      setNotice(null);
      setDoor(false);
      setDoorToken(undefined);
    }
  }, [open]);

  const typed = normalizeWords(text);

  useEffect(() => {
    if (open) {
      setFileText(null);
      setPassword("");
      features
        .offerPasskey(passkeySupport)
        .then(setCanPasskey, () => setCanPasskey(false));
    }
  }, [open]);

  // closing forgets the words (a shared device), but not while a switch runs
  const close = () => {
    if (running.current) {
      return;
    }
    setText("");
    setFileText(null);
    setPassword("");
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
      if (chosen.current.session) {
        // a known wallet's player (plan 3): its session is there already
        await switchToSession(chosen.current.session);
      } else {
        await connectAccount(chosen.current.words, {
          source: chosen.current.source,
        });
      }
    } catch (failure) {
      logger.warn("could not sign in with the words", failure);
      fail(signInError(failure));
      return;
    }
    window.location.reload();
  };

  // whether switching costs this device progress of its own (and sets what: `device`); `isSame`
  // tells from this device's keys whether the account to switch to is this device's own
  const assessSwitch = async (isSame) => {
    const [answer, identities] = await Promise.all([
      cardanoApi.progress(),
      cardanoApi.identities(),
    ]);
    if (typeof answer.hasProgress !== "boolean") {
      throw new Error(
        "the server did not say whether this device has progress"
      );
    }
    const progress = answer.hasProgress && !isSame(identities);
    if (progress) {
      // what switching would cost this device (its keys are `identities`, its words local)
      const local = await keyStore.load().catch(() => null);
      const localSubject = local ? await subjectOfWords(local) : null;
      const ownWords = identities.some(
        (identity) => identity.subject === localSubject
      );
      // words a passkey keeps on the server are backed up too (unreadable: not counted, so
      // the device rather asks for a backup than switches without one)
      const passkeys = await cardanoApi.passkeys().catch(() => []);
      const backedUp =
        (await keyStore.backedUp().catch(() => false)) ||
        passkeys.some((passkey) => passkey.subject === localSubject);
      setDevice({
        lost: identities.length === 0,
        words: ownWords && !backedUp ? local : null,
      });
    }
    return progress;
  };

  // what the wallet door brought (plan 3): a linked wallet, another player's session (switch, or
  // ask first when this device has progress of its own), or the need for a proof first
  const fromWallet = async (answer) => {
    setDoor(false);
    if (answer.outcome === "linked") {
      setNotice(t(tr.WALLET_LINKED));
      window.dispatchEvent(new Event(KEYS_CHANGED));
      return;
    }
    if (answer.outcome === "confirm") {
      setPasskeyIds(
        (await cardanoApi.passkeys().catch(() => [])).map(
          (passkey) => passkey.credentialId
        )
      );
      setProving(true);
      return;
    }
    if (answer.outcome !== "known" || running.current) {
      return;
    }
    running.current = true;
    const { outcome, ...session } = answer;
    chosen.current = { session, source: "wallet" };
    setBusy(true);
    setError(null);
    let progress;
    try {
      progress = await assessSwitch(() => false);
    } catch (failure) {
      logger.warn("could not prepare the sign-in", failure);
      await dropWalletSession();
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

  // "Keep this device": a known wallet's session that was made for the switch is ended again
  const dropWalletSession = async () => {
    const { session } = chosen.current;
    chosen.current = { words: [], source: "words" };
    if (session) {
      await account
        .logout(session.refreshToken)
        .catch((failure) =>
          logger.warn("could not end the wallet's session", failure)
        );
    }
  };

  // checks the words of this attempt and signs in, or asks first what switching costs; the
  // caller holds the run (`running`)
  const proceed = async (words, source) => {
    chosen.current = { words, source };
    setBusy(true);
    setError(null);
    let progress;
    try {
      if (!(await wordsAreValid(words))) {
        fail(t(tr.WORDS_INVALID));
        return;
      }
      const subject = await subjectOfWords(words);
      // the words of the account this device already is: nothing to choose
      progress = await assessSwitch((identities) =>
        identities.some((identity) => identity.subject === subject)
      );
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

  // "Continue" with the typed words
  const fromTyped = () => {
    if (running.current) {
      return;
    }
    running.current = true;
    proceed(typed, "words");
  };

  // "Use my passkey": the browser offers the player's battlechoc passkeys
  const fromPasskey = async () => {
    if (running.current) {
      return;
    }
    running.current = true;
    setBusy(true);
    setError(null);
    let unlocked;
    try {
      unlocked = await wordsFromPasskey();
    } catch (failure) {
      running.current = false;
      setBusy(false);
      if (failure instanceof PasskeyCancelledError) {
        return;
      }
      logger.warn("could not open the words with a passkey", failure);
      setError(
        t(
          failure instanceof PasskeyPrfError
            ? tr.PASSKEY_CANT_UNLOCK
            : failure instanceof PasskeyUnknownError
              ? tr.PASSKEY_UNKNOWN
              : tr.SIGN_IN_FAILED
        )
      );
      return;
    }
    await proceed(unlocked, "passkey");
  };

  // "Open a backup file": a file this game cannot open is said at once, without a password
  const chooseFile = async (event) => {
    const [file] = event.target.files || [];
    event.target.value = "";
    if (!file) {
      return;
    }
    setError(null);
    // a backup file is a few hundred bytes: a big file is no backup and is not read
    const content =
      file.size > MAX_FILE_SIZE ? "" : await file.text().catch(() => "");
    if (!isBackupFile(content)) {
      setFileText(null);
      setError(t(tr.FILE_NOT_A_BACKUP));
      return;
    }
    setPassword("");
    setFileText(content);
  };

  const openFile = async () => {
    if (running.current) {
      return;
    }
    running.current = true;
    setBusy(true);
    setError(null);
    let opened;
    try {
      opened = await decryptBackup(fileText, password);
    } catch (failure) {
      running.current = false;
      setBusy(false);
      setError(
        t(
          failure instanceof BackupFileError &&
            failure.reason === "wrong-password"
            ? tr.FILE_WRONG_PASSWORD
            : tr.FILE_NOT_A_BACKUP
        )
      );
      return;
    }
    await proceed(opened, "file");
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
                onClick={async () => {
                  await dropWalletSession();
                  setAsking(false);
                }}
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
            <div className={classes.buttons}>
              {canPasskey ? (
                <Button color="secondary" disabled={busy} onClick={fromPasskey}>
                  {t(tr.CONFIRM_PASSKEY)}
                </Button>
              ) : null}
              <Button
                color="secondary"
                disabled={busy}
                onClick={() => fileInput.current && fileInput.current.click()}
              >
                {t(tr.OPEN_FILE)}
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept=".json,.txt,application/json,text/plain"
                data-testid="connect-file"
                hidden
                onChange={chooseFile}
              />
            </div>
            {fileText !== null ? (
              <form
                className={classes.fileForm}
                onSubmit={(event) => {
                  event.preventDefault();
                  openFile();
                }}
              >
                <p className={classes.text}>{t(tr.FILE_OPEN_TEXT)}</p>
                <label className={classes.field}>
                  {t(tr.FILE_PASSWORD)}
                  <input
                    className={classes.password}
                    type="password"
                    autoComplete="current-password"
                    autoFocus
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
                <div className={classes.buttons}>
                  <Button color="primary" disabled={busy} onClick={openFile}>
                    {t(tr.FILE_OPEN)}
                  </Button>
                </div>
                <button type="submit" hidden />
              </form>
            ) : null}
            {features.showWalletDoor() ? (
              <div className={classes.buttons}>
                <Button
                  color="secondary"
                  disabled={busy}
                  onClick={() => {
                    setError(null);
                    setNotice(null);
                    setDoor(true);
                  }}
                >
                  {t(tr.WALLET_DOOR)}
                </Button>
              </div>
            ) : null}
            {notice ? (
              <p className={classes.text} role="status">
                {notice}
              </p>
            ) : null}
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
              <span>{t(tr.WORDS_COUNT, typed.length)}</span>
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
                disabled={busy || typed.length !== WORD_COUNT}
                onClick={fromTyped}
              >
                {t(tr.CONNECT_CONTINUE)}
              </Button>
            </div>
          </>
        )}
      </div>
      {door ? (
        <Suspense fallback={null}>
          <WalletDoor
            open={door}
            purpose="connect"
            confirmToken={doorToken}
            onClose={() => setDoor(false)}
            onDone={fromWallet}
          />
        </Suspense>
      ) : null}
      <ConfirmChange
        open={proving}
        passkeyIds={passkeyIds}
        onClose={() => setProving(false)}
        onConfirmed={async (token) => {
          setProving(false);
          setDoorToken(token);
          setDoor(true);
        }}
      />
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
