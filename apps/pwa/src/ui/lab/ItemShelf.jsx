import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createUseStyles } from "react-jss";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import DialogFrame from "../dialogs/DialogFrame";
import ItemIcon from "./ItemIcon";
import {
  groupMinted,
  scrollCue,
  shelfGroups,
  shelfView,
  shelfColumns,
  SHELF_GAP,
  SHELF_NAME,
  tileLabel,
} from "./itemActions";
import { itemName } from "./itemText";
import { features } from "../../cardano/appFeatures";
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
  // the tiles scroll in their own box (the hint stays below it): it shows whole rows and a third
  // of the next (shelfView, set once the tiles are measured; until then this maxHeight), its edge
  // fades where more tiles are, and its scrollbar shows
  tiles: {
    position: "relative",
    boxSizing: "border-box",
    display: "grid",
    // as wide as the longest word of an item name needs (SHELF_NAME), at most half the row
    gridTemplateColumns: shelfColumns(),
    gap: SHELF_GAP,
    maxHeight: "13.5em",
    overflowY: "auto",
    padding: "0.2em",
    scrollbarWidth: "thin",
    scrollbarColor: `${theme.color.secondary.light} transparent`,
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
  // breaks between words where the tile is wide enough for the longest one (SHELF_NAME); in a
  // tile of half a narrow phone's row, a long word hyphenates at its syllables (by the page's
  // language, <html lang>); only a browser without hyphenation for it breaks the word elsewhere
  // rather than letting it stick out of the tile
  name: {
    maxWidth: "100%",
    fontSize: `${SHELF_NAME.size}em`,
    fontWeight: "bold",
    lineHeight: 1.2,
    textAlign: "center",
    overflowWrap: "break-word",
    wordBreak: "normal",
    hyphens: "auto",
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

// the rows the shelf shows whole: two in portrait, one where height is short (landscape:
// desktops, phones held sideways), so the building above keeps its room
const ROWS = { portrait: 2, landscape: 1 };

// how far the edge fades out where more tiles are, until the tiles are measured
const FADE = "2.5em";

// the mask that fades the edges with more tiles beyond them (none when all fit)
const fadeMask = ({ above, below }, fade = FADE) => {
  if (above && below) {
    return `linear-gradient(to bottom, transparent, #000 ${fade}, #000 calc(100% - ${fade}), transparent)`;
  }
  if (below) {
    return `linear-gradient(to bottom, #000 calc(100% - ${fade}), transparent)`;
  }
  if (above) {
    return `linear-gradient(to top, #000 calc(100% - ${fade}), transparent)`;
  }
  return undefined;
};

const portrait = () => {
  try {
    return window.matchMedia("(orientation: portrait)").matches;
  } catch {
    return true;
  }
};

/**
 * The player's items, one tile per item type in the lab's building order: tapping one opens its
 * card (`onOpen(item, instanceId)` with the newest instance). `room()`: how much higher (or lower,
 * when negative) the tiles' box may be than now (the lab: a short portrait phone keeps its
 * building's room); `layout` changes when the lab's own parts may have changed height.
 */
const ItemShelf = ({ items, onOpen, room, layout }) => {
  const classes = useStyles();
  const groups = shelfGroups(items);
  const tiles = useRef(null);
  // how much of the tiles the box shows (null: every row; undefined: not measured yet)
  const [view, setView] = useState(undefined);
  // whether more tiles are above or below the box's view
  const [cue, setCue] = useState({ above: false, below: false });
  const measureCue = useCallback(() => {
    const box = tiles.current;
    if (!box) {
      return;
    }
    const next = scrollCue(box);
    setCue((current) =>
      current.above === next.above && current.below === next.below
        ? current
        : next
    );
  }, []);
  const measureRows = useCallback(() => {
    const box = tiles.current;
    if (!box) {
      return;
    }
    const next = shelfView(
      [...box.children].map((tile) => ({
        top: tile.offsetTop,
        height: tile.offsetHeight,
      })),
      {
        rows: portrait() ? ROWS.portrait : ROWS.landscape,
        limit: room ? box.offsetHeight + room() : Infinity,
      }
    );
    setView((current) =>
      current &&
      next &&
      current.maxHeight === next.maxHeight &&
      current.fade === next.fade
        ? current
        : next
    );
    measureCue();
  }, [measureCue, room]);
  useLayoutEffect(() => {
    measureRows();
    const box = tiles.current;
    window.addEventListener("resize", measureRows);
    const observer =
      box && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measureRows)
        : null;
    if (observer) {
      observer.observe(box);
    }
    return () => {
      window.removeEventListener("resize", measureRows);
      if (observer) {
        observer.disconnect();
      }
    };
  }, [measureRows, groups.length, layout]);
  // the cue once the box has its height
  useLayoutEffect(() => measureCue(), [measureCue, view]);
  const mask = fadeMask(cue, view ? `${view.fade}px` : undefined);
  const boxStyle = {};
  if (view !== undefined) {
    boxStyle.maxHeight = view ? view.maxHeight : "none";
  }
  if (mask) {
    boxStyle.maskImage = mask;
    boxStyle.WebkitMaskImage = mask;
  }
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
            <div
              className={classes.tiles}
              ref={tiles}
              onScroll={measureCue}
              style={boxStyle}
              data-more-above={cue.above ? "true" : "false"}
              data-more-below={cue.below ? "true" : "false"}
            >
              {groups.map(({ item, instances }) => {
                const [newest] = instances;
                const mark =
                  instances.length > 1
                    ? `× ${instances.length}`
                    : t(tr.ITEM_SERIAL, newest.serial);
                const minted = groupMinted(instances);
                return (
                  <button
                    type="button"
                    key={item}
                    className={classes.tile}
                    onClick={() => onOpen(item, newest.id)}
                    aria-label={tileLabel(
                      item,
                      instances,
                      Boolean(minted) && features.showMintMarks()
                    )}
                    data-testid="item-tile"
                    data-item={item}
                  >
                    {/* small: the stamp shows only as the icon's rim, and only when every
                        item of the type is minted (the card's chips tell them apart) */}
                    <ItemIcon
                      item={item}
                      size="3.2em"
                      minted={minted}
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
