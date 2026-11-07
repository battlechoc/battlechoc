import React from "react";
import { createUseStyles } from "react-jss";

// the fingertip's place in images/tap-finger.svg, as a fraction of its width and height
const TIP = 102 / 511.467;
// one tap: the hand hangs lifted, comes down on the target, rests a moment and lifts again
const TAP_MS = 1600;

// where the hand comes from: its lifted and its resting transform (the hand turns about its
// fingertip) and its shadow, which turns with it
const ORIENTATIONS = {
  // from the bottom right, lifted up and to the right
  "bottom-right": {
    rest: "translate(9%, -11%)",
    down: "translate(0, 0)",
    shadow: "0 0.03em 0.04em rgba(0, 0, 0, 0.45)",
  },
  // turned around, from the top left (a button in the bottom right corner), lifted up and left
  "top-left": {
    rest: "rotate(180deg) translate(9%, 11%)",
    down: "rotate(180deg) translate(0, 0)",
    shadow: "0 -0.03em 0.04em rgba(0, 0, 0, 0.45)",
  },
};

const useStyles = createUseStyles({
  "@keyframes tapHand": {
    "0%, 35%": { transform: "var(--hand-rest)" },
    "50%, 65%": { transform: "var(--hand-down)" },
    "85%, 100%": { transform: "var(--hand-rest)" },
  },
  // a ring spreads from the fingertip while the hand rests on the target
  "@keyframes tapRing": {
    "0%, 49%": { opacity: 0, transform: "translate(-50%, -50%) scale(0.3)" },
    "50%": { opacity: 0.95, transform: "translate(-50%, -50%) scale(0.35)" },
    "100%": { opacity: 0, transform: "translate(-50%, -50%) scale(1.4)" },
  },
  // the anchor sits on the target (--tap-size is the hand's width and height, 1em in here);
  // nothing takes the pointer, the tap goes through to the target
  pointer: {
    position: "absolute",
    zIndex: 3,
    width: 0,
    height: 0,
    fontSize: "var(--tap-size)",
    pointerEvents: "none",
  },
  hand: {
    position: "absolute",
    left: `${-TIP}em`,
    top: `${-TIP}em`,
    width: "1em",
    height: "1em",
    backgroundImage: "url(/images/tap-finger.svg)",
    backgroundSize: "100% 100%",
    transformOrigin: `${TIP * 100}% ${TIP * 100}%`,
    filter: "drop-shadow(var(--hand-shadow))",
    animation: `$tapHand ${TAP_MS}ms ease-in-out infinite`,
  },
  ring: {
    position: "absolute",
    left: 0,
    top: 0,
    width: "0.4em",
    height: "0.4em",
    boxSizing: "border-box",
    borderRadius: "50%",
    border: "0.025em solid white",
    opacity: 0,
    animation: `$tapRing ${TAP_MS}ms ease-out infinite`,
    "&:nth-child(2)": { animationDelay: "150ms" },
  },
});

/**
 * The tutorial's tapping hand: its fingertip on (x, y) of the containing block (CSS lengths, or
 * numbers in px), rings spreading from the tip with every tap. `size`, the hand's width and
 * height, is a CSS length or a number in px; without it, `className` sets --tap-size (so it can
 * follow the breakpoints of what the hand points at). `from` is the corner the hand comes from.
 * Other props (data-testid, data-row, ...) go to the anchor element.
 */
const TapPointer = ({ x, y, size, from = "bottom-right", className = "", ...rest }) => {
  const classes = useStyles();
  const length = (value) => (typeof value === "number" ? `${value}px` : value);
  const orientation = ORIENTATIONS[from];
  const style = {
    left: length(x),
    top: length(y),
    "--hand-rest": orientation.rest,
    "--hand-down": orientation.down,
    "--hand-shadow": orientation.shadow,
  };
  if (typeof size !== "undefined") {
    style["--tap-size"] = length(size);
  }
  return (
    <div className={`${classes.pointer} ${className}`} style={style} aria-hidden="true" {...rest}>
      <div className={classes.ring} />
      <div className={classes.ring} />
      <div className={classes.hand} />
    </div>
  );
};

export default TapPointer;
