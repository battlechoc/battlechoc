import React from "react";
import PropTypes from "prop-types";
import { createUseStyles } from "react-jss";

const useStyles = createUseStyles((theme) => ({
  coach: {
    position: "absolute",
    zIndex: 5,
    left: "1vw",
    top: "calc(12px + 7vw)",
    width: "27vw",
    maxHeight: "calc(100vh - 7vw - 13vw)",
    overflowY: "auto",
    boxSizing: "border-box",
    padding: "1.2vw 1.4vw",
    borderRadius: 20,
    background: `linear-gradient(0deg, ${theme.color.secondary.dark} 0%, ${theme.color.secondary.light} 80%)`,
    border: `0.3vw solid ${theme.color.secondary.light}`,
    boxShadow: "0 0.5vw 1.5vw rgba(0, 0, 0, 0.35)",
    color: "white",
    [theme.breakpoints.orientation.portrait]: {
      left: "3vw",
      width: "94vw",
      top: "calc(12px + 14vw)",
      padding: "3vw",
    },
  },
  title: {
    margin: "0 0 0.6vw 0",
    fontFamily: "var(--font-display)",
    fontSize: "2.4vw",
    letterSpacing: "0.05em",
    "-webkit-text-stroke": `0.08vw ${theme.color.secondary.dark}`,
    [theme.breakpoints.orientation.portrait]: { fontSize: "6vw" },
  },
  message: {
    margin: 0,
    fontSize: "1.35vw",
    lineHeight: 1.4,
    [theme.breakpoints.orientation.portrait]: { fontSize: "3.8vw" },
  },
  footer: {
    marginTop: "1vw",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "1vw",
  },
  progress: {
    fontFamily: "var(--font-display)",
    fontSize: "1.4vw",
    opacity: 0.85,
    [theme.breakpoints.orientation.portrait]: { fontSize: "4vw" },
  },
  skip: {
    background: "none",
    border: "none",
    color: "white",
    opacity: 0.8,
    textDecoration: "underline",
    cursor: "pointer",
    fontSize: "1.1vw",
    padding: 0,
    [theme.breakpoints.orientation.portrait]: { fontSize: "3.4vw" },
  },
  buttons: {
    display: "flex",
    gap: "0.8vw",
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
