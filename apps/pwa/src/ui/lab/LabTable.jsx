import React from "react";
import { createUseStyles } from "react-jss";
import {
  translate as t,
  translationKeys as tr,
  Ingredients,
} from "@battlechoc/battlechoc-shared-functions";
import IngredientIcon from "../ingredients/IngredientIcon";
import Button from "../controls/Button";
import DialogFrame from "../dialogs/DialogFrame";
import ItemIcon from "./ItemIcon";
import {
  bangers,
  effectLines,
  gamePanel,
  itemName,
  labColors,
} from "./itemText";

const useStyles = createUseStyles((theme) => {
  const colors = labColors(theme);
  return {
    // a blue game panel like the dialogs, with the chocolate pieces in its corners
    table: {
      position: "relative",
      // its own stacking context: the frame and columns stay below the dialogs of the lab
      isolation: "isolate",
      overflow: "hidden",
      borderRadius: 20,
      background: `linear-gradient(0deg, ${theme.color.secondary.dark} 0%, ${theme.color.secondary.light} 100%)`,
      boxShadow: "0 0.3em 0.9em rgba(0, 0, 0, 0.3)",
      color: "white",
    },
    // the chocolate pieces of the dialogs, scaled down to the bench
    frameTop: { "&&": { width: "22em", height: "4.6em" } },
    frameLeft: { "&&": { width: "5em", height: "6em" } },
    frameRight: { "&&": { width: "8em", height: "6em" } },
    columns: {
      position: "relative",
      zIndex: 13,
      display: "flex",
      alignItems: "stretch",
      gap: "1em",
      padding: "1em 1.4em",
      boxSizing: "border-box",
      [theme.breakpoints.orientation.portrait]: {
        flexDirection: "column",
        gap: "0.7em",
        padding: "0.9em",
      },
    },
    shelf: {
      ...gamePanel(theme),
      flex: "1 1 30%",
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      gap: "0.4em",
      padding: "0.5em 0.7em 0.7em",
      [theme.breakpoints.orientation.portrait]: { order: 2 },
    },
    heading: {
      ...bangers(theme, theme.color.gold.light),
      fontSize: theme.font.size.lg,
    },
    jars: {
      display: "flex",
      flexWrap: "wrap",
      gap: "0.4em",
      overflowY: "auto",
      maxHeight: "9.5em",
      padding: "0.2em",
      [theme.breakpoints.orientation.portrait]: {
        flexWrap: "nowrap",
        overflowX: "auto",
        overflowY: "hidden",
        maxHeight: "none",
      },
    },
    // like the game's icon buttons: blue gradient with a light rim
    jar: {
      position: "relative",
      flexShrink: 0,
      width: "3.3em",
      height: "3.3em",
      minWidth: 48,
      minHeight: 48,
      padding: 0,
      borderRadius: "12.5%",
      border: `0.12em solid ${theme.color.secondary.light}`,
      background: `linear-gradient(0deg, ${theme.color.secondary.dark} 0%, ${theme.color.secondary.light} 70%)`,
      cursor: "pointer",
      "&:disabled": { filter: "grayscale(1)", cursor: "default" },
      "&:hover:not(:disabled)": {
        background: `linear-gradient(0deg, ${theme.color.secondary.dark} 0%, ${theme.color.secondary.light} 120%)`,
      },
      "&:focus-visible": {
        outline: `3px solid ${theme.color.gold.light}`,
        outlineOffset: 2,
      },
    },
    count: {
      ...bangers(theme),
      position: "absolute",
      right: "0.15em",
      bottom: "-0.05em",
      fontSize: theme.font.size.sm,
    },
    work: {
      flex: "1 1 36%",
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "0.5em",
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
      ...gamePanel(theme),
      width: "100%",
      maxWidth: "16em",
      minHeight: "5.2em",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      "& > span": {
        ...bangers(theme, theme.color.secondary.light),
        // a glyph filling the placeholder (in em of the lab's text)
        fontSize: "2.6em",
        lineHeight: 1,
      },
      [theme.breakpoints.orientation.portrait]: { display: "none" },
    },
    bowls: {
      ...gamePanel(theme),
      position: "relative",
      display: "flex",
      gap: "0.8em",
      alignItems: "flex-end",
      padding: "1em 1em 0.4em",
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
    // the special ingredient is not on the shelf: show it greyed out
    lacking: { "& > img": { opacity: 0.35, filter: "grayscale(1)" } },
    fixed: {
      position: "absolute",
      right: "-0.3em",
      top: "-0.5em",
      width: "1.5em",
      height: "1.5em",
      boxSizing: "border-box",
      borderRadius: "50%",
      background: theme.color.secondary.dark,
      border: `0.1em solid ${theme.color.secondary.light}`,
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
      top: "-2.6em",
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
      lineHeight: 1.3,
    },
    card: {
      ...gamePanel(theme),
      display: "flex",
      alignItems: "center",
      gap: "0.8em",
      padding: "0.6em 0.9em",
    },
    cardName: {
      ...bangers(theme, theme.color.gold.light),
      fontSize: theme.font.size.lg,
    },
    costs: {
      display: "flex",
      flexWrap: "wrap",
      gap: "0.5em",
      alignItems: "center",
      margin: "0.15em 0",
    },
    cost: {
      ...bangers(theme),
      display: "inline-flex",
      alignItems: "center",
      gap: "0.15em",
    },
    missing: { color: colors.bad },
    effects: {
      fontSize: theme.font.size.sm,
      fontWeight: "bold",
      display: "flex",
      flexWrap: "wrap",
      columnGap: "0.7em",
    },
    good: { color: colors.good },
    bad: { color: colors.bad },
    actions: { display: "flex", gap: "0.8em" },
    // what the button costs, inside it (like the old upgrade button)
    actionLabel: {
      display: "inline-flex",
      alignItems: "center",
      gap: "0.25em",
      whiteSpace: "nowrap",
    },
  };
});

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

  let action;
  if (crafted) {
    action = (
      <Button
        size="small"
        color="primary"
        onClick={onEquipCrafted}
        data-testid="lab-equip"
      >
        {t(tr.LAB_EQUIP_NOW)}
      </Button>
    );
  } else if (recipe) {
    action = (
      <Button
        size="small"
        color="primary"
        onClick={onCraft}
        disabled={!online || busy || !affordable}
        data-testid="lab-craft"
        aria-label={`${t(tr.LAB_CRAFT)} (${cost.COCOA})`}
      >
        <span className={classes.actionLabel}>
          {t(tr.LAB_CRAFT)}
          <IngredientIcon id="COCOA" size="1.1em" />
          <span className={missing("COCOA", cost.COCOA) ? classes.missing : ""}>
            {cost.COCOA}
          </span>
        </span>
      </Button>
    );
  } else {
    action = (
      <Button
        size="small"
        color="secondary"
        onClick={onTry}
        disabled={!online || busy || !full || !hasSpecial}
        data-testid="lab-try"
        aria-label={`${t(tr.LAB_TRY)} (${buildingName})`}
      >
        {t(tr.LAB_TRY)}
      </Button>
    );
  }

  return (
    <div className={classes.table} data-testid="lab-table">
      <DialogFrame
        classes={{
          top: classes.frameTop,
          left: classes.frameLeft,
          right: classes.frameRight,
        }}
      />
      <div className={classes.columns}>
        <div className={classes.shelf} data-testid="lab-shelf">
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
          <div className={classes.actions}>{action}</div>
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
                      <IngredientIcon id={ingredient} size="1.3em" />
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
    </div>
  );
};

export default LabTable;
