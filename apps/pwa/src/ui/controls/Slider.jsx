import React from "react";
import PropTypes from "prop-types";
import { createUseStyles } from "react-jss";

// A level from 0 to 1 with its name and percentage in one row, in the text size of buttons
// (like Select): the part up to the thumb is filled.
const useStyles = createUseStyles((theme) => ({
  row: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: "0.6em",
    margin: "0.4em 0",
    fontSize: theme.font.size.lg,
    fontFamily: theme.font.display,
    color: "white",
    "-webkit-text-stroke": `${theme.font.stroke} ${theme.color.secondary.dark}`,
    "-webkit-font-smoothing": "antialiased",
    userSelect: "none",
  },
  label: {
    flex: "0 0 5em",
  },
  value: {
    flex: "0 0 3em",
    textAlign: "right",
  },
  input: {
    flex: "1 1 auto",
    minWidth: 0,
    margin: 0,
    height: "0.6em",
    appearance: "none",
    borderRadius: "0.3em",
    border: `0.12em solid ${theme.color.secondary.dark}`,
    background: `linear-gradient(90deg, ${theme.color.primary.light} var(--fill), white var(--fill))`,
    cursor: "pointer",
    outline: "none",
    "&::-webkit-slider-thumb": {
      appearance: "none",
      width: "1.3em",
      height: "1.3em",
      borderRadius: "50%",
      border: `0.15em solid ${theme.color.primary.dark}`,
      background: `linear-gradient(0deg, ${theme.color.primary.dark} 0%, ${theme.color.primary.light} 70%)`,
      boxSizing: "border-box",
    },
    "&::-moz-range-thumb": {
      width: "1.3em",
      height: "1.3em",
      borderRadius: "50%",
      border: `0.15em solid ${theme.color.primary.dark}`,
      background: `linear-gradient(0deg, ${theme.color.primary.dark} 0%, ${theme.color.primary.light} 70%)`,
      boxSizing: "border-box",
    },
    "&:focus-visible": {
      outline: `0.15em solid ${theme.color.gold.light}`,
      outlineOffset: "0.2em",
    },
  },
}));

const Slider = ({ label, value, onChange, onCommit, ...rest }) => {
  const classes = useStyles();
  const percent = Math.round(value * 100);
  return (
    <label className={classes.row}>
      <span className={classes.label}>{label}</span>
      <input
        {...rest}
        className={classes.input}
        type="range"
        min={0}
        max={100}
        step={5}
        value={percent}
        style={{ "--fill": `${percent}%` }}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
      />
      <span className={classes.value}>{percent} %</span>
    </label>
  );
};

Slider.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
  onChange: PropTypes.func.isRequired,
  // the thumb was let go (a sample of the new level)
  onCommit: PropTypes.func,
};

export default Slider;
