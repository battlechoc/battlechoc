import { createUseStyles } from "react-jss";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import DialogFrame from "../dialogs/DialogFrame";
import ItemIcon from "./ItemIcon";
import { shelfGroups } from "./itemActions";
import { itemName } from "./itemText";
import { gamePanel, rise } from "../styles";

const useStyles = createUseStyles((theme) => ({
  // the panel of the lab table (LabTable.jsx), with the chocolate pieces in its corners
  panel: {
    position: "relative",
    isolation: "isolate",
    overflow: "hidden",
    borderRadius: 20,
    background: rise(theme.color.secondary),
    boxShadow: "0 0.3em 0.9em rgba(0, 0, 0, 0.3)",
    color: "white",
  },
  frameTop: { "&&": { width: "22em", height: "4.6em" } },
  frameLeft: { "&&": { width: "5em", height: "6em" } },
  frameRight: { "&&": { width: "8em", height: "6em" } },
  content: {
    ...gamePanel(theme),
    position: "relative",
    zIndex: 13,
    display: "flex",
    flexDirection: "column",
    gap: "0.6em",
    margin: "1em 1.4em",
    padding: "0.7em",
    [theme.breakpoints.orientation.portrait]: { margin: "0.9em" },
  },
  tiles: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(6.4em, 1fr))",
    gap: "0.6em",
    maxHeight: "13.5em",
    overflowY: "auto",
    padding: "0.2em",
  },
  // like the jars of the lab table's shelf, a little larger: the icon, the name, how many or which
  tile: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.35em",
    minHeight: 48,
    padding: "0.5em 0.3em",
    borderRadius: "0.7em",
    border: `0.12em solid ${theme.color.secondary.light}`,
    background: rise(theme.color.secondary, "70%"),
    color: "white",
    font: "inherit",
    cursor: "pointer",
    "&:hover": { background: rise(theme.color.secondary, "120%") },
    "&:focus-visible": {
      outline: `3px solid ${theme.color.gold.light}`,
      outlineOffset: 2,
    },
  },
  name: {
    fontSize: theme.font.size.sm,
    fontWeight: "bold",
    lineHeight: 1.2,
    textAlign: "center",
    overflowWrap: "anywhere",
  },
  mark: {
    fontSize: theme.font.size.xs,
    fontWeight: 600,
    opacity: 0.85,
  },
  hint: {
    margin: 0,
    fontSize: theme.font.size.sm,
    textAlign: "center",
  },
  empty: { margin: "0.6em 0", textAlign: "center" },
}));

/**
 * The player's items, one tile per item type in the lab's building order: tapping one opens its
 * card (`onOpen(item, instanceId)` with the newest instance).
 */
const ItemShelf = ({ items, onOpen }) => {
  const classes = useStyles();
  const groups = shelfGroups(items);
  return (
    <div className={classes.panel} data-testid="item-shelf">
      <DialogFrame
        classes={{
          top: classes.frameTop,
          left: classes.frameLeft,
          right: classes.frameRight,
        }}
      />
      <div className={classes.content}>
        {groups.length === 0 ? (
          <p className={classes.empty}>{t(tr.ITEM_SHELF_EMPTY)}</p>
        ) : (
          <>
            <div className={classes.tiles}>
              {groups.map(({ item, instances }) => {
                const [newest] = instances;
                const mark =
                  instances.length > 1
                    ? `× ${instances.length}`
                    : t(tr.ITEM_SERIAL, newest.serial);
                return (
                  <button
                    type="button"
                    key={item}
                    className={classes.tile}
                    onClick={() => onOpen(item, newest.id)}
                    aria-label={`${itemName(item)} (${mark})`}
                    data-testid="item-tile"
                    data-item={item}
                  >
                    {/* small: the stamp shows only as the icon's rim */}
                    <ItemIcon
                      item={item}
                      size="3.2em"
                      minted={Boolean(newest.minted)}
                      serial={newest.serial}
                    />
                    <span className={classes.name}>{itemName(item)}</span>
                    <span className={classes.mark}>{mark}</span>
                  </button>
                );
              })}
            </div>
            <p className={classes.hint}>{t(tr.ITEM_SHELF_HINT)}</p>
          </>
        )}
      </div>
    </div>
  );
};

export default ItemShelf;
