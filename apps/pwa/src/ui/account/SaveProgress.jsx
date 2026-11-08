import { useCallback, useEffect, useRef, useState } from "react";
import { createUseStyles } from "react-jss";
import Button from "../controls/Button";
import RecoveryWords from "./RecoveryWords";
import {
  getCurrentLanguage,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import {
  cardanoApi,
  features,
  keyStore,
  KeyAlreadyStoredError,
  KeyStoreError,
  NetworkMismatchError,
  newRecoveryWords,
  signChallenge,
  subjectOfWords,
} from "../../cardano";
import logger from "../../helper/logger";
import { outlined } from "../styles";

// Saving the progress in the profile (the owner's pick "C", 2026-11-08): a quiet row at the
// bottom: "Only on this device" with Save your progress, "Not backed up yet" with Back up now, or
// Saved. Below it Advanced (the words again, the linked keys) and, on preprod, a "preprod" chip
// that leads to the privacy policy's section about it. Saving makes a Cardano key from 24 new
// recovery words on the device and links it to the player (src/cardano).

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

/**
 * The row; mounted while the profile is open, so it reads the linked keys and the device's words
 * each time the profile opens. `onConnect` opens "Connect an existing account".
 */
const SaveProgress = ({ onConnect }) => {
  const classes = useStyles();
  // the player's linked keys (null while they load or could not be read)
  const [identities, setIdentities] = useState(null);
  // the words on this device and the key they make ("stake:<hash>")
  const [local, setLocal] = useState({
    words: null,
    subject: null,
    backedUp: false,
  });
  const [shownWords, setShownWords] = useState(null);
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // a second tap while saving does nothing (the key store also refuses a second key)
  const saving = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setIdentities(await cardanoApi.identities());
    } catch (failure) {
      logger.warn("could not read the linked keys", failure);
    }
    try {
      const words = await keyStore.load();
      setLocal({
        words,
        subject: words ? await subjectOfWords(words) : null,
        backedUp: await keyStore.backedUp(),
      });
    } catch (failure) {
      logger.warn("could not read the key on this device", failure);
    }
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

  const remove = async (subject) => {
    try {
      await cardanoApi.removeIdentity(subject);
      // the words on this device belonged to that key: they would only link it again
      if (subject === local.subject) {
        await keyStore.clear();
      }
    } catch (failure) {
      logger.warn("could not remove the key", failure);
    }
    await refresh();
  };

  const backedUp = async () => {
    await keyStore.markBackedUp();
    await refresh();
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
  } else if (ownWords && !local.backedUp) {
    status = (
      <>
        <span className={`${classes.text} ${classes.warn}`}>
          {t(tr.BACKUP_MISSING)}
        </span>
        <button
          className={classes.link}
          onClick={() => setShownWords(local.words)}
        >
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
        {onConnect ? (
          <button className={classes.link} onClick={onConnect}>
            {t(tr.CONNECT_ACCOUNT)}
          </button>
        ) : null}
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
              <button
                className={classes.link}
                onClick={() => setShownWords(local.words)}
              >
                {t(tr.RECOVERY_WORDS_SHOW)}
              </button>
              <p className={`${classes.text} ${classes.error}`}>
                {t(tr.KEY_PROTECTION_NOTE)}
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
                    onClick={() => remove(identity.subject)}
                  >
                    {t(tr.LINKED_KEY_REMOVE)}
                  </Button>
                </div>
              ))
            : null}
        </div>
      ) : null}
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
