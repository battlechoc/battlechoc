import { createUseStyles } from "react-jss";
import LineIcon from "./LineIcon";

// One row of the account dialogs (the owner's mockup B, 2026-11-12): a round icon, a title, a
// status line and at most one action on the right (AccountSafety), or the whole row as one
// button with a chevron (KeepWords). Rows sit on the dark blue with a light blue border.

// the done green, readable on the row's dark blue (contrast about 7:1)
export const DONE_GREEN = "#B7EE5A";

const useStyles = createUseStyles((theme) => ({
  row: {
    display: "flex",
    alignItems: "center",
    gap: "0.65em",
    boxSizing: "border-box",
    width: "100%",
    margin: 0,
    padding: "0.6em",
    borderRadius: 14,
    background: theme.color.secondary.dark,
    border: `2px solid ${theme.color.secondary.light}`,
    color: "white",
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    textAlign: "left",
  },
  button: {
    minHeight: "4em",
    cursor: "pointer",
    "&:hover": { background: "#235f7f" },
    "&:focus-visible": {
      outline: `3px solid ${theme.color.gold.light}`,
      outlineOffset: 2,
    },
  },
  bubble: {
    flex: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "2.4em",
    height: "2.4em",
    borderRadius: "50%",
    background: "rgba(255, 255, 255, 0.12)",
  },
  texts: {
    flex: "1 1 auto",
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "0.2em",
  },
  title: {
    fontWeight: 700,
  },
  text: {
    fontSize: theme.font.size.sm,
    lineHeight: 1.35,
    color: "rgba(255, 255, 255, 0.85)",
  },
  status: {
    display: "flex",
    alignItems: "center",
    gap: "0.3em",
    fontSize: theme.font.size.sm,
    fontWeight: 600,
  },
  done: { color: DONE_GREEN },
  todo: { color: theme.color.gold.light },
  plain: { color: "rgba(255, 255, 255, 0.8)" },
}));

const usePillStyles = createUseStyles((theme) => ({
  pill: {
    flex: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: "0.15em",
    minHeight: 44,
    boxSizing: "border-box",
    padding: "0 0.95em",
    borderRadius: 999,
    border: "2px solid white",
    background: "white",
    color: theme.color.secondary.dark,
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    fontWeight: 700,
    whiteSpace: "nowrap",
    cursor: "pointer",
    "&:focus-visible": {
      outline: `3px solid ${theme.color.gold.light}`,
      outlineOffset: 2,
    },
    "&:disabled": { cursor: "default", opacity: 0.7 },
  },
  // a step back (Disconnect): white outline on the row
  outline: {
    background: "transparent",
    color: "white",
  },
  // taking a key away (Remove)
  danger: {
    minHeight: 40,
    border: "2px solid #FF8AAE",
    background: `linear-gradient(0deg, ${theme.color.accent.dark} 0%, ${theme.color.accent.light} 100%)`,
    color: "white",
  },
}));

/** A round action button: `variant` "solid" (white), "outline" or "danger" (pink). */
export const Pill = ({
  variant = "solid",
  chevron = false,
  children,
  ...props
}) => {
  const classes = usePillStyles();
  return (
    <button
      type="button"
      className={`${classes.pill} ${variant === "solid" ? "" : classes[variant]}`}
      {...props}
    >
      {children}
      {chevron ? <LineIcon name="next" size={0.95} width={2.5} /> : null}
    </button>
  );
};

/**
 * `icon` (a LineIcon name), `title`, optional `text` (a line below the title), `status`
 * ({ text, tone: "done" | "todo" | "plain" }), and either `action` (the element on the right) or
 * `onClick` (the whole row is the button).
 */
const SafetyRow = ({ icon, title, text, status, action, onClick, testId }) => {
  const classes = useStyles();
  const body = (
    <>
      <span className={classes.bubble}>
        <LineIcon name={icon} size={1.25} />
      </span>
      <span className={classes.texts}>
        <span className={classes.title}>{title}</span>
        {text ? <span className={classes.text}>{text}</span> : null}
        {status ? (
          <span className={`${classes.status} ${classes[status.tone]}`}>
            {status.tone === "done" ? (
              <LineIcon name="check" size={1} width={3} />
            ) : null}
            {status.text}
          </span>
        ) : null}
      </span>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        className={`${classes.row} ${classes.button}`}
        data-testid={testId}
        onClick={onClick}
      >
        {body}
        <LineIcon name="next" size={1.1} width={2.5} />
      </button>
    );
  }
  return (
    <div className={classes.row} data-testid={testId}>
      {body}
      {action || null}
    </div>
  );
};

export default SafetyRow;
