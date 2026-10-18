import React from "react";
import PropTypes from "prop-types";
import { createUseStyles } from "react-jss";

const useStyles = createUseStyles({
  border: {
    position: "absolute",
    zIndex: 12,
    pointerEvents: "none",
  },
  top: {
    top: 0,
    left: 0,
    width: (props) => (props.compact ? "50vw" : "80vw"),
    height: (props) => (props.compact ? "20vh" : "32vh"),
    background: "url(/images/dialog-border-top.svg) no-repeat",
  },
  left: {
    display: (props) => (props.compact ? "none" : "block"),
    bottom: 0,
    left: 0,
    width: "16vw",
    height: "32vh",
    background: "url(/images/dialog-border-left.svg) no-repeat",
    backgroundPositionY: "bottom",
  },
  right: {
    bottom: 0,
    right: 0,
    width: (props) => (props.compact ? "15vw" : "24vw"),
    height: (props) => (props.compact ? "20vh" : "32vh"),
    background: "url(/images/dialog-border-right.svg) no-repeat",
    backgroundPositionX: "right",
    backgroundPositionY: "bottom",
  },
});

/**
 * The chocolate pieces in the corners of a game panel (top left, bottom left, bottom right).
 * The parent is positioned and clips them (overflow hidden, rounded corners). `compact` is the
 * smaller frame of notifications; `classes` overrides the size of a piece ({ top, left, right }).
 */
const DialogFrame = ({ compact = false, classes: overrides = {} }) => {
  const classes = useStyles({ compact });
  return (
    <>
      <div
        className={`${classes.border} ${classes.top} ${overrides.top || ""}`}
        aria-hidden="true"
      />
      <div
        className={`${classes.border} ${classes.left} ${overrides.left || ""}`}
        aria-hidden="true"
      />
      <div
        className={`${classes.border} ${classes.right} ${
          overrides.right || ""
        }`}
        aria-hidden="true"
      />
    </>
  );
};

DialogFrame.propTypes = {
  compact: PropTypes.bool,
  classes: PropTypes.shape({
    top: PropTypes.string,
    left: PropTypes.string,
    right: PropTypes.string,
  }),
};

export default DialogFrame;
