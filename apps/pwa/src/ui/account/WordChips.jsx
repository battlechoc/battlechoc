import { useEffect, useRef } from "react";
import { createUseStyles } from "react-jss";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";

// The words a player may mean while typing recovery words (the owner's pick 2026-11-11: a row of
// chips under the field, like a phone keyboard's suggestion bar). The row is one line of a fixed
// height, empty or full: the buttons below never move. They did when five chips took a second
// row: the press on "Done" took the focus from the field, the chips went, the button moved up and
// the release missed it (2026-11-13). Chips that do not fit scroll sideways. A chip takes no
// focus: the field keeps it, and with it the phone's keyboard.

const useStyles = createUseStyles((theme) => ({
  row: {
    display: "flex",
    flexWrap: "nowrap",
    alignItems: "center",
    gap: "0.4em",
    boxSizing: "border-box",
    width: "100%",
    maxWidth: "28em",
    height: "2.4em",
    margin: "0.5em auto 0",
    fontSize: `max(16px, ${theme.font.size.sm})`,
    overflowX: "auto",
    overflowY: "hidden",
    scrollbarWidth: "none",
    "&::-webkit-scrollbar": { display: "none" },
    // centred while they fit, from the first chip on once they scroll (justify-content: center
    // would cut the first ones off)
    "& > :first-child": { marginLeft: "auto" },
    "& > :last-child": { marginRight: "auto" },
  },
  chip: {
    flex: "none",
    padding: "0.3em 0.75em",
    borderRadius: 999,
    border: `0.12em solid ${theme.color.secondary.light}`,
    background: "white",
    color: theme.color.secondary.dark,
    fontFamily: theme.font.body,
    fontSize: "1em",
    fontWeight: 700,
    cursor: "pointer",
    touchAction: "manipulation",
  },
}));

/** The `words` as chips; `onPick(word)` when one is tapped. */
const WordChips = ({ words, onPick }) => {
  const classes = useStyles();
  // new words start at the first chip again
  const row = useRef(null);
  const shown = words.join(" ");
  useEffect(() => {
    if (row.current) {
      row.current.scrollLeft = 0;
    }
  }, [shown]);
  return (
    <div
      ref={row}
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
