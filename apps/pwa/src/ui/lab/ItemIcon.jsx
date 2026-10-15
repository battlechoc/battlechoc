import React from "react";
import { Items } from "@battlechoc/battlechoc-shared-functions";
import { BUILDING_ICON, TIER_COLORS, badgeOf, itemName } from "./itemText";

// An item: the picture of its building in a frame of its tier colour, with a badge for what it does.
const ItemIcon = ({ item, size = "3.2em" }) => {
  const definition = Items[item];
  const tier = TIER_COLORS[definition.tier];
  return (
    <span
      role="img"
      aria-label={itemName(item)}
      title={itemName(item)}
      style={{
        position: "relative",
        display: "inline-block",
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
        background: `radial-gradient(circle at 35% 30%, #ffffff 0%, ${tier.fill} 70%)`,
        boxShadow: `inset 0 0 0 0.18em ${tier.ring}, 0 0.1em 0.25em rgba(0, 0, 0, 0.35)`,
      }}
    >
      <img
        src={`/images/${BUILDING_ICON[definition.entityType]}-icon.svg`}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          inset: "12%",
          width: "76%",
          height: "76%",
        }}
      />
      <img
        src={badgeOf(item)}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          right: "-6%",
          bottom: "-6%",
          width: "42%",
          height: "42%",
        }}
      />
    </span>
  );
};

export default ItemIcon;
