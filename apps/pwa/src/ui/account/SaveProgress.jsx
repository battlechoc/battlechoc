import { lazy, Suspense, useState } from "react";
import { createUseStyles } from "react-jss";
import Button from "../controls/Button";
import RecoveryWords from "./RecoveryWords";
import ConnectAccount from "./ConnectAccount";
import BackupPassword from "./BackupPassword";
import ConfirmChange from "./ConfirmChange";
import AccountSafety from "./AccountSafety";
import KeepWords from "./KeepWords";
import LineIcon from "./LineIcon";
import useAccountKeys from "./useAccountKeys";
import { accountSafety, networkLabel } from "./safetyState";
import {
  getCurrentLanguage,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import { features } from "../../cardano";
import { outlined } from "../styles";

// the wallet door (plan 3): loaded when it opens
const WalletDoor = lazy(() => import("./WalletDoor"));

// Saving the progress in the profile (the owner's mockup B, 2026-11-12, after pick "C" of
// 2026-11-08): one line under the stats in one of three states: "only on this device" with Save
// your progress (and "I already have an account"), "Finish your backup" while the own words are
// kept nowhere, or Saved with Manage. Manage opens Account safety (the words, the passkey, the
// wallet, the technical details); saving and "Finish your backup" open Keep your words. The keys
// and their actions live in useAccountKeys; which rows apply is accountSafety's rule.

const useStyles = createUseStyles((theme) => ({
  section: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    marginTop: "1.3em",
    paddingTop: "1.2em",
    borderTop: "1px solid rgba(255, 255, 255, 0.25)",
    fontFamily: theme.font.body,
    color: "white",
  },
  line: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.5em",
    fontSize: theme.font.size.md,
    fontWeight: 600,
  },
  lock: {
    flex: "none",
    width: "1.1em",
    height: "1.1em",
    background: "url(/images/lock.svg) no-repeat center / contain",
  },
  check: {
    flex: "none",
    width: "1.4em",
    height: "1.4em",
    background: "url(/images/done.svg) no-repeat center / contain",
  },
  save: {
    marginTop: "0.8em",
  },
  link: {
    minHeight: 44,
    marginTop: "0.4em",
    padding: "0 0.5em",
    border: 0,
    background: "none",
    color: "white",
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    fontWeight: 600,
    textDecoration: "underline",
    cursor: "pointer",
  },
  // the two pills: "Finish your backup" (gold, the next step) and "Saved · Manage"
  pill: {
    display: "flex",
    alignItems: "center",
    gap: "0.55em",
    minHeight: 48,
    boxSizing: "border-box",
    padding: "0.35em 0.6em 0.35em 1em",
    borderRadius: 999,
    background: "rgba(0, 0, 0, 0.22)",
    border: "2px solid rgba(255, 255, 255, 0.22)",
    color: "white",
    fontFamily: theme.font.body,
    cursor: "pointer",
    "&:focus-visible": {
      outline: `3px solid ${theme.color.gold.light}`,
      outlineOffset: 2,
    },
  },
  finish: {
    padding: "0.35em 1em",
    background: "rgba(0, 0, 0, 0.3)",
    borderColor: theme.color.gold.light,
    color: theme.color.gold.light,
    fontSize: theme.font.size.md,
    fontWeight: 700,
  },
  savedWord: {
    fontFamily: theme.font.display,
    fontSize: theme.font.size.lg,
    letterSpacing: "0.02em",
    textTransform: "uppercase",
    color: theme.color.primary.light,
    ...outlined(theme, theme.color.primary.dark),
  },
  manage: {
    display: "flex",
    alignItems: "center",
    gap: "0.1em",
    padding: "0.3em 0.55em 0.3em 0.7em",
    borderRadius: 999,
    background: "rgba(255, 255, 255, 0.16)",
    fontSize: theme.font.size.sm,
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  hint: {
    maxWidth: "22em",
    margin: "0.7em 0 0",
    fontSize: theme.font.size.sm,
    lineHeight: 1.4,
    textAlign: "center",
  },
  error: {
    maxWidth: "26em",
    margin: "0.7em auto 0",
    fontSize: theme.font.size.sm,
    fontWeight: 700,
    color: theme.color.gold.light,
    textAlign: "center",
  },
}));

// the privacy policy's section about Cardano, in German or English (the page has both)
const policyLink = () =>
  `/privacy-policy/#cardano-${getCurrentLanguage() === "de" ? "de" : "en"}`;

/**
 * The row; mounted while the profile is open, so it reads the linked keys and the device's words
 * each time the profile opens.
 */
const SaveProgress = ({ playerName }) => {
  const classes = useStyles();
  const keys = useAccountKeys({ playerName });
  const { identities, local, passkeys, error, setError } = keys;
  // the dialogs over the profile
  const [safety, setSafety] = useState(false);
  const [keeping, setKeeping] = useState(false);
  // the words dialog: { words, print } while it is open
  const [shown, setShown] = useState(null);
  const [filing, setFiling] = useState(false);
  // the key a removal waits for a proof for
  const [confirming, setConfirming] = useState(null);
  const [connecting, setConnecting] = useState(false);

  // "Connect" a Cardano wallet (plan 3): a player with keys proves it first (ConfirmChange)
  const [linking, setLinking] = useState(false);
  const [linkProof, setLinkProof] = useState(false);
  const [linkToken, setLinkToken] = useState(undefined);
  const linkWallet = () => {
    setLinkToken(undefined);
    if (identities.length > 0) {
      setLinkProof(true);
    } else {
      setLinking(true);
    }
  };
  const walletLinked = (answer) => {
    setLinking(false);
    if (answer.outcome === "confirm") {
      setLinkProof(true);
      return;
    }
    keys.refresh();
  };

  const save = async () => {
    if (await keys.save()) {
      setKeeping(true);
    }
  };

  const openKeepWords = () => {
    setError(null);
    setKeeping(true);
  };
  const openSafety = () => {
    setError(null);
    setSafety(true);
  };

  // the words to write down or print (through the passkey when there is one)
  const showWords = async (print) => {
    const words = await keys.openWords();
    if (words) {
      setShown({ words, print });
    }
  };

  const saveFile = async (password) => {
    await keys.saveFile(password);
    setFiling(false);
  };

  const remove = async (confirmToken) => {
    await keys.remove(confirming, confirmToken);
    setConfirming(null);
  };

  if (identities === null) {
    return null;
  }
  const state = accountSafety({
    identities,
    local,
    passkeys,
    canPasskey: keys.canPasskey,
    walletDoor: features.showWalletDoor(),
    // in the Android app nothing visibly crypto until the Play Store's declaration (spec, section 7)
    details: !features.inAndroidApp(),
  });
  const network = features.showPreprodBadge()
    ? networkLabel(features.network().name)
    : null;
  // an error shows where the player is: in the topmost open dialog, else under the row
  let errorIn = "row";
  if (keeping) {
    errorIn = "keep";
  } else if (safety) {
    errorIn = "safety";
  }

  let status;
  if (state.profile === "unsaved") {
    status = (
      <>
        <div className={classes.line}>
          <span className={classes.lock} />
          <span>{t(tr.PROGRESS_ONLY_HERE)}</span>
        </div>
        <Button
          className={classes.save}
          color="primary"
          disabled={keys.busy}
          onClick={save}
        >
          {keys.busy ? t(tr.SAVING) : t(tr.SAVE_PROGRESS)}
        </Button>
        <button
          type="button"
          className={classes.link}
          onClick={() => setConnecting(true)}
        >
          {t(tr.HAVE_ACCOUNT)}
        </button>
      </>
    );
  } else if (state.profile === "unfinished") {
    status = (
      <>
        <button
          type="button"
          className={`${classes.pill} ${classes.finish}`}
          onClick={openKeepWords}
        >
          <LineIcon name="warning" size={1.25} width={2.2} />
          {t(tr.BACKUP_FINISH)}
          <LineIcon name="next" size={1.1} width={2.5} />
        </button>
        <p className={classes.hint}>{t(tr.BACKUP_FINISH_TEXT)}</p>
      </>
    );
  } else {
    status = (
      <button type="button" className={classes.pill} onClick={openSafety}>
        <span className={classes.check} />
        <span className={classes.savedWord}>{t(tr.SAVE_PROGRESS_SAVED)}</span>
        <span className={classes.manage}>
          {t(tr.ACCOUNT_MANAGE)}
          <LineIcon name="next" size={1} width={2.5} />
        </span>
      </button>
    );
  }

  return (
    <div
      className={classes.section}
      data-testid="save-progress"
      data-state={state.profile}
    >
      {status}
      {error && errorIn === "row" ? (
        <p className={classes.error} role="alert">
          {error}
        </p>
      ) : null}
      <AccountSafety
        open={safety}
        onClose={() => {
          // an error belongs to the dialog it showed in: it does not move down to the row
          setError(null);
          setSafety(false);
        }}
        state={state}
        network={network}
        policyHref={policyLink()}
        passkeyBusy={keys.passkeyBusy}
        error={errorIn === "safety" ? error : null}
        onBackUp={openKeepWords}
        onPasskey={keys.savePasskey}
        onConnectWallet={linkWallet}
        onRemove={setConfirming}
        onAnotherAccount={() => setConnecting(true)}
      />
      <KeepWords
        open={keeping}
        onClose={() => {
          setError(null);
          setKeeping(false);
        }}
        wordsDone={state.wordsKept}
        fileDone={state.fileKept}
        canPrint={!features.isMobile()}
        canFile={features.offerFileShare()}
        onWrite={() => showWords(false)}
        onPrint={() => showWords(true)}
        onFile={() => {
          setError(null);
          setFiling(true);
        }}
        error={errorIn === "keep" ? error : null}
      />
      {linking ? (
        <Suspense fallback={null}>
          <WalletDoor
            open={linking}
            purpose="link"
            confirmToken={linkToken}
            onClose={() => setLinking(false)}
            onDone={walletLinked}
          />
        </Suspense>
      ) : null}
      <ConfirmChange
        open={linkProof}
        passkeyIds={(passkeys || []).map((passkey) => passkey.credentialId)}
        onClose={() => setLinkProof(false)}
        onConfirmed={async (token) => {
          setLinkProof(false);
          setLinkToken(token);
          setLinking(true);
        }}
      />
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
        open={shown !== null}
        words={shown ? shown.words : []}
        print={shown ? shown.print : false}
        onClose={() => setShown(null)}
        onBackedUp={keys.backedUp}
      />
    </div>
  );
};

export default SaveProgress;
