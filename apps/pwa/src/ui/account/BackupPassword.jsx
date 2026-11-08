import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createUseStyles } from "react-jss";
import Dialog from "../dialogs/Dialog";
import Button from "../controls/Button";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import { outlined } from "../styles";

// The password of the backup file (plan 2): chosen twice, at least 8 characters. The file is
// always protected by it, never by the passkey (both usually hang on the same Google or Apple
// account). `onSave(password)` encrypts and hands the file over; the dialog stays until it is done.

const MIN_LENGTH = 8;

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
  fields: {
    display: "flex",
    flexDirection: "column",
    gap: "0.6em",
    width: "min(20em, 100%)",
    margin: "0 auto",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "0.2em",
    fontFamily: theme.font.display,
    fontSize: theme.font.size.md,
    color: "white",
    ...outlined(theme),
  },
  input: {
    padding: "0.45em 0.7em",
    borderRadius: 10,
    border: `0.15em solid ${theme.color.secondary.light}`,
    fontFamily: theme.font.body,
    // at least 16px: iOS Safari zooms into a smaller field on focus
    fontSize: `max(16px, ${theme.font.size.md})`,
  },
  error: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    fontWeight: 700,
    color: theme.color.gold.light,
    textAlign: "center",
    margin: "0.8em 0 0",
  },
  buttons: {
    display: "flex",
    justifyContent: "center",
    marginTop: "1em",
  },
}));

const BackupPassword = ({ open, onClose, onSave }) => {
  const classes = useStyles();
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // a new opening starts empty: a password is never kept
  useEffect(() => {
    if (open) {
      setPassword("");
      setAgain("");
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const save = async () => {
    if (busy) {
      return;
    }
    if (password.length < MIN_LENGTH) {
      setError(t(tr.FILE_PASSWORD_SHORT));
      return;
    }
    if (password !== again) {
      setError(t(tr.FILE_PASSWORD_MISMATCH));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(password);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return null;
  }
  return createPortal(
    <Dialog
      open={open}
      close={() => !busy && onClose()}
      closable={!busy}
      mode="stacked"
      icon="pen"
      title={t(tr.FILE_PASSWORD_TITLE)}
    >
      <form
        className={classes.body}
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <p className={classes.text}>{t(tr.FILE_PASSWORD_TEXT)}</p>
        <div className={classes.fields}>
          <label className={classes.field}>
            {t(tr.FILE_PASSWORD)}
            <input
              className={classes.input}
              type="password"
              autoComplete="new-password"
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <label className={classes.field}>
            {t(tr.FILE_PASSWORD_AGAIN)}
            <input
              className={classes.input}
              type="password"
              autoComplete="new-password"
              value={again}
              onChange={(event) => setAgain(event.target.value)}
            />
          </label>
        </div>
        {error ? (
          <p className={classes.error} role="alert">
            {error}
          </p>
        ) : null}
        <div className={classes.buttons}>
          <Button color="primary" disabled={busy} onClick={save}>
            {t(tr.FILE_SAVE)}
          </Button>
        </div>
        {/* Enter saves */}
        <button type="submit" hidden />
      </form>
    </Dialog>,
    document.body
  );
};

export default BackupPassword;
