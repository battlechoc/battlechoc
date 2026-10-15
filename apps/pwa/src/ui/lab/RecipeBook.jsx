import React from "react";
import { createUseStyles } from "react-jss";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import Dialog from "../dialogs/Dialog";
import ItemIcon from "./ItemIcon";
import IngredientIcon from "../ingredients/IngredientIcon";
import { BUILDING_ICON, effectLines, itemName } from "./itemText";

const useStyles = createUseStyles((theme) => ({
  book: {
    width: "100%",
    maxHeight: "100%",
    overflowY: "auto",
    color: "white",
    fontFamily: "system-ui, -apple-system, sans-serif",
    padding: "0 0.5em",
    boxSizing: "border-box",
    textAlign: "left",
  },
  building: {
    display: "flex",
    alignItems: "center",
    gap: "0.6em",
    margin: "1em 0 0.4em",
  },
  buildingName: { fontFamily: "Bangers", fontSize: "1.4em" },
  recipe: {
    display: "flex",
    alignItems: "center",
    gap: "1em",
    padding: "0.6em 0.9em",
    borderRadius: 14,
    background: "rgba(255, 255, 255, 0.14)",
    marginBottom: "0.5em",
  },
  text: { flexGrow: 1, minWidth: 0 },
  name: { fontFamily: "Bangers", fontSize: "1.25em" },
  ingredients: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.6em",
    alignItems: "center",
    margin: "0.3em 0",
  },
  amount: { display: "inline-flex", alignItems: "center", gap: "0.2em" },
  small: { fontSize: "0.85em", opacity: 0.9 },
  hint: { opacity: 0.8, fontStyle: "italic", margin: "0.2em 0 0.6em" },
  use: {
    minWidth: 88,
    minHeight: 44,
    borderRadius: 22,
    border: "none",
    fontFamily: "Bangers",
    fontSize: "1.1em",
    color: "white",
    cursor: "pointer",
    background: `linear-gradient(0deg, ${theme.color.secondary.dark}, ${theme.color.secondary.light})`,
    "&:focus-visible": {
      outline: `3px solid ${theme.color.gold.light}`,
      outlineOffset: 2,
    },
  },
  empty: { textAlign: "center", fontSize: "1.1em" },
}));

// Every discovered recipe, by building, with its discoverer; "use" puts it on the lab table.
const RecipeBook = ({ open, close, book, buildings, buildingName, onUse }) => {
  const classes = useStyles();
  const recipes = (book && book.recipes) || [];
  const undiscovered = (book && book.undiscovered) || {};
  return (
    <Dialog open={open} close={close} title={t(tr.LAB_RECIPE_BOOK)} closable>
      <div className={classes.book} data-testid="recipe-book">
        {recipes.length === 0 ? (
          <p className={classes.empty}>{t(tr.LAB_NO_RECIPES)}</p>
        ) : null}
        {buildings.map((entityType) => {
          const own = recipes.filter(
            (recipe) => recipe.entityType === entityType
          );
          const missing = undiscovered[entityType] || 0;
          if (own.length === 0 && missing === 0) {
            return null;
          }
          return (
            <section key={entityType}>
              <div className={classes.building}>
                <img
                  src={`/images/${BUILDING_ICON[entityType]}-icon.svg`}
                  alt=""
                  style={{ width: "2.2em", height: "2.2em" }}
                />
                <span className={classes.buildingName}>
                  {buildingName(entityType)}
                </span>
              </div>
              {own.map((recipe) => (
                <div
                  key={recipe.item}
                  className={classes.recipe}
                  data-item={recipe.item}
                >
                  <ItemIcon item={recipe.item} size="3em" />
                  <div className={classes.text}>
                    <div className={classes.name}>{itemName(recipe.item)}</div>
                    <div className={classes.ingredients}>
                      {Object.entries(recipe.amounts).map(
                        ([ingredient, amount]) => (
                          <span key={ingredient} className={classes.amount}>
                            <IngredientIcon id={ingredient} size="1.6em" />
                            {`×${amount}`}
                          </span>
                        )
                      )}
                      <span className={classes.amount}>
                        {"+ "}
                        <IngredientIcon id="COCOA" size="1.6em" />
                        {recipe.fee}
                      </span>
                    </div>
                    <div className={classes.small}>
                      {effectLines(recipe.item)
                        .map((line) => line.text)
                        .join(" · ")}
                    </div>
                    <div className={classes.small}>
                      {t(tr.LAB_DISCOVERED_BY, recipe.discoveredBy)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={classes.use}
                    onClick={() => onUse(recipe)}
                  >
                    {t(tr.LAB_CRAFT)}
                  </button>
                </div>
              ))}
              {missing > 0 ? (
                <p className={classes.hint}>
                  {t(tr.LAB_UNDISCOVERED, missing)}
                </p>
              ) : null}
            </section>
          );
        })}
      </div>
    </Dialog>
  );
};

export default RecipeBook;
