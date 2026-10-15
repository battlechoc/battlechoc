import React, { useCallback, useEffect, useMemo, useState } from "react";
import { connect } from "react-redux";
import { createUseStyles } from "react-jss";
import {
  Items,
  SpecialIngredient,
  loadoutPoints,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import { ChoclabPalette } from "../controls";
import MeshPreview from "../../3d/MeshPreview";
import { updatePlayerStats } from "../UiActions";
import { ServerRequest } from "../../helper/settings";
import logger from "../../helper/logger";
import OfflineStore from "../../OfflineStore";
import IngredientIcon from "../ingredients/IngredientIcon";
import Pantry from "../dialogs/Pantry";
import EquipmentSlot from "./EquipmentSlot";
import BudgetBar from "./BudgetBar";
import LabTable from "./LabTable";
import InventoryPicker from "./InventoryPicker";
import RecipeBook from "./RecipeBook";
import { effectLines } from "./itemText";

// the buildings that can be equipped, in the order of the carousel
const BUILDINGS = Object.keys(SpecialIngredient).filter((type) =>
  Object.values(Items).some((item) => item.entityType === type)
);

const useStyles = createUseStyles((theme) => ({
  page: {
    position: "absolute",
    inset: 0,
    zIndex: 2,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    color: "white",
    background:
      "linear-gradient(180deg, #9DD5E9 0%, #3DA2CE 60%, #1B4E69 100%)",
    fontSize: "calc(0.9vh + 0.75vw)",
    [theme.breakpoints.orientation.portrait]: {
      fontSize: "calc(1.1vh + 1.1vw)",
    },
  },
  decorationLeft: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "40%",
    height: 90,
    background: "url(/images/choclab-decoration-left.svg) no-repeat",
    backgroundSize: "auto 100%",
    pointerEvents: "none",
  },
  decorationRight: {
    position: "absolute",
    top: 0,
    right: 0,
    width: "30%",
    height: 140,
    background: "url(/images/choclab-decoration-right.svg) no-repeat right top",
    backgroundSize: "auto 100%",
    pointerEvents: "none",
  },
  topbar: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: "0.8em",
    padding: "0.6em 0.8em 0",
  },
  roundButton: {
    display: "flex",
    alignItems: "center",
    gap: "0.3em",
    minHeight: 48,
    minWidth: 48,
    padding: "0.2em 0.7em",
    borderRadius: 28,
    border: `3px solid ${theme.color.secondary.dark}`,
    background: "linear-gradient(0deg, #3DA2CE 0%, #9DD5E9 80%)",
    fontFamily: "Bangers",
    fontSize: "1.5em",
    color: "white",
    "-webkit-text-stroke": `0.04em ${theme.color.secondary.dark}`,
    cursor: "pointer",
    "&:focus-visible": {
      outline: `3px solid ${theme.color.gold.light}`,
      outlineOffset: 2,
    },
  },
  bookIcon: {
    width: "1.6em",
    height: "1.6em",
    background: "url(/images/lab/recipe-book.svg) no-repeat",
    backgroundSize: "100% 100%",
  },
  // the building with its two equipment slots beside it; the preview takes the height that is left
  stage: {
    flex: "1 1 auto",
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.35em",
    padding: "0 1em 0.6em",
  },
  building: {
    flex: "1 1 0",
    minHeight: "6em",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "1.5em",
    // portrait: the building across the full width, the two slots side by side below it
    [theme.breakpoints.orientation.portrait]: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gridTemplateRows: "minmax(0, 1fr) auto",
      justifyItems: "center",
      gap: "0.3em 1em",
    },
  },
  preview: {
    position: "relative",
    alignSelf: "stretch",
    flex: "0 1 24vw",
    minWidth: 0,
    "& > canvas": {
      position: "absolute",
      inset: 0,
      width: "100% !important",
      height: "100% !important",
      outline: "none",
    },
    [theme.breakpoints.orientation.portrait]: {
      gridColumn: "1 / -1",
      gridRow: 1,
      width: "100%",
    },
  },
  palette: {
    "& > div:first-child, & > div:last-child": {
      height: "6vh",
      width: "6vh",
      borderWidth: "0.5vh",
    },
  },
  name: {
    fontFamily: "Bangers",
    fontSize: "1.9em",
    letterSpacing: "0.03em",
    "-webkit-text-stroke": `0.05em ${theme.color.secondary.dark}`,
  },
  effects: {
    minHeight: "1.3em",
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: "0.95em",
    textAlign: "center",
    textShadow: "0 1px 2px rgba(0,0,0,0.5)",
    "& > span": { margin: "0 0.35em", whiteSpace: "nowrap" },
  },
  good: { color: "#e8ffd0" },
  bad: { color: "#ffd6df" },
  table: { flex: "0 0 auto", margin: "0 1em 0.8em" },
}));

const persist = (changes) =>
  OfflineStore.playerStore
    .get("stats")
    .then((stats) =>
      OfflineStore.playerStore.set("stats", { ...(stats || {}), ...changes })
    )
    .catch((error) => logger.warn("could not cache the lab state", error));

// removes one occurrence of `value`
const without = (list, value) => {
  const index = list.indexOf(value);
  return index < 0 ? list : [...list.slice(0, index), ...list.slice(index + 1)];
};

const sameIngredients = (a, b) => [...a].sort().join() === [...b].sort().join();

/**
 * The lab: pick a building, equip its two slots from the inventory within the shared budget,
 * and discover and craft items on the lab table.
 */
const Lab = ({ stats, liveStatus, updateStats }) => {
  const classes = useStyles();
  const [entityType, setEntityType] = useState(BUILDINGS[0]);
  const [picked, setPicked] = useState([null, null]);
  const [result, setResult] = useState(undefined);
  const [book, setBook] = useState(undefined);
  const [pickerSlot, setPickerSlot] = useState(undefined);
  const [bookOpen, setBookOpen] = useState(false);
  const [pantryOpen, setPantryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [crafted, setCrafted] = useState(undefined);

  const online =
    typeof navigator === "undefined" || navigator.onLine
      ? liveStatus === "online"
      : false;
  const pantry = stats.pantry || {};
  const items = stats.items || [];
  const equipment = stats.equipment || {};
  const loadout = stats.loadout || {};
  const special = SpecialIngredient[entityType];
  const bowls = [special, ...picked];
  const buildingName = (type) => t(tr.TOOLTIP_BUILDING_TITLE, type);
  const selected = useMemo(() => ({ type: entityType }), [entityType]);

  const loadBook = useCallback(() => {
    if (!online) {
      return;
    }
    ServerRequest("get", "/lab/recipes")
      .then((response) => setBook(response.data))
      .catch((error) => logger.info("recipe book not available", error));
  }, [online]);
  useEffect(() => loadBook(), [loadBook]);

  // the recipe the bowls hold, once it is known (discovered by anyone)
  const recipe = useMemo(() => {
    if (!bowls.every(Boolean)) {
      return undefined;
    }
    const known = ((book && book.recipes) || []).find(
      (entry) =>
        entry.entityType === entityType &&
        sameIngredients(entry.ingredients, bowls)
    );
    return (
      known || (result && result.status === "found" ? result.recipe : undefined)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, entityType, picked, result]);

  const selectBuilding = (type) => {
    setEntityType(type);
    setPicked([null, null]);
    setResult(undefined);
    setCrafted(undefined);
  };

  const addIngredient = (id) => {
    setResult(undefined);
    setCrafted(undefined);
    setPicked((current) => {
      const next = [...current];
      const free = next.indexOf(null);
      if (free >= 0) {
        next[free] = id;
      }
      return next;
    });
  };

  const clearBowl = (index) => {
    setResult(undefined);
    setCrafted(undefined);
    setPicked((current) =>
      current.map((value, i) => (i === index - 1 ? null : value))
    );
  };

  const tryBowls = () => {
    setBusy(true);
    setCrafted(undefined);
    ServerRequest("post", "/lab/try", { entityType, ingredients: picked })
      .then((response) => {
        setResult({
          ...response.data,
          status: response.data.result,
          seq: Date.now(),
        });
        if (response.data.result === "found") {
          loadBook();
        }
      })
      .catch((error) => {
        const status = error.response && error.response.status;
        setResult({
          status: status === 429 ? "limit" : "error",
          seq: Date.now(),
        });
      })
      .finally(() => setBusy(false));
  };

  const craft = () => {
    setBusy(true);
    ServerRequest("post", "/lab/craft", { item: recipe.item })
      .then((response) => {
        const changes = {
          pantry: response.data.pantry,
          spoiling: response.data.spoiling,
          coins: response.data.pantry.COCOA || 0,
          items: [response.data.item, ...items],
        };
        updateStats(changes);
        persist(changes);
        setResult(undefined);
        setCrafted(response.data.item);
      })
      .catch((error) => {
        logger.warn("crafting failed", error);
        setResult({ status: "error", seq: Date.now() });
      })
      .finally(() => setBusy(false));
  };

  const equip = (itemId) => {
    const slot = pickerSlot;
    setBusy(true);
    ServerRequest("post", "/user/equipment", { entityType, slot, itemId })
      .then((response) => {
        const changes = {
          equipment: response.data.equipment,
          loadout: response.data.loadout,
        };
        updateStats(changes);
        persist(changes);
        setPickerSlot(undefined);
      })
      .catch((error) => {
        logger.warn("equipping failed", error);
        setResult({ status: "error", seq: Date.now() });
      })
      .finally(() => setBusy(false));
  };

  // after crafting, offer the free slot of the item's building (or the first one)
  const equipCrafted = () => {
    const slots = equipment[entityType] || [];
    const free = [0, 1].find((i) => !slots[i]);
    setCrafted(undefined);
    setPickerSlot(typeof free === "number" ? free : 0);
  };

  const useRecipe = (entry) => {
    setBookOpen(false);
    setEntityType(entry.entityType);
    setPicked(without(entry.ingredients, SpecialIngredient[entry.entityType]));
    setResult(undefined);
    setCrafted(undefined);
  };

  const slotItem = (index) => {
    const id = (equipment[entityType] || [])[index];
    const entry = id
      ? items.find((candidate) => candidate.id === id)
      : undefined;
    return entry ? entry.item : undefined;
  };
  const equippedKeys = loadout[entityType] || [];

  return (
    <div className={classes.page} data-testid="lab">
      <div className={classes.decorationLeft} />
      <div className={classes.decorationRight} />
      <div className={classes.topbar}>
        <button
          type="button"
          className={classes.roundButton}
          onClick={() => setPantryOpen(true)}
          aria-label={t(tr.PANTRY_TITLE)}
          data-testid="pantry-button"
        >
          <span>{pantry.COCOA || 0}</span>
          <IngredientIcon id="COCOA" size="1.6em" />
        </button>
        <button
          type="button"
          className={classes.roundButton}
          onClick={() => {
            loadBook();
            setBookOpen(true);
          }}
          aria-label={t(tr.LAB_RECIPE_BOOK)}
          data-testid="recipe-book-button"
        >
          <span className={classes.bookIcon} />
        </button>
      </div>

      <div className={classes.stage}>
        <div className={classes.building}>
          <EquipmentSlot
            index={0}
            item={slotItem(0)}
            onClick={() => setPickerSlot(0)}
            disabled={!online}
          />
          <div className={classes.preview}>
            <MeshPreview selectedEntity={selected} />
          </div>
          <EquipmentSlot
            index={1}
            item={slotItem(1)}
            onClick={() => setPickerSlot(1)}
            disabled={!online}
          />
        </div>
        <ChoclabPalette
          className={classes.palette}
          selectEntity={selectBuilding}
          selected={entityType}
        />
        <div className={classes.name} data-testid="lab-building">
          {buildingName(entityType)}
        </div>
        <div className={classes.effects} data-testid="lab-effects">
          {equippedKeys.flatMap((key) =>
            effectLines(key).map((line) => (
              <span
                key={`${key}-${line.text}`}
                className={line.good ? classes.good : classes.bad}
              >
                {line.good ? "▲ " : "▼ "}
                {line.text}
              </span>
            ))
          )}
        </div>
        <BudgetBar used={loadoutPoints(loadout)} />
      </div>

      <div className={classes.table}>
        <LabTable
          buildingName={buildingName(entityType)}
          bowls={bowls}
          pantry={pantry}
          onAdd={addIngredient}
          onClear={clearBowl}
          onTry={tryBowls}
          result={result}
          recipe={recipe}
          onCraft={craft}
          crafted={crafted}
          onEquipCrafted={equipCrafted}
          online={online}
          busy={busy}
        />
      </div>

      <InventoryPicker
        open={typeof pickerSlot === "number"}
        close={() => setPickerSlot(undefined)}
        buildingName={buildingName(entityType)}
        entityType={entityType}
        slot={pickerSlot || 0}
        items={items}
        equipment={equipment}
        budgetUsed={loadoutPoints(loadout)}
        onEquip={equip}
        busy={busy}
      />
      <RecipeBook
        open={bookOpen}
        close={() => setBookOpen(false)}
        book={book}
        buildings={BUILDINGS}
        buildingName={buildingName}
        onUse={useRecipe}
      />
      <Pantry
        open={pantryOpen}
        close={() => setPantryOpen(false)}
        pantry={pantry}
        spoiling={stats.spoiling || []}
      />
    </div>
  );
};

const mapStateToProps = (state) => ({
  stats: state.ui.playerInfos.stats,
  liveStatus: state.live.status,
});

const mapDispatchToProps = { updateStats: updatePlayerStats };

export { BUILDINGS };
export default connect(mapStateToProps, mapDispatchToProps)(Lab);
