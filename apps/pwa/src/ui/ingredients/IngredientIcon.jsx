import React from "react";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";

// The picture of an ingredient (public/images/ingredients/<id>.svg) with its name as alt text.
const IngredientIcon = ({ id, size = "2em", style }) => {
  const name = t(tr[`INGREDIENT_${id}`]);
  return (
    <img
      src={`/images/ingredients/${id.toLowerCase()}.svg`}
      alt={name}
      title={name}
      style={{ width: size, height: size, ...style }}
      draggable={false}
    />
  );
};

export default IngredientIcon;
