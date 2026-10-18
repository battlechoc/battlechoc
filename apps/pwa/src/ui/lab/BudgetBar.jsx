import React from "react";
import { createUseStyles } from "react-jss";
import {
  translate as t,
  translationKeys as tr,
  LOADOUT_BUDGET,
} from "@battlechoc/battlechoc-shared-functions";

const useStyles = createUseStyles((theme) => ({
  bar: { display: "flex", alignItems: "center", gap: "0.6em" },
  label: {
    fontFamily: "var(--font-display)",
    fontSize: "1.05em",
    "-webkit-text-stroke": `0.04em ${theme.color.secondary.dark}`,
    whiteSpace: "nowrap",
  },
  cells: { display: "flex", gap: "0.18em" },
  cell: {
    width: "1.1em",
    height: "0.9em",
    borderRadius: "0.2em",
    background: "rgba(255, 255, 255, 0.3)",
    border: `0.12em solid ${theme.color.secondary.dark}`,
    transition: "background 0.3s",
  },
  used: { background: theme.color.gold.light },
}));

// How much of the shared loadout budget the equipped items use.
const BudgetBar = ({ used }) => {
  const classes = useStyles();
  return (
    <div
      className={classes.bar}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={LOADOUT_BUDGET}
      aria-valuenow={used}
      aria-label={t(tr.LAB_BUDGET)}
      data-testid="budget"
      data-used={used}
    >
      <span className={classes.label}>{`${t(
        tr.LAB_BUDGET
      )} ${used}/${LOADOUT_BUDGET}`}</span>
      <span className={classes.cells}>
        {Array.from({ length: LOADOUT_BUDGET }, (_, i) => (
          <span
            key={i}
            className={`${classes.cell} ${i < used ? classes.used : ""}`}
          />
        ))}
      </span>
    </div>
  );
};

export default BudgetBar;
