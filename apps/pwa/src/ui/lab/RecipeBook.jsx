import React from "react";
import { createUseStyles } from "react-jss";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import Dialog from "../dialogs/Dialog";
import ItemIcon from "./ItemIcon";
import IngredientIcon from "../ingredients/IngredientIcon";
import Button from "../controls/Button";
import {
  BUILDING_ICON,
  bangers,
  effectLines,
  gamePanel,
  itemName,
  labColors,
} from "./itemText";

const useStyles = createUseStyles((theme) => ({
  book: {
    width: "100%",
    maxHeight: "100%",
    overflowY: "auto",
    color: "white",
    padding: "0 0.5em 0.5em",
    boxSizing: "border-box",
    textAlign: "left",
  },
  building: {
    display: "flex",
    alignItems: "center",
    gap: "0.6em",
    margin: "0.8em 0 0.4em",
  },
  buildingName: {
    ...bangers(theme, theme.color.gold.light),
    fontSize: theme.font.size.lg,
  },
  recipe: {
    ...gamePanel(theme),
    display: "flex",
    alignItems: "center",
    gap: "1em",
    padding: "0.6em 0.9em",
    marginBottom: "0.5em",
    [theme.breakpoints.orientation.portrait]: {
      flexWrap: "wrap",
      justifyContent: "center",
    },
  },
  text: { flexGrow: 1, minWidth: 0 },
  name: { ...bangers(theme), fontSize: theme.font.size.md },
  ingredients: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.6em",
    alignItems: "center",
    margin: "0.3em 0",
  },
  amount: {
    ...bangers(theme),
    display: "inline-flex",
    alignItems: "center",
    gap: "0.2em",
  },
  small: { fontSize: theme.font.size.sm },
  hint: { ...bangers(theme, labColors(theme).reason), margin: "0.2em 0 0.6em" },
  empty: { textAlign: "center" },
}));

// Every discovered recipe, by building, with its discoverer; "use" puts it on the lab table.
const RecipeBook = ({ open, close, book, buildings, buildingName, onUse }) => {
  const classes = useStyles();
  const recipes = (book && book.recipes) || [];
  const undiscovered = (book && book.undiscovered) || {};
  return (
    <Dialog
      open={open}
      close={close}
      title={t(tr.LAB_RECIPE_BOOK)}
      icon="lab/recipe-book"
      closable
    >
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
                  <Button
                    size="small"
                    color="secondary"
                    onClick={() => onUse(recipe)}
                  >
                    {t(tr.LAB_CRAFT)}
                  </Button>
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
