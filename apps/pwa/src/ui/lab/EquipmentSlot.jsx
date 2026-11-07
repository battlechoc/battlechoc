import React from "react";
import { createUseStyles } from "react-jss";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import ItemIcon from "./ItemIcon";
import { itemName, labColors } from "./itemText";
import { bangers } from "../styles";

const useStyles = createUseStyles((theme) => ({
  slot: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.4em",
    width: "8.5em",
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    color: "white",
    font: "inherit",
    "&:disabled": { cursor: "default" },
    "&:focus-visible > span:first-child": {
      outline: `3px solid ${theme.color.gold.light}`,
      outlineOffset: 4,
    },
  },
  ring: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "4.6em",
    height: "4.6em",
    minWidth: 48,
    minHeight: 48,
    borderRadius: "50%",
    boxSizing: "border-box",
    border: `0.2em dashed ${theme.color.secondary.light}`,
    background: theme.color.secondary.dark,
    transition: "transform 0.15s",
    "button:hover:not(:disabled) > &": { transform: "scale(1.06)" },
    "@media (prefers-reduced-motion: reduce)": { transition: "none" },
  },
  filled: { border: "none", background: "none" },
  // equipped but left out of matches: over the budget after a balance change
  inactive: { opacity: 0.45, filter: "grayscale(0.8)" },
  warning: {
    ...bangers(theme, labColors(theme).reason),
    fontSize: theme.font.size.sm,
  },
  // an upright plus with round ends, drawn (the display font's "+" leans and is tiny)
  plus: {
    width: "45%",
    height: "45%",
    stroke: theme.color.secondary.light,
    strokeWidth: 4,
    strokeLinecap: "round",
  },
  label: {
    ...bangers(theme),
    fontSize: theme.font.size.md,
    textAlign: "center",
    lineHeight: 1.1,
  },
}));

// One of the two equipment slots of a building: "+" when empty, the item when filled.
const EquipmentSlot = ({ index, item, inactive, onClick, disabled }) => {
  const classes = useStyles();
  const name = item ? itemName(item) : t(tr.LAB_SLOT_EMPTY);
  const label = inactive ? `${name} (${t(tr.LAB_OVER_BUDGET)})` : name;
  return (
    <button
      type="button"
      className={classes.slot}
      onClick={onClick}
      disabled={disabled}
      aria-label={`${t(tr.LAB_SLOT_LABEL, index + 1)}: ${label}`}
      data-testid={`equipment-slot-${index}`}
      data-item={item || ""}
      data-inactive={inactive ? "true" : "false"}
    >
      <span
        className={`${classes.ring} ${item ? classes.filled : ""} ${
          inactive ? classes.inactive : ""
        }`}
      >
        {item ? (
          <ItemIcon item={item} size="4.6em" />
        ) : (
          <svg className={classes.plus} viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3v18M3 12h18" />
          </svg>
        )}
      </span>
      <span className={classes.label}>{name}</span>
      {inactive ? (
        <span className={classes.warning}>{t(tr.LAB_OVER_BUDGET)}</span>
      ) : null}
    </button>
  );
};

export default EquipmentSlot;
