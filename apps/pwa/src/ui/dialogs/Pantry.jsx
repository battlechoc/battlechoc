import React from "react";
import {
  translate as t,
  translationKeys as tr,
  Ingredients,
} from "@battlechoc/battlechoc-shared-functions";
import Dialog from "./Dialog";
import IngredientBag from "../ingredients/IngredientBag";
import IngredientIcon from "../ingredients/IngredientIcon";

// "3 d", "5 h" or "40 min" until a batch spoils
const formatDuration = (ms) => {
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes >= 48 * 60) {
    return `${Math.floor(minutes / (24 * 60))} d`;
  }
  if (minutes >= 120) {
    return `${Math.floor(minutes / 60)} h`;
  }
  return `${minutes} min`;
};

// Every ingredient there is (the ones the player has none of greyed out), and when the
// spoiling ones go off.
const Pantry = ({ open, close, pantry = {}, spoiling = [] }) => {
  const items = Object.keys(Ingredients).map((ingredient) => ({ ingredient, amount: pantry[ingredient] || 0 }));
  const empty = items.every((item) => item.amount === 0);
  return (
    <Dialog open={open} close={close} title={t(tr.PANTRY_TITLE)} icon="ingredients/cocoa">
      <div data-testid="pantry" style={{ minWidth: "50vw" }}>
        <IngredientBag
          items={items}
          showSources={false}
          message={empty ? t(tr.PANTRY_EMPTY) : undefined}
        />
        {spoiling.length > 0 ? (
          <ul style={{ listStyle: "none", padding: 0, marginTop: "1.5em" }}>
            {spoiling.map((batch, index) => (
              <li
                key={index}
                style={{ display: "flex", alignItems: "center", gap: "0.5em", justifyContent: "center" }}
              >
                <IngredientIcon id={batch.ingredient} size="1.6em" />
                <span>{`×${batch.amount}`}</span>
                <span>{t(tr.PANTRY_SPOILS_IN, formatDuration(batch.expiresAt - Date.now()))}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Dialog>
  );
};

export default Pantry;
