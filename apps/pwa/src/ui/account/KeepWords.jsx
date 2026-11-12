import { createPortal } from "react-dom";
import { createUseStyles } from "react-jss";
import Dialog from "../dialogs/Dialog";
import SafetyRow from "./SafetyRow";
import LineIcon from "./LineIcon";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";

// "Keep your words" (the owner's mockup B, screen 8, 2026-11-12): the ways to keep the 24
// recovery words, each a whole-row button: write them down (the words and their check), print
// them (not on phones and tablets: no "save as PDF" there) and save an encrypted file (where the
// device can). Opened right after the first save, by "Finish your backup" in the profile and by
// "Back up" in Account safety.

const useStyles = createUseStyles((theme) => ({
  body: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: "100%",
    maxWidth: "30em",
    margin: "12px auto 0",
    fontFamily: theme.font.body,
    color: "white",
  },
  text: {
    margin: "0 0 1em",
    fontSize: theme.font.size.sm,
    lineHeight: 1.4,
    textAlign: "center",
  },
  rows: {
    display: "flex",
    flexDirection: "column",
    gap: "0.6em",
    width: "100%",
  },
  note: {
    display: "flex",
    gap: "0.6em",
    boxSizing: "border-box",
    width: "100%",
    marginTop: "1em",
    padding: "0.75em",
    borderRadius: 14,
    background: "rgba(0, 0, 0, 0.24)",
    fontSize: theme.font.size.sm,
    lineHeight: 1.4,
    textAlign: "left",
  },
  shield: {
    color: theme.color.gold.light,
    marginTop: "0.05em",
  },
  error: {
    margin: "0.8em 0 0",
    fontSize: theme.font.size.sm,
    fontWeight: 700,
    color: theme.color.gold.light,
    textAlign: "center",
  },
  back: {
    display: "flex",
    alignItems: "center",
    gap: "0.25em",
    minHeight: 44,
    marginTop: "0.6em",
    padding: "0 0.5em",
    border: 0,
    background: "none",
    color: "white",
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    fontWeight: 600,
    textDecoration: "underline",
    cursor: "pointer",
  },
}));

/**
 * `open`, `onClose`; the marks `wordsDone` and `fileDone`; `canPrint` and `canFile` say which
 * ways this device offers; `onWrite`, `onPrint`, `onFile` start them; `error` shows under the rows.
 */
const KeepWords = ({
  open,
  onClose,
  wordsDone,
  fileDone,
  canPrint,
  canFile,
  onWrite,
  onPrint,
  onFile,
  error,
}) => {
  const classes = useStyles();
  if (!open) {
    return null;
  }
  return createPortal(
    <Dialog
      open={open}
      close={onClose}
      mode="stacked"
      icon="pen"
      title={t(tr.RECOVERY_WORDS_NAME)}
    >
      <div className={classes.body} data-testid="keep-words">
        <p className={classes.text}>{t(tr.KEEP_WORDS_TEXT)}</p>
        <div className={classes.rows}>
          <SafetyRow
            icon="pen"
            title={t(tr.KEEP_WRITE)}
            text={t(tr.KEEP_WRITE_TEXT)}
            status={wordsDone ? { text: t(tr.KEEP_DONE), tone: "done" } : null}
            onClick={onWrite}
          />
          {canPrint ? (
            <SafetyRow
              icon="print"
              title={t(tr.RECOVERY_WORDS_PRINT)}
              text={t(tr.KEEP_PRINT_TEXT)}
              onClick={onPrint}
            />
          ) : null}
          {canFile ? (
            <SafetyRow
              icon="file"
              title={t(tr.KEEP_FILE)}
              text={t(tr.KEEP_FILE_TEXT)}
              status={
                fileDone ? { text: t(tr.KEEP_FILE_DONE), tone: "done" } : null
              }
              onClick={onFile}
            />
          ) : null}
        </div>
        {error ? (
          <p className={classes.error} role="alert">
            {error}
          </p>
        ) : null}
        <div className={classes.note}>
          <LineIcon
            name="shield"
            size={1.3}
            width={2.2}
            className={classes.shield}
          />
          <span>{t(tr.KEEP_WORDS_NOTE)}</span>
        </div>
        <button type="button" className={classes.back} onClick={onClose}>
          <LineIcon name="back" size={0.95} width={2.5} />
          {t(tr.BUTTON_BACK)}
        </button>
      </div>
    </Dialog>,
    document.body
  );
};

export default KeepWords;
