import { useCallback, useEffect, useRef, useState } from "react";
import { createUseStyles } from "react-jss";
import Button from "../controls/Button";
import RecoveryWords from "./RecoveryWords";
import ConnectAccount from "./ConnectAccount";
import BackupPassword from "./BackupPassword";
import ConfirmChange from "./ConfirmChange";
import {
  getCurrentLanguage,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import {
  cardanoApi,
  createPasskeyBackup,
  encryptBackup,
  features,
  forgetPasskey,
  keyStore,
  KeyAlreadyStoredError,
  KeyStoreError,
  NetworkMismatchError,
  newRecoveryWords,
  PasskeyCancelledError,
  PasskeyExistsError,
  PasskeyPrfError,
  PasskeyUnknownError,
  passkeySupport,
  saveBackup,
  signChallenge,
  subjectOfWords,
  wordsFromPasskey,
} from "../../cardano";
import logger from "../../helper/logger";
import { outlined } from "../styles";

// Saving the progress in the profile (the owner's pick "C", 2026-11-08): a quiet row at the
// bottom: "Only on this device" with Save your progress, "Not backed up yet" with Back up now, or
// Saved. Below it Advanced (the words again, the linked keys) and, on preprod, a "preprod" chip
// that leads to the privacy policy's section about it. Saving makes a Cardano key from 24 new
// recovery words on the device and links it to the player (src/cardano). Plan 2: the words are
// backed up by writing them down, a passkey or a backup file ("Backed up with: …" in Advanced);
// once a passkey exists, showing them needs it; removing a key needs a proof (ConfirmChange).

const useStyles = createUseStyles((theme) => ({
  section: {
    marginTop: "1.3em",
    paddingTop: "0.8em",
    borderTop: "1px solid rgba(255, 255, 255, 0.25)",
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: "0.6em",
    marginTop: "0.4em",
  },
  text: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    color: "white",
  },
  warn: {
    color: theme.color.gold.light,
    fontWeight: 700,
  },
  saved: {
    display: "flex",
    alignItems: "center",
    gap: "0.35em",
    fontFamily: theme.font.display,
    fontSize: theme.font.size.md,
    color: theme.color.primary.light,
    ...outlined(theme, theme.color.primary.dark),
  },
  check: {
    width: "1.1em",
    height: "1.1em",
    background: "url(/images/done.svg) no-repeat center / contain",
  },
  lock: {
    width: "1.1em",
    height: "1.1em",
    background: "url(/images/lock.svg) no-repeat center / contain",
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
  chip: {
    padding: "0.1em 0.7em",
    borderRadius: "1em",
    border: `0.12em solid ${theme.color.warning.dark}`,
    background: theme.color.warning.light,
    fontFamily: theme.font.body,
    fontSize: theme.font.size.xs,
    fontWeight: 700,
    color: theme.color.brown.dark,
    textDecoration: "none",
  },
  error: {
    margin: "0.5em auto 0",
    maxWidth: "26em",
    textAlign: "center",
  },
  keys: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.4em",
    marginTop: "0.6em",
  },
  key: {
    display: "flex",
    alignItems: "center",
    gap: "0.6em",
    fontFamily: "monospace",
    fontSize: theme.font.size.xs,
    color: "white",
  },
}));

// the privacy policy's section about Cardano, in German or English (the page has both)
const policyLink = () =>
  `/privacy-policy/#cardano-${getCurrentLanguage() === "de" ? "de" : "en"}`;

// the server keeps at most this many passkeys per player (apps/api/src/cardano.js)
const MAX_PASSKEYS = 10;

const shortAddress = (address) =>
  address.length > 24
    ? `${address.slice(0, 14)}…${address.slice(-8)}`
    : address;

// what went wrong while saving, in words a player can act on
const saveError = (failure) => {
  if (failure instanceof NetworkMismatchError) {
    return t(tr.SAVE_ERROR_NETWORK);
  }
  if (failure instanceof KeyStoreError) {
    return t(tr.SAVE_ERROR_STORAGE);
  }
  if (failure && failure.response && failure.response.status === 409) {
    return t(tr.SAVE_PROGRESS_TAKEN);
  }
  return t(tr.SAVE_PROGRESS_FAILED);
};

// what went wrong with a passkey backup, in words a player can act on (none for a closed prompt)
const passkeyError = (failure) => {
  if (failure instanceof PasskeyCancelledError) {
    return null;
  }
  if (failure instanceof PasskeyPrfError) {
    return t(tr.PASSKEY_NO_PRF);
  }
  if (failure instanceof PasskeyUnknownError) {
    return t(tr.PASSKEY_UNKNOWN);
  }
  if (failure instanceof PasskeyExistsError) {
    return t(tr.PASSKEY_EXISTS);
  }
  return t(tr.PASSKEY_FAILED);
};

/**
 * The row; mounted while the profile is open, so it reads the linked keys and the device's words
 * each time the profile opens.
 */
const SaveProgress = ({ playerName }) => {
  const classes = useStyles();
  // the player's linked keys (null while they load or could not be read)
  const [identities, setIdentities] = useState(null);
  // the words on this device and the key they make ("stake:<hash>")
  const [local, setLocal] = useState({
    words: null,
    subject: null,
    methods: [],
  });
  // the player's passkey backups (all keys; null when they could not be read: then the words
  // stay closed) and whether this device can make one
  const [passkeys, setPasskeys] = useState(null);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const makingPasskey = useRef(false);
  const [canPasskey, setCanPasskey] = useState(false);
  // the backup-file password dialog; the key a removal waits for a proof for
  const [filing, setFiling] = useState(false);
  const [confirming, setConfirming] = useState(null);
  const [shownWords, setShownWords] = useState(null);
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  // a second tap while saving does nothing (the key store also refuses a second key)
  const saving = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setIdentities(await cardanoApi.identities());
    } catch (failure) {
      logger.warn("could not read the linked keys", failure);
    }
    setPasskeys(await cardanoApi.passkeys().catch(() => null));
    try {
      const words = await keyStore.load();
      setLocal({
        words,
        subject: words ? await subjectOfWords(words) : null,
        methods: await keyStore.backupMethods(),
      });
    } catch (failure) {
      logger.warn("could not read the key on this device", failure);
    }
    setCanPasskey(
      await features.offerPasskey(passkeySupport).catch(() => false)
    );
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = async () => {
    if (saving.current) {
      return;
    }
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      let words = await keyStore.load();
      if (!words) {
        words = await newRecoveryWords();
        try {
          await keyStore.save(words);
        } catch (failure) {
          if (!(failure instanceof KeyAlreadyStoredError)) {
            throw failure;
          }
          words = await keyStore.load();
        }
      }
      await signChallenge(words, "link");
      await refresh();
      setShownWords(words);
    } catch (failure) {
      logger.warn("could not save the progress", failure);
      setError(saveError(failure));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  // a key goes once its removal is confirmed (a proof by an existing key)
  const remove = async (confirmToken) => {
    const subject = confirming;
    await cardanoApi.removeIdentity(subject, confirmToken);
    // the words on this device belonged to that key: they would only link it again
    if (subject === local.subject) {
      await keyStore.clear();
    }
    setConfirming(null);
    await refresh();
  };

  const backedUp = async () => {
    await keyStore.markBackedUp("words");
    await refresh();
  };

  // the words for a backup or to show: with a passkey only after it (else saving a file or another
  // passkey would hand out the words the passkey guards); closed when the passkeys are unknown
  const guardedWords = async () => {
    if (passkeys === null) {
      throw new PasskeyUnknownError();
    }
    const own = passkeys.filter((passkey) => passkey.subject === local.subject);
    return own.length === 0
      ? local.words
      : wordsFromPasskey(own.map((passkey) => passkey.credentialId));
  };

  const savePasskey = async () => {
    if (makingPasskey.current) {
      return;
    }
    makingPasskey.current = true;
    setPasskeyBusy(true);
    setError(null);
    let backup;
    try {
      const words = await guardedWords();
      backup = await createPasskeyBackup(words, {
        playerName,
        subject: local.subject,
        excludeCredentialIds: passkeys.map((passkey) => passkey.credentialId),
      });
      await cardanoApi.storePasskey(backup);
    } catch (failure) {
      logger.warn("could not save a passkey backup", failure);
      // a passkey made but not kept on the server guards nothing: the password manager drops it
      if (backup) {
        await forgetPasskey(backup.credentialId);
      }
      setError(passkeyError(failure));
    } finally {
      makingPasskey.current = false;
      setPasskeyBusy(false);
    }
    await refresh();
  };

  const saveFile = async (password) => {
    try {
      const words = await guardedWords();
      const text = await encryptBackup(words, password);
      const result = await saveBackup(text, { mobile: features.isMobile() });
      if (result !== "cancelled") {
        await keyStore.markBackedUp("file");
      }
    } catch (failure) {
      logger.warn("could not save the backup file", failure);
      setError(
        failure instanceof PasskeyCancelledError
          ? null
          : passkeyError(failure) || t(tr.FILE_SAVE_FAILED)
      );
    }
    setFiling(false);
    await refresh();
  };

  const showWords = async () => {
    setError(null);
    try {
      setShownWords(await guardedWords());
    } catch (failure) {
      logger.warn("could not open the words with the passkey", failure);
      setError(
        failure instanceof PasskeyPrfError
          ? t(tr.PASSKEY_CANT_UNLOCK)
          : passkeyError(failure)
      );
    }
  };

  if (identities === null) {
    return null;
  }
  const saved = identities.length > 0;
  // the words on this device are this account's (not those of an account the device had before)
  const ownWords =
    local.words !== null &&
    identities.some((identity) => identity.subject === local.subject);
  // in the Android app nothing visibly crypto until the Play Store's declaration (spec, section 7)
  const showKeys = !features.inAndroidApp();
  const ownPasskeys = (passkeys || []).filter(
    (passkey) => passkey.subject === local.subject
  );
  const methods = [
    ...(local.methods.includes("words") ? [t(tr.BACKUP_WORDS)] : []),
    ...(ownPasskeys.length > 0 ? [t(tr.BACKUP_PASSKEY)] : []),
    ...(local.methods.includes("file") ? [t(tr.BACKUP_FILE)] : []),
  ];

  let status;
  if (!saved) {
    status = (
      <>
        <span className={classes.lock} />
        <span className={classes.text}>{t(tr.PROGRESS_ONLY_HERE)}</span>
        <Button color="primary" size="small" disabled={busy} onClick={save}>
          {busy ? t(tr.SAVING) : t(tr.SAVE_PROGRESS)}
        </Button>
      </>
    );
  } else if (ownWords && methods.length === 0) {
    status = (
      <>
        <span className={`${classes.text} ${classes.warn}`}>
          {t(tr.BACKUP_MISSING)}
        </span>
        <button className={classes.link} onClick={showWords}>
          {t(tr.BACK_UP_NOW)}
        </button>
      </>
    );
  } else {
    status = (
      <span className={classes.saved}>
        <span className={classes.check} />
        {t(tr.SAVE_PROGRESS_SAVED)}
      </span>
    );
  }

  return (
    <div className={classes.section} data-testid="save-progress">
      <div className={classes.row}>{status}</div>
      {error ? (
        <p
          className={`${classes.text} ${classes.warn} ${classes.error}`}
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div className={classes.row}>
        <button className={classes.link} onClick={() => setConnecting(true)}>
          {t(tr.CONNECT_ACCOUNT)}
        </button>
        <button
          className={classes.link}
          aria-expanded={advanced}
          onClick={() => setAdvanced(!advanced)}
        >
          {t(tr.ACCOUNT_ADVANCED)}
        </button>
        {features.showPreprodBadge() ? (
          <a
            className={classes.chip}
            href={policyLink()}
            target="_blank"
            rel="noopener noreferrer"
            title={t(tr.PREPROD_BADGE_TITLE)}
          >
            {t(tr.PREPROD_BADGE)}
          </a>
        ) : null}
      </div>
      {advanced ? (
        <div className={classes.keys}>
          {ownWords ? (
            <>
              {methods.length > 0 ? (
                <span className={classes.text}>
                  {t(tr.BACKED_UP_WITH, methods.join(", "))}
                </span>
              ) : null}
              <div className={classes.row}>
                {canPasskey &&
                passkeys !== null &&
                passkeys.length < MAX_PASSKEYS ? (
                  <button
                    className={classes.link}
                    disabled={passkeyBusy}
                    onClick={savePasskey}
                  >
                    {t(tr.SAVE_PASSKEY)}
                  </button>
                ) : null}
                {features.offerFileShare() ? (
                  <button
                    className={classes.link}
                    onClick={() => setFiling(true)}
                  >
                    {t(tr.SAVE_FILE)}
                  </button>
                ) : null}
                <button className={classes.link} onClick={showWords}>
                  {t(tr.RECOVERY_WORDS_SHOW)}
                </button>
              </div>
              <p className={`${classes.text} ${classes.error}`}>
                {t(tr.KEY_PROTECTION_NOTE)}
                {ownPasskeys.length === 0 ? ` ${t(tr.DEVICE_HOLDER_NOTE)}` : ""}
              </p>
            </>
          ) : null}
          {saved && showKeys ? (
            <span className={classes.text}>{t(tr.LINKED_KEYS)}</span>
          ) : null}
          {showKeys
            ? identities.map((identity) => (
                <div key={identity.subject} className={classes.key}>
                  <span title={identity.address}>
                    {shortAddress(identity.address)}
                  </span>
                  <Button
                    color="accent"
                    size="small"
                    disabled={identities.length <= 1}
                    aria-label={`${t(tr.LINKED_KEY_REMOVE)} ${shortAddress(identity.address)}`}
                    onClick={() => setConfirming(identity.subject)}
                  >
                    {t(tr.LINKED_KEY_REMOVE)}
                  </Button>
                </div>
              ))
            : null}
        </div>
      ) : null}
      <ConnectAccount
        open={connecting}
        stacked
        onClose={() => setConnecting(false)}
      />
      <BackupPassword
        open={filing}
        onClose={() => setFiling(false)}
        onSave={saveFile}
      />
      <ConfirmChange
        open={confirming !== null}
        passkeyIds={(passkeys || []).map((passkey) => passkey.credentialId)}
        onClose={() => setConfirming(null)}
        onConfirmed={remove}
      />
      <RecoveryWords
        open={shownWords !== null}
        words={shownWords || []}
        onClose={() => setShownWords(null)}
        onBackedUp={backedUp}
      />
    </div>
  );
};

export default SaveProgress;
