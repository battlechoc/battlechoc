import React from "react";
import { createUseStyles } from "react-jss";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import ItemIcon from "./ItemIcon";
import { itemName } from "./itemText";

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
    border: "0.2em dashed rgba(255, 255, 255, 0.85)",
    background: "rgba(27, 78, 105, 0.35)",
    fontSize: "1em",
    transition: "transform 0.15s",
    "button:hover:not(:disabled) > &": { transform: "scale(1.06)" },
    "@media (prefers-reduced-motion: reduce)": { transition: "none" },
  },
  filled: { border: "none", background: "none" },
  plus: { fontFamily: "Bangers", fontSize: "2.4em", lineHeight: 1 },
  label: {
    fontFamily: "Bangers",
    fontSize: "1.05em",
    textAlign: "center",
    lineHeight: 1.1,
    "-webkit-text-stroke": `0.04em ${theme.color.secondary.dark}`,
  },
}));

// One of the two equipment slots of a building: "+" when empty, the item when filled.
const EquipmentSlot = ({ index, item, onClick, disabled }) => {
  const classes = useStyles();
  const label = item ? itemName(item) : t(tr.LAB_SLOT_EMPTY);
  return (
    <button
      type="button"
      className={classes.slot}
      onClick={onClick}
      disabled={disabled}
      aria-label={`${t(tr.LAB_SLOT_LABEL, index + 1)}: ${label}`}
      data-testid={`equipment-slot-${index}`}
      data-item={item || ""}
    >
      <span className={`${classes.ring} ${item ? classes.filled : ""}`}>
        {item ? (
          <ItemIcon item={item} size="4.6em" />
        ) : (
          <span className={classes.plus}>+</span>
        )}
      </span>
      <span className={classes.label}>{label}</span>
    </button>
  );
};

export default EquipmentSlot;
