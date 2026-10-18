import React from "react";
import PropTypes from "prop-types";
import { createUseStyles } from "react-jss";

const useStyles = createUseStyles((theme) => ({
  // beside the board in landscape (never narrower than about 20 words), across in portrait;
  // a long text scrolls, the footer with the buttons stays visible
  coach: {
    position: "absolute",
    zIndex: 5,
    left: "1vw",
    top: "calc(12px + 7vw)",
    width: "max(27vw, 20em)",
    maxWidth: "calc(100vw - 2vw)",
    maxHeight: "calc(100vh - 7vw - 13vw)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    boxSizing: "border-box",
    padding: "0.8em 0.95em",
    borderRadius: 20,
    background: `linear-gradient(0deg, ${theme.color.secondary.dark} 0%, ${theme.color.secondary.light} 80%)`,
    border: `0.3vw solid ${theme.color.secondary.light}`,
    boxShadow: "0 0.5vw 1.5vw rgba(0, 0, 0, 0.35)",
    color: "white",
    fontSize: theme.font.size.md,
    // landscape: down to the build palette (its icons are min(6vw, 11vh))
    [theme.breakpoints.orientation.landscape]: {
      maxHeight: "calc(100vh - 7vw - 28px - min(6vw, 11vh) - 1vw)",
    },
    [theme.breakpoints.orientation.portrait]: {
      left: "3vw",
      width: "94vw",
      top: "calc(12px + 14vw)",
      padding: "0.8em",
    },
  },
  title: {
    flex: "0 0 auto",
    margin: "0 0 0.3em 0",
    fontFamily: theme.font.display,
    fontSize: theme.font.size.lg,
    letterSpacing: "0.05em",
    "-webkit-text-stroke": `${theme.font.stroke} ${theme.color.secondary.dark}`,
  },
  message: {
    flex: "0 1 auto",
    minHeight: 0,
    overflowY: "auto",
    margin: 0,
    lineHeight: 1.4,
  },
  footer: {
    flex: "0 0 auto",
    marginTop: "0.6em",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.6em",
  },
  progress: {
    fontFamily: theme.font.display,
    fontSize: theme.font.size.sm,
    opacity: 0.85,
  },
  skip: {
    background: "none",
    border: "none",
    color: "white",
    opacity: 0.8,
    textDecoration: "underline",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: theme.font.size.sm,
    padding: 0,
  },
  buttons: {
    display: "flex",
    gap: "0.5em",
  },
}));

/**
 * The coach card of the tutorial: a title, a short text, the progress ("2/10"), an optional
 * skip link and the buttons that lead on. `className` places it (it is absolutely positioned);
 * other props (data-testid, data-step, ...) go to the card.
 */
const CoachCard = ({
  title,
  message,
  progress,
  skipLabel,
  onSkip,
  className = "",
  children,
  ...rest
}) => {
  const classes = useStyles();
  return (
    <div className={`${classes.coach} ${className}`} {...rest}>
      <p className={classes.title}>{title}</p>
      <p className={classes.message}>{message}</p>
      <div className={classes.footer}>
        <span className={classes.progress}>{progress}</span>
        {onSkip ? (
          <button type="button" className={classes.skip} onClick={onSkip}>
            {skipLabel}
          </button>
        ) : null}
        {children ? <div className={classes.buttons}>{children}</div> : null}
      </div>
    </div>
  );
};

CoachCard.propTypes = {
  title: PropTypes.node.isRequired,
  message: PropTypes.node.isRequired,
  progress: PropTypes.node,
  skipLabel: PropTypes.node,
  onSkip: PropTypes.func,
  className: PropTypes.string,
  children: PropTypes.node,
};

export default CoachCard;
