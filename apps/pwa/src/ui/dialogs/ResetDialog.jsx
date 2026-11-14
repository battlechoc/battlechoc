import { useEffect, useState } from "react";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import MessageDialog from "./MessageDialog";
import Button from "../controls/Button";
import Progress from "../controls/Progress";
import Jukebox from "../misc/Jukebox";
import OfflineStore from "../../OfflineStore";
import { account } from "../../api/account";
import { cardanoApi, features, keyStore, subjectOfWords } from "../../cardano";
import { accountSafety } from "../account/safetyState";
import { resetDevice, resetWarning } from "../../reset";
import logger from "../../helper/logger";

// what the dialog says about the account (src/reset.js, resetWarning)
const WARNINGS = {
  saved: tr.RESET_SAVED,
  unsaved: tr.RESET_UNSAVED,
  unknown: tr.RESET_UNKNOWN,
  noBackup: tr.RESET_NO_BACKUP,
};

// whether a backup opens the account again: the same state the profile shows
// (ui/account/useAccountKeys.js, safetyState.js)
const readWarning = async (online) => {
  const canSave = features.enabled();
  if (!canSave || !online) {
    return resetWarning({ canSave, online, profile: null });
  }
  try {
    const identities = await cardanoApi.identities();
    const words = await keyStore.load();
    const local = {
      words,
      subject: words ? await subjectOfWords(words) : null,
      methods: await keyStore.backupMethods(),
    };
    const passkeys = await cardanoApi.passkeys().catch(() => null);
    const { profile } = accountSafety({ identities, local, passkeys });
    return resetWarning({ canSave, online, profile });
  } catch (error) {
    logger.warn("could not read whether the account is saved", error);
    return "unknown";
  }
};

/**
 * "Reset battlechoc?" over the Settings: what the reset deletes, what it means for the account,
 * "Save first" when the account is not saved (opens the profile), and the reset itself. The game
 * then loads anew and starts as on its first visit.
 */
const ResetDialog = ({ open, close, online, saveFirst }) => {
  // null while the account's state is read: the reset waits for the warning
  const [warning, setWarning] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    let current = true;
    setWarning(null);
    readWarning(online).then((value) => {
      if (current) {
        setWarning(value);
      }
    });
    return () => {
      current = false;
    };
  }, [open, online]);

  const reset = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
    await resetDevice({
      erase: () => OfflineStore.eraseAll(),
      // the server forgets this device's session (the account itself stays there)
      endSession: () =>
        online && account.refreshToken
          ? account.logout(account.refreshToken)
          : Promise.resolve(),
      local: () => window.localStorage,
      session: () => window.sessionStorage,
    });
    // the start page, not the address the game was on (a profile, a challenge)
    window.location.replace("/");
  };

  const cancel = () => {
    if (busy) {
      return;
    }
    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
    close();
  };

  return (
    <MessageDialog
      open={open}
      close={cancel}
      title={t(tr.RESET_TITLE)}
      text={t(tr.RESET_TEXT)}
      data-testid="reset-dialog"
    >
      <p data-testid="reset-warning" data-warning={warning || "reading"}>
        {warning ? t(WARNINGS[warning]) : "…"}
      </p>
      {warning === "unsaved" ? (
        <Button
          color="primary"
          disabled={busy}
          onClick={() => {
            Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
            saveFirst();
          }}
          data-testid="reset-save-first"
        >
          {t(tr.RESET_SAVE_FIRST)}
        </Button>
      ) : null}
      <Button
        color="warning"
        disabled={!warning || busy}
        onClick={reset}
        data-testid="reset-confirm"
      >
        {busy ? <Progress size={18} infiniteAnimation /> : t(tr.RESET_CONFIRM)}
      </Button>
      <Button color="secondary" disabled={busy} onClick={cancel}>
        {t(tr.RESET_CANCEL)}
      </Button>
    </MessageDialog>
  );
};

export default ResetDialog;
