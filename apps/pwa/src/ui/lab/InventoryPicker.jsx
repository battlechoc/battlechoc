import React from "react";
import { createUseStyles } from "react-jss";
import {
  translate as t,
  translationKeys as tr,
  Items,
  LOADOUT_BUDGET,
} from "@battlechoc/battlechoc-shared-functions";
import Dialog from "../dialogs/Dialog";
import ItemIcon from "./ItemIcon";
import { effectLines, itemName, TIER_COLORS } from "./itemText";

const useStyles = createUseStyles((theme) => ({
  list: {
    width: "100%",
    maxHeight: "100%",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "0.8em",
    padding: "0 0.5em",
    boxSizing: "border-box",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: "1em",
    padding: "0.7em 0.9em",
    borderRadius: 14,
    background: "rgba(255, 255, 255, 0.14)",
  },
  current: { boxShadow: `inset 0 0 0 3px ${theme.color.gold.light}` },
  text: {
    flexGrow: 1,
    minWidth: 0,
    color: "white",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  name: { fontFamily: "var(--font-display)", fontSize: "1.3em", letterSpacing: "0.02em" },
  meta: { fontSize: "0.85em", opacity: 0.9 },
  good: { color: "#b9f27a", fontSize: "0.95em" },
  bad: { color: "#ffb3c4", fontSize: "0.95em" },
  reason: { fontSize: "0.85em", color: "#ffe08a" },
  action: {
    minWidth: 96,
    minHeight: 44,
    borderRadius: 22,
    border: "none",
    padding: "0 1.1em",
    fontFamily: "var(--font-display)",
    fontSize: "1.15em",
    color: "white",
    cursor: "pointer",
    background: `linear-gradient(0deg, ${theme.color.primary.dark}, ${theme.color.primary.light})`,
    "&:disabled": { background: "rgba(255,255,255,0.25)", cursor: "default" },
    "&:focus-visible": {
      outline: `3px solid ${theme.color.gold.light}`,
      outlineOffset: 2,
    },
  },
  remove: {
    background: `linear-gradient(0deg, ${theme.color.accent.dark}, ${theme.color.accent.light})`,
  },
  context: {
    margin: "0 0 0.2em",
    color: "white",
    textAlign: "center",
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: "1.05em",
    opacity: 0.9,
  },
  empty: {
    color: "white",
    textAlign: "center",
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: "1.1em",
  },
}));

/**
 * Picks the item for one slot: the player's items of this building, one row per item type
 * (with how many they have), with effect and trade-off; items that cannot go into the slot say why.
 */
const InventoryPicker = ({
  open,
  close,
  buildingName,
  entityType,
  slot,
  items,
  equipment,
  budgetUsed,
  onEquip,
  busy,
}) => {
  const classes = useStyles();
  const slots = equipment[entityType] || [];
  const currentId = slots[slot] || null;
  const currentKey = currentId
    ? (items.find((entry) => entry.id === currentId) || {}).item
    : undefined;
  const otherId = slots.find((id, i) => i !== slot && id);
  const otherKey = otherId
    ? (items.find((entry) => entry.id === otherId) || {}).item
    : undefined;
  const equippedIds = new Set(Object.values(equipment).flat().filter(Boolean));

  const types = [];
  items
    .filter(
      (entry) =>
        Items[entry.item] && Items[entry.item].entityType === entityType
    )
    .forEach((entry) => {
      let group = types.find((candidate) => candidate.item === entry.item);
      if (!group) {
        group = { item: entry.item, instances: [] };
        types.push(group);
      }
      group.instances.push(entry);
    });

  const freed = currentKey ? Items[currentKey].points : 0;
  return (
    <Dialog open={open} close={close} title={t(tr.LAB_EQUIPMENT)} closable>
      <div className={classes.list} data-testid="inventory">
        <p className={classes.context}>
          {`${buildingName} · ${t(tr.LAB_SLOT_LABEL, slot + 1)} · ${t(
            tr.LAB_BUDGET
          )} ${budgetUsed}/${LOADOUT_BUDGET}`}
        </p>
        {types.length === 0 ? (
          <p className={classes.empty}>{t(tr.LAB_NO_ITEMS)}</p>
        ) : null}
        {types.map(({ item, instances }) => {
          const definition = Items[item];
          const isCurrent = item === currentKey;
          // prefer an instance that is not equipped anywhere
          const free =
            instances.find((entry) => !equippedIds.has(entry.id)) ||
            instances[0];
          let reason;
          if (item === otherKey) {
            reason = t(tr.LAB_ALREADY_EQUIPPED);
          } else if (
            !isCurrent &&
            budgetUsed - freed + definition.points > LOADOUT_BUDGET &&
            budgetUsed - freed + definition.points > budgetUsed
          ) {
            reason = t(tr.LAB_OVER_BUDGET);
          }
          return (
            <div
              key={item}
              className={`${classes.row} ${isCurrent ? classes.current : ""}`}
              data-item={item}
            >
              <ItemIcon item={item} size="3.4em" />
              <div className={classes.text}>
                <div className={classes.name}>{itemName(item)}</div>
                <div className={classes.meta}>
                  {`${t(tr[TIER_COLORS[definition.tier].label])} · ${t(
                    tr.LAB_POINTS,
                    definition.points
                  )} · ×${instances.length}`}
                </div>
                {effectLines(item).map((line) => (
                  <div
                    key={line.text}
                    className={line.good ? classes.good : classes.bad}
                  >
                    {line.good ? "▲ " : "▼ "}
                    {line.text}
                  </div>
                ))}
                {reason ? <div className={classes.reason}>{reason}</div> : null}
              </div>
              <button
                type="button"
                className={classes.action}
                disabled={busy || isCurrent || Boolean(reason)}
                onClick={() => onEquip(free.id)}
              >
                {isCurrent ? t(tr.LAB_EQUIPPED) : t(tr.LAB_EQUIP_NOW)}
              </button>
            </div>
          );
        })}
        {currentId ? (
          <button
            type="button"
            className={`${classes.action} ${classes.remove}`}
            disabled={busy}
            onClick={() => onEquip(null)}
          >
            {t(tr.LAB_REMOVE)}
          </button>
        ) : null}
      </div>
    </Dialog>
  );
};

export default InventoryPicker;
