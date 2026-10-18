import React from "react";
import { createUseStyles } from "react-jss";
import {
  translate as t,
  translationKeys as tr,
  Items,
  LOADOUT_BUDGET,
} from "@battlechoc/battlechoc-shared-functions";
import Dialog from "../dialogs/Dialog";
import Button from "../controls/Button";
import ItemIcon from "./ItemIcon";
import {
  BUILDING_ICON,
  bangers,
  effectLines,
  gamePanel,
  itemName,
  labColors,
  TIER_COLORS,
} from "./itemText";

const useStyles = createUseStyles((theme) => {
  const colors = labColors(theme);
  return {
    list: {
      width: "100%",
      maxHeight: "100%",
      overflowY: "auto",
      display: "flex",
      flexDirection: "column",
      alignItems: "stretch",
      gap: "0.5em",
      padding: "0 0.5em 0.5em",
      boxSizing: "border-box",
    },
    row: {
      ...gamePanel(theme),
      display: "flex",
      alignItems: "center",
      gap: "1em",
      padding: "0.6em 0.9em",
      textAlign: "left",
      [theme.breakpoints.orientation.portrait]: {
        flexWrap: "wrap",
        justifyContent: "center",
      },
    },
    current: { borderColor: theme.color.gold.light },
    text: {
      flexGrow: 1,
      minWidth: 0,
      color: "white",
    },
    name: {
      ...bangers(theme, theme.color.gold.light),
      fontSize: theme.font.size.lg,
    },
    meta: { fontSize: theme.font.size.sm },
    good: {
      color: colors.good,
      fontWeight: "bold",
      fontSize: theme.font.size.sm,
    },
    bad: {
      color: colors.bad,
      fontWeight: "bold",
      fontSize: theme.font.size.sm,
    },
    reason: {
      color: colors.reason,
      fontWeight: "bold",
      fontSize: theme.font.size.sm,
    },
    remove: { alignSelf: "center", marginTop: "0.3em" },
    empty: { color: "white", textAlign: "center" },
    // the context line below the title
    subtitle: {
      display: "block",
      textAlign: "center",
    },
  };
});

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
    <Dialog
      open={open}
      close={close}
      title={t(tr.LAB_EQUIPMENT)}
      icon={`${BUILDING_ICON[entityType]}-icon`}
      subtitle={
        <span className={classes.subtitle} data-testid="inventory-context">
          {`${buildingName} · ${t(tr.LAB_SLOT_LABEL, slot + 1)} · ${t(
            tr.LAB_BUDGET
          )} ${budgetUsed}/${LOADOUT_BUDGET}`}
        </span>
      }
      closable
    >
      <div className={classes.list} data-testid="inventory">
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
              <Button
                size="small"
                color="primary"
                disabled={busy || isCurrent || Boolean(reason)}
                onClick={() => onEquip(free.id)}
              >
                {isCurrent ? t(tr.LAB_EQUIPPED) : t(tr.LAB_EQUIP_NOW)}
              </Button>
            </div>
          );
        })}
        {currentId ? (
          <Button
            size="small"
            color="accent"
            className={classes.remove}
            disabled={busy}
            onClick={() => onEquip(null)}
          >
            {t(tr.LAB_REMOVE)}
          </Button>
        ) : null}
      </div>
    </Dialog>
  );
};

export default InventoryPicker;
