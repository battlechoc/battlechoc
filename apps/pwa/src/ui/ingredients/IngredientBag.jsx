import React from "react";
import { createUseStyles } from "react-jss";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import IngredientIcon from "./IngredientIcon";

const useStyles = createUseStyles((theme) => ({
  bag: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.6em",
    justifyContent: "center",
    alignItems: "flex-start",
  },
  greyed: { filter: "grayscale(100%) opacity(50%)" },
  item: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    minWidth: "4.5em",
    fontFamily: "var(--font-display)",
    color: "white",
    "-webkit-text-stroke": `1px ${theme.color.secondary.dark}`,
    "& small": { fontSize: "0.7em", opacity: 0.9, textAlign: "center" },
  },
  message: {
    textAlign: "center",
    color: "white",
    maxWidth: "24em",
    margin: "0.5em auto 0",
  },
}));

// sums the amounts per ingredient (for totals without their sources)
const merge = (items) => {
  const byIngredient = new Map();
  items.forEach(({ ingredient, amount }) =>
    byIngredient.set(ingredient, (byIngredient.get(ingredient) || 0) + amount)
  );
  return [...byIngredient].map(([ingredient, amount]) => ({ ingredient, amount }));
};

// Ingredients as icons with amounts, optionally with the achievement each one came from.
const IngredientBag = ({ items = [], greyed = false, message, showSources = true }) => {
  const classes = useStyles();
  const shown = showSources ? items : merge(items);
  return (
    <div data-testid="ingredient-bag">
      <div className={`${classes.bag} ${greyed ? classes.greyed : ""}`}>
        {shown.map((item, index) => (
          <div
            key={index}
            className={`${classes.item} ${item.amount === 0 && !greyed ? classes.greyed : ""}`}
            data-ingredient={item.ingredient}
          >
            <IngredientIcon id={item.ingredient} size="2.2em" />
            <span>{`×${item.amount}`}</span>
            {showSources && item.achievement ? (
              <small>{t(tr.END_BAG_FROM, t(tr[`AWARDS_${item.achievement}_TITLE`]))}</small>
            ) : null}
          </div>
        ))}
      </div>
      {message ? <p className={classes.message}>{message}</p> : null}
    </div>
  );
};

export default IngredientBag;
