import { createUseStyles } from "react-jss";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";

// The words a player may mean while typing recovery words (the owner's pick 2026-11-11: a row of
// chips under the field, like a phone keyboard's suggestion bar). The row keeps its height when
// empty, so the buttons below do not jump while typing. A chip takes no focus: the field keeps it,
// and with it the phone's keyboard.

const useStyles = createUseStyles((theme) => ({
  row: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: "0.4em",
    width: "100%",
    maxWidth: "28em",
    minHeight: "2.2em",
    margin: "0.5em auto 0",
  },
  chip: {
    padding: "0.3em 0.75em",
    borderRadius: 999,
    border: `0.12em solid ${theme.color.secondary.light}`,
    background: "white",
    color: theme.color.secondary.dark,
    fontFamily: theme.font.body,
    fontSize: `max(16px, ${theme.font.size.sm})`,
    fontWeight: 700,
    cursor: "pointer",
    touchAction: "manipulation",
  },
}));

/** The `words` as chips; `onPick(word)` when one is tapped. */
const WordChips = ({ words, onPick }) => {
  const classes = useStyles();
  return (
    <div
      className={classes.row}
      role="group"
      aria-label={t(tr.WORD_SUGGESTIONS)}
    >
      {words.map((word) => (
        <button
          key={word}
          type="button"
          tabIndex={-1}
          className={classes.chip}
          data-testid="word-suggestion"
          // the field keeps the focus (and the phone its keyboard)
          onPointerDown={(event) => event.preventDefault()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(word)}
        >
          {word}
        </button>
      ))}
    </div>
  );
};

export default WordChips;
