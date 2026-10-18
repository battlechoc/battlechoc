import React from "react";
import { createUseStyles } from "react-jss";
import {
  translate as t,
  translationKeys as tr,
  Ingredients,
} from "@battlechoc/battlechoc-shared-functions";
import IngredientIcon from "../ingredients/IngredientIcon";
import ItemIcon from "./ItemIcon";
import { effectLines, itemName } from "./itemText";

const useStyles = createUseStyles((theme) => ({
  // a chocolate bench: the lip with melting chocolate on top, three columns below
  table: {
    position: "relative",
    display: "flex",
    alignItems: "stretch",
    gap: "1.2em",
    padding: "2.6em 1.4em 1.1em",
    borderRadius: 16,
    background:
      "url(/images/lab/table-edge.svg) repeat-x left top / auto 2.2em, linear-gradient(180deg, #6e3d21 0%, #4a2611 100%)",
    boxShadow: "0 0.35em 0 #2e1608, inset 0 -0.25em 0 rgba(0, 0, 0, 0.2)",
    boxSizing: "border-box",
    color: "white",
    [theme.breakpoints.orientation.portrait]: {
      flexDirection: "column",
      gap: "0.8em",
      padding: "2.4em 1em 1em",
    },
  },
  shelf: {
    flex: "1 1 30%",
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "0.4em",
    [theme.breakpoints.orientation.portrait]: { order: 2 },
  },
  heading: {
    fontFamily: "var(--font-display)",
    fontSize: "1.1em",
    "-webkit-text-stroke": "0.04em #2e1608",
    letterSpacing: "0.03em",
  },
  jars: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.35em",
    overflowY: "auto",
    maxHeight: "9.5em",
    [theme.breakpoints.orientation.portrait]: {
      flexWrap: "nowrap",
      overflowX: "auto",
      overflowY: "hidden",
      maxHeight: "none",
    },
  },
  jar: {
    position: "relative",
    flexShrink: 0,
    width: "3.3em",
    height: "3.3em",
    minWidth: 48,
    minHeight: 48,
    borderRadius: 12,
    border: "none",
    background: "rgba(255, 246, 230, 0.16)",
    cursor: "pointer",
    "&:disabled": { opacity: 0.45, cursor: "default" },
    "&:hover:not(:disabled)": { background: "rgba(255, 246, 230, 0.3)" },
    "&:focus-visible": {
      outline: `3px solid ${theme.color.gold.light}`,
      outlineOffset: 2,
    },
  },
  count: {
    position: "absolute",
    right: 2,
    bottom: 0,
    fontFamily: "var(--font-display)",
    fontSize: "0.95em",
    color: "white",
    "-webkit-text-stroke": "0.05em #2e1608",
  },
  work: {
    flex: "1 1 36%",
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.6em",
  },
  result: {
    flex: "1 1 34%",
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    [theme.breakpoints.orientation.portrait]: { order: 1 },
  },
  // where the result of a try will appear
  placeholder: {
    width: "100%",
    maxWidth: "16em",
    minHeight: "5.2em",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    border: "0.15em dashed rgba(255, 246, 230, 0.35)",
    fontFamily: "var(--font-display)",
    fontSize: "1.1em",
    color: "rgba(255, 246, 230, 0.45)",
    "& > span": { fontSize: "2.4em", lineHeight: 1 },
    [theme.breakpoints.orientation.portrait]: { display: "none" },
  },
  bowls: {
    position: "relative",
    display: "flex",
    gap: "0.8em",
    alignItems: "flex-end",
  },
  bowl: {
    position: "relative",
    width: "5.4em",
    height: "3.8em",
    minWidth: 64,
    minHeight: 46,
    border: "none",
    padding: 0,
    background: "url(/images/lab/bowl.svg) no-repeat",
    backgroundSize: "100% 100%",
    cursor: "pointer",
    "&:disabled": { cursor: "default" },
    "&:focus-visible": {
      outline: `3px solid ${theme.color.gold.light}`,
      outlineOffset: 2,
      borderRadius: 12,
    },
    "& > img": {
      position: "absolute",
      left: "50%",
      top: "-18%",
      transform: "translateX(-50%)",
    },
  },
  // the special ingredient is not on the shelf: show it as a faded outline
  lacking: { "& > img": { opacity: 0.35, filter: "grayscale(1)" } },
  fixed: {
    position: "absolute",
    right: "-0.3em",
    top: "-0.5em",
    width: "1.5em",
    height: "1.5em",
    borderRadius: "50%",
    background: theme.color.secondary.dark,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    "& > span": {
      width: "70%",
      height: "70%",
      background: "url(/images/lock.svg) no-repeat",
      backgroundSize: "100% 100%",
    },
  },
  "@keyframes shake": {
    "0%, 100%": { transform: "translateX(0)" },
    "20%, 60%": { transform: "translateX(-0.4em)" },
    "40%, 80%": { transform: "translateX(0.4em)" },
  },
  shake: {
    animation: "$shake 0.45s ease-in-out",
    "@media (prefers-reduced-motion: reduce)": { animation: "none" },
  },
  "@keyframes rise": {
    "0%": { opacity: 0, transform: "translate(-50%, 0.6em)" },
    "30%": { opacity: 0.9 },
    "100%": { opacity: 0, transform: "translate(-50%, -1.6em)" },
  },
  steam: {
    position: "absolute",
    left: "50%",
    top: "-3.2em",
    width: "5em",
    height: "3.6em",
    background: "url(/images/lab/steam.svg) no-repeat",
    backgroundSize: "100% 100%",
    pointerEvents: "none",
    animation: "$rise 1.8s ease-out infinite",
    "@media (prefers-reduced-motion: reduce)": {
      animation: "none",
      opacity: 0.8,
      transform: "translateX(-50%)",
    },
  },
  message: {
    minHeight: "1.4em",
    textAlign: "center",
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: "1em",
    textShadow: "0 1px 2px rgba(0,0,0,0.6)",
  },
  card: {
    display: "flex",
    alignItems: "center",
    gap: "0.8em",
    padding: "0.5em 0.8em",
    borderRadius: 14,
    background: "rgba(255, 246, 230, 0.18)",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  cardName: { fontFamily: "var(--font-display)", fontSize: "1.2em" },
  costs: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5em",
    alignItems: "center",
    fontSize: "0.95em",
  },
  cost: { display: "inline-flex", alignItems: "center", gap: "0.15em" },
  missing: { color: "#ffb3c4", fontWeight: 700 },
  effects: {
    fontSize: "0.85em",
    display: "flex",
    flexWrap: "wrap",
    columnGap: "0.7em",
  },
  good: { color: "#c8f59a" },
  bad: { color: "#ffc2cf" },
  actions: { display: "flex", gap: "0.8em" },
  action: {
    minWidth: 110,
    minHeight: 46,
    borderRadius: 23,
    border: "none",
    padding: "0 1.2em",
    fontFamily: "var(--font-display)",
    fontSize: "1.3em",
    letterSpacing: "0.03em",
    color: "white",
    cursor: "pointer",
    boxShadow: "0 0.15em 0 rgba(0,0,0,0.3)",
    "&:disabled": {
      background: "rgba(255,255,255,0.22)",
      boxShadow: "none",
      cursor: "default",
      color: "rgba(255,255,255,0.75)",
    },
    "&:focus-visible": {
      outline: `3px solid ${theme.color.gold.light}`,
      outlineOffset: 2,
    },
  },
  try: {
    background: `linear-gradient(0deg, ${theme.color.secondary.dark}, ${theme.color.secondary.light})`,
  },
  craft: {
    background: `linear-gradient(0deg, ${theme.color.primary.dark}, ${theme.color.primary.light})`,
  },
}));

const RESULT_TEXT = {
  missing: "LAB_MISSING",
  smell: "LAB_RESULT_SMELL",
  nothing: "LAB_RESULT_NOTHING",
  limit: "LAB_TOO_MANY_TRIES",
  error: "LAB_FAILED",
};

/**
 * The lab table: the shelf with the player's ingredients, three bowls (the first holds the
 * building's special ingredient), the result of the last try, and the recipe the bowls hold.
 */
const LabTable = ({
  buildingName,
  bowls,
  pantry,
  onAdd,
  onClear,
  onTry,
  result,
  recipe,
  onCraft,
  crafted,
  onEquipCrafted,
  online,
  busy,
}) => {
  const classes = useStyles();
  const [special] = bowls;
  const full = bowls.every(Boolean);
  // trying needs the building's special ingredient on the shelf (it goes into the first bowl)
  const hasSpecial = (pantry[special] || 0) > 0;
  const specialName = t(tr[`INGREDIENT_${special}`]);
  const owned = Object.keys(Ingredients).filter((id) => (pantry[id] || 0) > 0);
  const missing = (ingredient, amount) => (pantry[ingredient] || 0) < amount;
  const cost = recipe
    ? { ...recipe.amounts, COCOA: (recipe.amounts.COCOA || 0) + recipe.fee }
    : {};
  const affordable = recipe
    ? Object.entries(cost).every(([id, amount]) => !missing(id, amount))
    : false;

  let message = "";
  if (!online) {
    message = t(tr.LAB_NEEDS_CONNECTION);
  } else if (!hasSpecial && !crafted) {
    message = t(tr.LAB_NEEDS_SPECIAL, specialName);
  } else if (crafted) {
    message = t(tr.LAB_CRAFTED);
  } else if (result && result.status === "found") {
    message = result.first
      ? `${t(tr.LAB_RESULT_FOUND)} ${t(tr.LAB_RESULT_FIRST)}`
      : t(tr.LAB_RESULT_FOUND);
  } else if (result && RESULT_TEXT[result.status]) {
    message = t(tr[RESULT_TEXT[result.status]]);
  } else if (recipe && !affordable) {
    message = t(tr.LAB_MISSING);
  } else if (!full) {
    message = t(tr.LAB_TABLE_HINT, specialName);
  }

  return (
    <div className={classes.table} data-testid="lab-table">
      <div className={classes.shelf}>
        <span className={classes.heading}>{t(tr.LAB_SHELF)}</span>
        <div className={classes.jars}>
          {owned.map((id) => (
            <button
              type="button"
              key={id}
              className={classes.jar}
              onClick={() => onAdd(id)}
              disabled={full || busy || !hasSpecial}
              aria-label={`${t(tr[`INGREDIENT_${id}`])} (${pantry[id]})`}
              data-ingredient={id}
            >
              <IngredientIcon id={id} size="2.4em" />
              <span className={classes.count}>{pantry[id]}</span>
            </button>
          ))}
        </div>
      </div>
      <div className={classes.work}>
        <div
          key={result ? result.seq : 0}
          className={`${classes.bowls} ${
            result && result.status === "nothing" ? classes.shake : ""
          }`}
          data-testid="bowls"
        >
          {result && result.status === "smell" ? (
            <span className={classes.steam} aria-hidden="true" />
          ) : null}
          {bowls.map((ingredient, index) => (
            <button
              type="button"
              key={index}
              className={`${classes.bowl} ${
                index === 0 && !hasSpecial ? classes.lacking : ""
              }`}
              disabled={index === 0 || !ingredient || busy}
              onClick={() => onClear(index)}
              aria-label={
                ingredient
                  ? `${t(tr.LAB_CLEAR)}: ${t(tr[`INGREDIENT_${ingredient}`])}`
                  : t(tr.LAB_EMPTY_BOWL)
              }
              data-ingredient={ingredient || ""}
              data-missing={index === 0 && !hasSpecial ? "true" : "false"}
            >
              {ingredient ? (
                <IngredientIcon id={ingredient} size="2.6em" />
              ) : null}
              {index === 0 ? (
                <span className={classes.fixed} aria-hidden="true">
                  <span />
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <div
          className={classes.message}
          role="status"
          aria-live="polite"
          data-testid="lab-message"
        >
          {message}
        </div>
        <div className={classes.actions}>
          {crafted ? (
            <button
              type="button"
              className={`${classes.action} ${classes.craft}`}
              onClick={onEquipCrafted}
            >
              {t(tr.LAB_EQUIP_NOW)}
            </button>
          ) : recipe ? (
            <button
              type="button"
              className={`${classes.action} ${classes.craft}`}
              onClick={onCraft}
              disabled={!online || busy || !affordable}
              data-testid="lab-craft"
            >
              {`${t(tr.LAB_CRAFT)} · ${recipe.fee}`}
            </button>
          ) : (
            <button
              type="button"
              className={`${classes.action} ${classes.try}`}
              onClick={onTry}
              disabled={!online || busy || !full || !hasSpecial}
              data-testid="lab-try"
              aria-label={`${t(tr.LAB_TRY)} (${buildingName})`}
            >
              {t(tr.LAB_TRY)}
            </button>
          )}
        </div>
      </div>
      <div className={classes.result}>
        {recipe ? (
          <div
            className={classes.card}
            data-testid="recipe-card"
            data-item={recipe.item}
          >
            <ItemIcon item={recipe.item} size="3em" />
            <div>
              <div className={classes.cardName}>{itemName(recipe.item)}</div>
              <div className={classes.costs}>
                {Object.entries(cost).map(([ingredient, amount]) => (
                  <span
                    key={ingredient}
                    className={`${classes.cost} ${
                      missing(ingredient, amount) ? classes.missing : ""
                    }`}
                  >
                    <IngredientIcon id={ingredient} size="1.4em" />
                    {`×${amount}`}
                  </span>
                ))}
              </div>
              <div className={classes.effects}>
                {effectLines(recipe.item).map((line) => (
                  <span
                    key={line.text}
                    className={line.good ? classes.good : classes.bad}
                  >
                    {line.good ? "▲ " : "▼ "}
                    {line.text}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className={classes.placeholder} aria-hidden="true">
            <span>?</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default LabTable;
