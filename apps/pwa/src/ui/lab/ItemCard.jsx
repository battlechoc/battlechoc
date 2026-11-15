import { useState } from "react";
import { createUseStyles } from "react-jss";
import {
  Items,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import { salvageItem } from "../../api/lab";
import logger from "../../helper/logger";
import Dialog from "../dialogs/Dialog";
import Button from "../controls/Button";
import IngredientIcon from "../ingredients/IngredientIcon";
import ItemIcon from "./ItemIcon";
import { features } from "../../cardano/appFeatures";
import { cardActions, chipMarks, salvagePreview, slotOf } from "./itemActions";
import {
  effectLines,
  itemName,
  labColors,
  STAMP,
  TIER_COLORS,
} from "./itemText";
import { bangers, gamePanel } from "../styles";

const useStyles = createUseStyles((theme) => {
  const colors = labColors(theme);
  return {
    card: {
      width: "100%",
      maxWidth: "26em",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "0.6em",
      padding: "0 0.5em 0.8em",
      boxSizing: "border-box",
    },
    // the confirmation and what came back, in place of the card's details
    view: {
      width: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "0.6em",
    },
    // the free room below the icon for the stamp's serial tag (from the icon's bottom: the
    // negative margin takes back the card's gap)
    stampRoom: { height: STAMP.tagRoom(ICON_SIZE), marginTop: "-0.6em" },
    meta: { fontWeight: 600 },
    effects: {
      display: "flex",
      flexDirection: "column",
      gap: "0.15em",
      fontWeight: "bold",
    },
    good: { color: colors.good },
    bad: { color: colors.bad },
    instances: {
      display: "flex",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: "0.4em",
    },
    // one of several items of the type, by its serial number
    chip: {
      display: "inline-flex",
      alignItems: "center",
      minHeight: 40,
      padding: "0.2em 0.8em",
      borderRadius: 999,
      border: `0.12em solid ${theme.color.secondary.light}`,
      background: theme.color.secondary.dark,
      color: "white",
      font: "inherit",
      fontSize: theme.font.size.sm,
      fontWeight: "bold",
      cursor: "pointer",
      "&:focus-visible": {
        outline: `3px solid ${theme.color.gold.light}`,
        outlineOffset: 2,
      },
    },
    chosen: {
      borderColor: theme.color.gold.light,
      color: theme.color.gold.light,
    },
    // a minted one: a small gold coin before its number (the chosen look stays the strongest)
    chipDot: { display: "inline-block", ...STAMP.chipDot },
    equipped: { ...bangers(theme, colors.reason) },
    actions: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "0.6em",
      marginTop: "0.3em",
    },
    note: { margin: 0, fontSize: theme.font.size.sm, lineHeight: 1.35 },
    reason: {
      margin: 0,
      color: colors.reason,
      fontWeight: "bold",
      fontSize: theme.font.size.sm,
    },
    error: { color: colors.bad, fontWeight: "bold" },
    // what comes back: one row per ingredient
    rows: {
      ...gamePanel(theme),
      alignSelf: "stretch",
      display: "flex",
      flexDirection: "column",
      gap: "0.4em",
      padding: "0.6em 0.9em",
      textAlign: "left",
    },
    row: {
      display: "flex",
      alignItems: "center",
      gap: "0.5em",
      fontWeight: "bold",
    },
    rowName: { flexGrow: 1 },
    half: { fontWeight: 600, opacity: 0.8 },
    amount: { ...bangers(theme), fontSize: theme.font.size.lg },
    done: {
      ...bangers(theme, theme.color.gold.light),
      fontSize: theme.font.size.lg,
    },
  };
});

// the card's icon: large, with the stamp's serial tag below it
const ICON_SIZE = "6em";

const SALVAGE_ERRORS = {
  "NOT YOUR ITEM": "SALVAGE_GONE",
  "NO RECIPE": "SALVAGE_NO_RECIPE",
};

const ingredientName = (id) => t(tr[`INGREDIENT_${id}`]);

// a slot of the plan that adds minting: an element, or a function of the chosen item
const slotFor = (slot, selected) =>
  typeof slot === "function" ? slot(selected) : slot || null;

/**
 * The card of an item type from the shelf: what it is and does, which of the player's items of
 * the type it shows (`instances`, the one with `instanceId` selected), and what can be done with
 * that one: equip or take it off (`onEquip(entry)` with the chosen item), mint it and salvage it
 * after a confirmation. `mintAction` (under Equip) and `mintStatus` (the item's mark, under its
 * effects) are minting's slots: an element, or a function of the chosen item (null for none).
 */
const ItemCard = ({
  open,
  close,
  item,
  instanceId,
  instances,
  equipment,
  book,
  online,
  busy,
  buildingName,
  onEquip,
  onTakeOff,
  onSalvaged,
  onGone,
  mintAction,
  mintStatus,
}) => {
  const classes = useStyles();
  const [selectedId, setSelectedId] = useState(instanceId);
  // "card", "confirm" (what salvaging gives back) or "done" (what came back)
  const [view, setView] = useState("card");
  const [returned, setReturned] = useState(undefined);
  const [error, setError] = useState(undefined);
  const [salvaging, setSalvaging] = useState(false);

  const definition = Items[item];
  const selected = instances.find((entry) => entry.id === selectedId);
  const slot = selected ? slotOf(selected.id, equipment) : null;
  const preview = salvagePreview(item, book);
  const actions = selected ? cardActions({ item: selected, online }) : {};
  // the stamp's marks (not in the Android app)
  const marks = features.showMintMarks();

  const select = (id) => {
    setSelectedId(id);
    setView("card");
    setError(undefined);
  };

  const takeOff = () => {
    setError(undefined);
    onTakeOff(slot).then((done) => {
      if (!done) {
        setError("LAB_FAILED");
      }
    });
  };

  const salvage = () => {
    const itemId = selected.id;
    setSalvaging(true);
    setError(undefined);
    // two handlers: a failure is the server's answer, never one of updating the stats
    salvageItem(itemId)
      .then(
        (answer) => {
          setReturned(answer.returned);
          setView("done");
          onSalvaged(answer, itemId);
        },
        (failure) => {
          const reason =
            failure.response &&
            failure.response.data &&
            failure.response.data.error;
          logger.warn("salvaging failed", failure);
          setError(SALVAGE_ERRORS[reason] || "LAB_FAILED");
          setView("card");
          if (reason === "NOT YOUR ITEM") {
            // salvaged elsewhere: show what the server has now
            onGone();
          }
        }
      )
      .finally(() => setSalvaging(false));
  };

  const rowsOf = (entries, half) =>
    entries.length === 0 ? (
      <p className={classes.note}>{t(tr.SALVAGE_NOTHING_BACK)}</p>
    ) : (
      <div className={classes.rows}>
        {entries.map(({ ingredient, amount }) => (
          <div
            key={ingredient}
            className={classes.row}
            data-testid="salvage-row"
            data-ingredient={ingredient}
            data-amount={amount}
          >
            <IngredientIcon id={ingredient} size="1.6em" />
            <span className={classes.rowName}>
              {ingredientName(ingredient)}
              {half ? (
                <span className={classes.half}>{` ${t(tr.SALVAGE_HALF)}`}</span>
              ) : null}
            </span>
            <span className={classes.amount}>
              {half ? amount : `+${amount}`}
            </span>
          </div>
        ))}
      </div>
    );

  let content;
  if (view === "done") {
    const entries = Object.entries(returned || {})
      .filter(([, amount]) => amount > 0)
      .map(([ingredient, amount]) => ({ ingredient, amount }));
    content = (
      <div className={classes.view} data-testid="salvage-done">
        <div className={classes.done}>{t(tr.SALVAGE_DONE)}</div>
        {rowsOf(entries, false)}
        <div className={classes.actions}>
          <Button
            color="primary"
            onClick={close}
            data-testid="salvage-done-button"
          >
            {t(tr.SALVAGE_DONE_BUTTON)}
          </Button>
        </div>
      </div>
    );
  } else if (view === "confirm" && selected && preview.rows) {
    content = (
      <div className={classes.view} data-testid="salvage-confirm">
        <p className={classes.note}>{t(tr.SALVAGE_INTRO)}</p>
        {rowsOf(preview.rows, true)}
        <p className={classes.note}>{t(tr.SALVAGE_FEE_KEPT)}</p>
        {slot ? (
          <p className={classes.reason}>
            {t(tr.SALVAGE_UNEQUIPS, buildingName(slot.entityType))}
          </p>
        ) : null}
        <div className={classes.actions}>
          <Button
            color="accent"
            onClick={salvage}
            disabled={salvaging}
            data-testid="salvage-confirm-button"
          >
            {t(tr.SALVAGE_CONFIRM)}
          </Button>
          <Button
            color="secondary"
            onClick={() => setView("card")}
            disabled={salvaging}
            data-testid="salvage-cancel"
          >
            {t(tr.SALVAGE_CANCEL)}
          </Button>
        </div>
      </div>
    );
  } else {
    // why a button is grey: offline (equip and salvage need the server), or no salvage preview
    let note;
    if (!online) {
      note = t(tr.LAB_NEEDS_CONNECTION);
    } else if (actions.salvage && preview.unavailable === "no-recipe") {
      note = t(tr.SALVAGE_NO_RECIPE);
    } else if (actions.salvage && preview.unavailable === "no-book") {
      note = t(tr.LAB_NEEDS_CONNECTION);
    }
    content = (
      <>
        {selected ? (
          <>
            <ItemIcon
              item={item}
              size={ICON_SIZE}
              large
              minted={selected.minted}
              serial={selected.serial}
            />
            <div className={classes.stampRoom} aria-hidden="true" />
            <div className={classes.meta}>
              {`${t(tr[TIER_COLORS[definition.tier].label])} · ${t(
                tr.LAB_POINTS,
                definition.points
              )} · ${t(tr.ITEM_SERIAL, selected.serial)}`}
            </div>
            <div className={classes.effects}>
              {effectLines(item).map((line) => (
                <span
                  key={line.text}
                  className={line.good ? classes.good : classes.bad}
                >
                  {line.good ? "▲ " : "▼ "}
                  {line.text}
                </span>
              ))}
            </div>
            {slotFor(mintStatus, selected)}
          </>
        ) : null}
        {instances.length > 1 || (!selected && instances.length > 0) ? (
          <div className={classes.instances}>
            {instances.map((entry) => {
              const look = chipMarks(entry, selectedId, marks);
              return (
                <button
                  type="button"
                  key={entry.id}
                  className={`${classes.chip} ${
                    look.chosen ? classes.chosen : ""
                  }`}
                  aria-pressed={look.chosen}
                  aria-label={
                    look.minted
                      ? t(tr.ITEM_MINTED_LABEL, itemName(item), entry.serial)
                      : undefined
                  }
                  onClick={() => select(entry.id)}
                  data-testid="item-instance"
                  data-serial={entry.serial}
                  data-minted={look.minted ? "true" : "false"}
                >
                  {look.minted ? (
                    <span className={classes.chipDot} aria-hidden="true" />
                  ) : null}
                  {t(tr.ITEM_SERIAL, entry.serial)}
                </button>
              );
            })}
          </div>
        ) : null}
        {slot ? (
          <div className={classes.equipped} data-testid="item-equipped">
            {t(tr.ITEM_EQUIPPED_ON, buildingName(slot.entityType))}
          </div>
        ) : null}
        {selected ? (
          <div className={classes.actions}>
            {slot ? (
              <Button
                color="secondary"
                onClick={takeOff}
                disabled={!actions.equip || busy}
                data-testid="item-remove"
              >
                {t(tr.LAB_REMOVE)}
              </Button>
            ) : (
              <Button
                color="primary"
                onClick={() => onEquip(selected)}
                disabled={!actions.equip || busy}
                data-testid="item-equip"
              >
                {t(tr.ITEM_EQUIP)}
              </Button>
            )}
            {slotFor(mintAction, selected)}
            {actions.salvage ? (
              <Button
                color="accent"
                onClick={() => {
                  setError(undefined);
                  setView("confirm");
                }}
                disabled={busy || Boolean(preview.unavailable)}
                data-testid="item-salvage"
              >
                {t(tr.ITEM_SALVAGE)}
              </Button>
            ) : null}
            {note ? <div className={classes.reason}>{note}</div> : null}
          </div>
        ) : null}
        {error ? (
          <div
            className={classes.error}
            role="alert"
            data-testid="salvage-error"
          >
            {t(tr[error])}
          </div>
        ) : null}
      </>
    );
  }

  return (
    <Dialog
      open={open}
      close={close}
      title={
        view === "confirm" && selected
          ? t(tr.SALVAGE_TITLE, itemName(item), selected.serial)
          : itemName(item)
      }
    >
      <div className={classes.card} data-testid="item-card">
        {content}
      </div>
    </Dialog>
  );
};

export default ItemCard;
