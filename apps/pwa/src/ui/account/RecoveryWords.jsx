import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createUseStyles } from "react-jss";
import Dialog from "../dialogs/Dialog";
import Button from "../controls/Button";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import { outlined } from "../styles";
import { normalizeWords } from "../../cardano";
import logger from "../../helper/logger";
import { suggestWords } from "../../cardano/wordSuggestions";
import WordChips from "./WordChips";

// The 24 recovery words (the owner's pick "A", 2026-11-08): white numbered tiles in three
// columns, Print, and a check that asks three of them back before they count as backed up. It
// is drawn into the page's body, over the profile it is opened from (inside the profile's dialog
// the profile's close button would cover its own back button).

const CHECKED_WORDS = 3;
const PRINT_SHEET = "battlechoc-recovery-print";

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
    maxWidth: "30em",
    margin: "0 auto 0.8em",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "0.35em",
    width: "100%",
    maxWidth: "30em",
    margin: "0 auto",
  },
  tile: {
    display: "flex",
    gap: "0.35em",
    alignItems: "baseline",
    padding: "0.3em 0.5em",
    borderRadius: 8,
    background: "white",
    color: theme.color.secondary.dark,
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    fontWeight: 700,
    userSelect: "text",
  },
  number: {
    minWidth: "1.4em",
    textAlign: "right",
    color: "#8aa0ad",
    fontWeight: 400,
  },
  buttons: {
    display: "flex",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: "0.8em",
    marginTop: "1em",
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
    alignItems: "center",
    gap: "0.6em",
    fontFamily: theme.font.display,
    fontSize: theme.font.size.md,
    color: "white",
    ...outlined(theme),
  },
  input: {
    flex: 1,
    minWidth: 0,
    padding: "0.45em 0.7em",
    borderRadius: 10,
    border: `0.15em solid ${theme.color.secondary.light}`,
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
  },
  wrong: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    fontWeight: 700,
    color: theme.color.gold.light,
    textAlign: "center",
    margin: "0.8em 0 0",
  },
  // only the words on paper: the rest of the page is hidden while printing
  print: {
    display: "none",
  },
  "@global": {
    "@media print": {
      "body *": { visibility: "hidden" },
      [`.${PRINT_SHEET}, .${PRINT_SHEET} *`]: { visibility: "visible" },
      [`.${PRINT_SHEET}`]: {
        display: "block !important",
        position: "fixed",
        left: 0,
        top: 0,
        width: "100%",
        padding: "2cm",
        columnCount: 2,
        fontFamily: "Georgia, serif",
        fontSize: "14pt",
        lineHeight: 2,
        color: "black",
        background: "white",
      },
    },
  },
}));

// three different positions (1 to 24) to ask back, in order
const pickPositions = (count) => {
  const positions = new Set();
  while (positions.size < CHECKED_WORDS) {
    positions.add(1 + Math.floor(Math.random() * count));
  }
  return [...positions].sort((a, b) => a - b);
};

/**
 * The words in a dialog over the profile (`open`, `words`); `onClose`, and `onBackedUp` once the
 * player typed three of them back correctly.
 */
const RecoveryWords = ({ open, words, onClose, onBackedUp }) => {
  const classes = useStyles();
  const [checking, setChecking] = useState(false);
  const [positions, setPositions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [wrong, setWrong] = useState(false);
  // the position whose field has the focus (null without): its word gets suggestions
  const [focused, setFocused] = useState(null);
  const fields = useRef({});

  // a new opening starts with the words
  useEffect(() => {
    if (open) {
      setChecking(false);
      setWrong(false);
      setAnswers({});
    }
  }, [open]);

  const startCheck = () => {
    setPositions(pickPositions(words.length));
    setAnswers({});
    setWrong(false);
    setChecking(true);
  };

  const finishCheck = async () => {
    // the same leniency as when the words are typed to sign in (full-width letters, capitals)
    const right = positions.every(
      (n) => normalizeWords(answers[n] || "").join(" ") === words[n - 1]
    );
    if (!right) {
      setWrong(true);
      return;
    }
    try {
      await onBackedUp();
      onClose();
    } catch (failure) {
      logger.warn("could not keep the backup mark", failure);
    }
  };

  const suggestions =
    focused === null ? [] : suggestWords((answers[focused] || "").trim());
  // a picked word fills the field, and the next field gets the focus
  const pickWord = (word) => {
    setAnswers({ ...answers, [focused]: word });
    const next = positions[positions.indexOf(focused) + 1];
    if (typeof next !== "undefined" && fields.current[next]) {
      fields.current[next].focus();
    }
  };

  if (!open) {
    return null;
  }
  return createPortal(
    <Dialog
      open={open}
      close={onClose}
      mode="stacked"
      icon="pen"
      title={
        checking ? t(tr.RECOVERY_WORDS_CHECK_TITLE) : t(tr.RECOVERY_WORDS_TITLE)
      }
    >
      <div className={classes.body}>
        {checking ? (
          <>
            <p className={classes.text}>{t(tr.RECOVERY_WORDS_CHECK_TEXT)}</p>
            <form
              className={classes.fields}
              onSubmit={(event) => {
                event.preventDefault();
                finishCheck();
              }}
            >
              {positions.map((n, i) => (
                <label key={n} className={classes.field}>
                  {t(tr.RECOVERY_WORDS_WORD, n)}
                  <input
                    className={classes.input}
                    data-testid="recovery-check-word"
                    data-n={n}
                    autoFocus={i === 0}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    enterKeyHint={i === positions.length - 1 ? "done" : "next"}
                    ref={(element) => {
                      fields.current[n] = element;
                    }}
                    value={answers[n] || ""}
                    onChange={(event) =>
                      setAnswers({ ...answers, [n]: event.target.value })
                    }
                    onFocus={() => setFocused(n)}
                    onBlur={() => setFocused(null)}
                  />
                </label>
              ))}
              <WordChips words={suggestions} onPick={pickWord} />
              {/* Enter in a field checks the words */}
              <button type="submit" hidden />
            </form>
            {wrong ? (
              <p className={classes.wrong}>{t(tr.RECOVERY_WORDS_WRONG)}</p>
            ) : null}
            <div className={classes.buttons}>
              <Button color="secondary" onClick={() => setChecking(false)}>
                {t(tr.RECOVERY_WORDS_SHOW)}
              </Button>
              <Button color="primary" onClick={finishCheck}>
                {t(tr.RECOVERY_WORDS_DONE)}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className={classes.text}>{t(tr.RECOVERY_WORDS_TEXT)}</p>
            <div className={classes.grid}>
              {words.map((word, i) => (
                <div
                  key={i}
                  className={classes.tile}
                  data-testid="recovery-word"
                  data-word={word}
                >
                  <span className={classes.number}>{i + 1}</span>
                  {word}
                </div>
              ))}
            </div>
            <div className={classes.buttons}>
              <Button color="secondary" onClick={() => window.print()}>
                {t(tr.RECOVERY_WORDS_PRINT)}
              </Button>
              <Button color="primary" onClick={startCheck}>
                {t(tr.RECOVERY_WORDS_WROTE)}
              </Button>
            </div>
            <div className={`${classes.print} ${PRINT_SHEET}`} aria-hidden>
              {words.map((word, i) => (
                <div key={i}>{`${i + 1}. ${word}`}</div>
              ))}
            </div>
          </>
        )}
      </div>
    </Dialog>,
    document.body
  );
};

export default RecoveryWords;
