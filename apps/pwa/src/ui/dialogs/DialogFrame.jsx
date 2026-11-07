import React from "react";
import { createUseStyles } from "react-jss";

// `scaled`: the pieces are this high relative to the panel's width (the parent is a size
// container), so they look the same on every screen; the widths follow the SVGs' proportions
const SCALED = "23cqw";
const scaled = (ratio) => `calc(${SCALED} * ${ratio})`;

const useStyles = createUseStyles({
  border: {
    position: "absolute",
    zIndex: 12,
    pointerEvents: "none",
  },
  top: {
    top: 0,
    left: 0,
    width: (props) =>
      props.scaled ? scaled(1112 / 447) : props.compact ? "50vw" : "80vw",
    height: (props) =>
      props.scaled ? SCALED : props.compact ? "20vh" : "32vh",
    background: "url(/images/dialog-border-top.svg) no-repeat",
  },
  left: {
    display: (props) => (props.compact ? "none" : "block"),
    bottom: 0,
    left: 0,
    width: (props) => (props.scaled ? scaled(556 / 563) : "16vw"),
    height: (props) => (props.scaled ? SCALED : "32vh"),
    background: "url(/images/dialog-border-left.svg) no-repeat",
    backgroundPositionY: "bottom",
  },
  right: {
    bottom: 0,
    right: 0,
    width: (props) =>
      props.scaled ? scaled(556 / 296) : props.compact ? "15vw" : "24vw",
    height: (props) =>
      props.scaled ? SCALED : props.compact ? "20vh" : "32vh",
    background: "url(/images/dialog-border-right.svg) no-repeat",
    backgroundPositionX: "right",
    backgroundPositionY: "bottom",
  },
});

/**
 * The chocolate pieces in the corners of a game panel (top left, bottom left, bottom right).
 * The parent is positioned and clips them (overflow hidden, rounded corners). `compact` is the
 * smaller frame of notifications, `scaled` sizes the pieces by the panel (the parent must be a
 * container: container-type inline-size); `classes` overrides the size of a piece ({ top, left, right }).
 */
const DialogFrame = ({
  compact = false,
  scaled = false,
  classes: overrides = {},
}) => {
  const classes = useStyles({ compact, scaled });
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

export default DialogFrame;
