import { createUseStyles } from "react-jss";
import { BUILDING_ICON, iconUrl } from "../../catalog";
import {
  Items,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import { features } from "../../cardano/appFeatures";
import {
  ICON_SHADOW,
  ITEM_ICON_SHEET,
  STAMP,
  TIER_COLORS,
  badgeOf,
  itemName,
} from "./itemText";

// a circle over the whole icon (the stamp's ring, the rim of an item that is gone)
const RIM = {
  position: "absolute",
  inset: 0,
  boxSizing: "border-box",
  borderRadius: "50%",
  pointerEvents: "none",
};

const useStyles = createUseStyles(ITEM_ICON_SHEET);

/**
 * An item: the picture of its building in a frame of its tier colour, with a badge for what it
 * does. A minted item (`minted`, the server's mark, in the state "minted") wears the stamp: a gold
 * double ring instead of the tier ring, in proportion to the icon's `size`, and, where it shows
 * `large` (the item card, the notices), a gold tag with its `serial` against the ring, below the badge
 * (the caller leaves STAMP.tagRoom(size) free under the icon). Not in the Android app
 * (features.showMintMarks). An item being minted (`minted.state` "minting") wears a dashed gold
 * rim that pulses, with the marks on too. `away`: an item that left the wallet: a dark face, a
 * light dashed rim, a grey picture and no badge. Any other state shows the plain item.
 */
const ItemIcon = ({
  item,
  size = "3.2em",
  minted = null,
  serial,
  large = false,
  away = false,
}) => {
  const classes = useStyles();
  const definition = Items[item];
  const tier = TIER_COLORS[definition.tier];
  const marks = !away && Boolean(minted) && features.showMintMarks();
  const stamped = marks && minted.state === "minted";
  const minting = marks && minted.state === "minting";
  const name = itemName(item);
  const label = stamped ? t(tr.ITEM_MINTED_LABEL, name, serial) : name;
  // the stamp's ring (which carries the drop shadow) and the dashed rim replace the tier ring
  let shadow = `inset 0 0 0 0.18em ${tier.ring}, ${ICON_SHADOW}`;
  if (stamped) {
    shadow = "none";
  } else if (away) {
    shadow = ICON_SHADOW;
  }
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      style={{
        position: "relative",
        display: "inline-block",
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
        background: away
          ? STAMP.away.face
          : `radial-gradient(circle at 35% 30%, #ffffff 0%, ${tier.fill} 70%)`,
        boxShadow: shadow,
      }}
    >
      <img
        src={iconUrl(BUILDING_ICON[definition.entityType])}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          inset: "12%",
          width: "76%",
          height: "76%",
          filter: away ? STAMP.away.picture : undefined,
        }}
      />
      {stamped ? (
        <span
          data-testid="item-stamp"
          style={{ ...RIM, ...STAMP.ring(size) }}
        />
      ) : null}
      {minting ? (
        <span
          data-testid="item-minting"
          className={classes.minting}
          style={{
            ...RIM,
            inset: STAMP.minting.inset(size),
            border: STAMP.minting.rim(size),
          }}
        />
      ) : null}
      {away ? (
        <span style={{ ...RIM, border: STAMP.away.rim(size) }} />
      ) : (
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
      )}
      {stamped && large ? (
        <span
          data-testid="item-serial-tag"
          style={{
            position: "absolute",
            fontFamily: "var(--font-display)",
            whiteSpace: "nowrap",
            ...STAMP.tag(size),
          }}
        >
          {t(tr.ITEM_SERIAL, serial)}
        </span>
      ) : null}
    </span>
  );
};

export default ItemIcon;
