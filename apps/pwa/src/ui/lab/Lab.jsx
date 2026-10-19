import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { connect } from "react-redux";
import { createUseStyles } from "react-jss";
import {
  Items,
  SpecialIngredient,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import { ChoclabPalette, Fab } from "../controls";
import MeshPreview from "../../3d/MeshPreview";
import { updatePlayerStats } from "../UiActions";
import { ServerRequest } from "../../helper/settings";
import logger from "../../helper/logger";
import OfflineStore from "../../OfflineStore";
import { Jukebox } from "../misc";
import IngredientIcon from "../ingredients/IngredientIcon";
import Pantry from "../dialogs/Pantry";
import EquipmentSlot from "./EquipmentSlot";
import BudgetBar from "./BudgetBar";
import LabTable from "./LabTable";
import InventoryPicker from "./InventoryPicker";
import RecipeBook from "./RecipeBook";
import LabIntro, { LAB_INTRO_SEEN, LAB_INTRO_STEPS, Spotlight } from "./LabIntro";
import { bangers, effectLines, labColors } from "./itemText";

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
    // the sky of the menus (the body gradient)
    background: `linear-gradient(0deg, ${theme.color.sky.dark} 0%, ${theme.color.sky.light} 80%)`,
    // the lab's parts size themselves in em of this
    fontSize: theme.font.size.md,
    // phones held sideways: too little height for everything, the page scrolls
    [theme.breakpoints.shortLandscape]: { overflowY: "auto" },
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
  // like the title screen: the cocoa count (it opens the pantry) and the recipe book
  topbar: {
    position: "relative",
    zIndex: 1,
    alignSelf: "flex-end",
    display: "flex",
    alignItems: "center",
    gap: "1.5vw",
    margin: "5px 5px 0",
  },
  cocoa: {
    display: "flex",
    alignItems: "center",
    gap: "0.2em",
    padding: "0 0.2em",
    borderRadius: 12,
    cursor: "pointer",
    outline: "none",
    fontFamily: theme.font.display,
    fontSize: theme.font.size.xl,
    color: "white",
    "-webkit-text-stroke": `${theme.font.stroke} ${theme.color.secondary.dark}`,
    "-webkit-font-smoothing": "antialiased",
    "&:focus-visible": {
      outline: `0.3vw solid ${theme.color.gold.light}`,
    },
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
    [theme.breakpoints.shortLandscape]: { flex: "0 0 auto" },
  },
  building: {
    flex: "1 1 0",
    minHeight: "6em",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "1.5em",
    // landscape: only as wide as the slots and the building
    [theme.breakpoints.orientation.landscape]: {
      width: "auto",
      padding: "0 0.5em",
    },
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
    [theme.breakpoints.orientation.landscape]: { width: "24vw" },
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
    fontFamily: theme.font.display,
    fontSize: theme.font.size.xl,
    letterSpacing: "0.03em",
    "-webkit-text-stroke": `${theme.font.stroke} ${theme.color.secondary.dark}`,
  },
  effects: {
    minHeight: "1.3em",
    ...bangers(theme),
    fontSize: theme.font.size.md,
    textAlign: "center",
    "& > span": { margin: "0 0.35em", whiteSpace: "nowrap" },
  },
  good: { color: labColors(theme).good },
  bad: { color: labColors(theme).bad },
  table: { flex: "0 0 auto", margin: "0 1em 0.8em", borderRadius: 20 },
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
  // the step of the first-visit intro, undefined when it is not shown
  const [introStep, setIntroStep] = useState(undefined);

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

  // the intro on the first visit (per device)
  useEffect(() => {
    let active = true;
    OfflineStore.settingsStore
      .get(LAB_INTRO_SEEN)
      .then((seen) => {
        if (active && !seen) {
          setIntroStep(0);
        }
      })
      .catch((error) => logger.info("could not read the lab intro flag", error));
    return () => {
      active = false;
    };
  }, []);

  const endIntro = () => {
    setIntroStep(undefined);
    OfflineStore.settingsStore
      .set(LAB_INTRO_SEEN, true)
      .catch((error) => logger.info("could not store the lab intro flag", error));
  };
  const introTarget =
    typeof introStep === "number" ? LAB_INTRO_STEPS[introStep].target : null;
  // the parts of the lab the intro can light up, and the page they sit in
  const page = useRef();
  const parts = useRef({});
  const part = (name) => (element) => {
    parts.current[name] = element;
  };

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
        const reason =
          error.response && error.response.data && error.response.data.error;
        let kind = "error";
        if (status === 429) {
          kind = "limit";
        } else if (reason === "MISSING INGREDIENTS") {
          // the pantry changed elsewhere (spoiled, used on another device): show what is there now
          kind = "missing";
          refreshStats();
        }
        setResult({
          status: kind,
          seq: Date.now(),
        });
      })
      .finally(() => setBusy(false));
  };

  // reloads what the server knows about the player's pantry and items
  const refreshStats = () =>
    ServerRequest("get", "/user")
      .then((response) => {
        const {
          pantry: fresh,
          spoiling,
          items: owned,
          equipment: equipped,
          loadout: active,
        } = response.data.stats;
        const changes = {
          pantry: fresh,
          spoiling,
          coins: (fresh && fresh.COCOA) || 0,
          items: owned,
          equipment: equipped,
          loadout: active,
        };
        updateStats(changes);
        persist(changes);
      })
      .catch((error) => logger.info("could not reload the stats", error));

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

  const openPantry = () => {
    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
    setPantryOpen(true);
  };

  const slotItem = (index) => {
    const id = (equipment[entityType] || [])[index];
    const entry = id
      ? items.find((candidate) => candidate.id === id)
      : undefined;
    return entry ? entry.item : undefined;
  };
  const equippedKeys = loadout[entityType] || [];
  // what the server counts: every equipped item, also when a balance change pushed it over the
  // budget (the match then leaves out what does not fit, see sanitizeLoadout)
  const equippedPoints = Object.values(equipment)
    .flat()
    .filter(Boolean)
    .reduce((sum, id) => {
      const entry = items.find((candidate) => candidate.id === id);
      return sum + (entry && Items[entry.item] ? Items[entry.item].points : 0);
    }, 0);
  const inactive = (index) => {
    const key = slotItem(index);
    return Boolean(key) && !equippedKeys.includes(key);
  };

  return (
    <div className={classes.page} data-testid="lab" ref={page}>
      <div className={classes.decorationLeft} />
      <div className={classes.decorationRight} />
      <div className={classes.topbar} ref={part("topbar")}>
        <div
          role="button"
          tabIndex={0}
          className={classes.cocoa}
          onClick={openPantry}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openPantry();
            }
          }}
          aria-label={t(tr.PANTRY_TITLE)}
          data-testid="pantry-button"
        >
          <span>{pantry.COCOA || 0}</span>
          <IngredientIcon id="COCOA" size="calc(3vh + 3vw)" />
        </div>
        <Fab
          color="secondary"
          icon="lab/recipe-book"
          onClick={() => {
            loadBook();
            setBookOpen(true);
          }}
          aria-label={t(tr.LAB_RECIPE_BOOK)}
          data-testid="recipe-book-button"
        />
      </div>

      <div className={classes.stage} ref={part("stage")}>
        <div className={classes.building} ref={part("building")}>
          <EquipmentSlot
            index={0}
            item={slotItem(0)}
            inactive={inactive(0)}
            onClick={() => setPickerSlot(0)}
            disabled={!online}
          />
          <div className={classes.preview}>
            <MeshPreview selectedEntity={selected} />
          </div>
          <EquipmentSlot
            index={1}
            item={slotItem(1)}
            inactive={inactive(1)}
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
        <BudgetBar used={equippedPoints} />
      </div>

      <div className={classes.table} ref={part("table")}>
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

      {typeof introStep === "number" ? (
        <>
          <Spotlight target={parts.current[introTarget]} container={page.current} />
          <LabIntro step={introStep} onStep={setIntroStep} onDone={endIntro} />
        </>
      ) : null}
      <InventoryPicker
        open={typeof pickerSlot === "number"}
        close={() => setPickerSlot(undefined)}
        buildingName={buildingName(entityType)}
        entityType={entityType}
        slot={pickerSlot || 0}
        items={items}
        equipment={equipment}
        budgetUsed={equippedPoints}
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
