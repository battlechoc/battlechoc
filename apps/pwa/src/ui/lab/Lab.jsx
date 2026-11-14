import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { connect } from "react-redux";
import { createUseStyles } from "react-jss";
import {
  Items,
  SpecialIngredient,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import ChoclabPalette from "../controls/ChoclabPalette";
import Fab from "../controls/Fab";
import { updatePlayerStats } from "../uiSlice";
import {
  fetchRecipes,
  tryIngredients,
  craftItem,
  equipItem,
} from "../../api/lab";
import { fetchOwnProfile } from "../../api/profile";
import logger from "../../helper/logger";
import OfflineStore from "../../OfflineStore";
import Jukebox from "../misc/Jukebox";
import IngredientIcon from "../ingredients/IngredientIcon";
import Pantry from "../dialogs/Pantry";
import EquipmentSlot from "./EquipmentSlot";
import BudgetBar from "./BudgetBar";
import LabTable from "./LabTable";
import InventoryPicker from "./InventoryPicker";
import RecipeBook from "./RecipeBook";
import ItemShelf from "./ItemShelf";
import ItemCard from "./ItemCard";
import LabIntro, {
  LAB_INTRO_SEEN,
  LAB_INTRO_STEPS,
  Spotlight,
} from "./LabIntro";
import { effectLines, labColors } from "./itemText";
import { shelfGroups } from "./itemActions";
import { bangers, outlined, rise } from "../styles";

// loaded with the lab, like the game's scene: Babylon stays out of the first bundle
const MeshPreview = React.lazy(() => import("../../3d/MeshPreview"));

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
    background: rise(theme.color.sky, "80%"),
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
    margin: `${theme.edge.top} ${theme.edge.right} 0`,
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
    ...outlined(theme),
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
  // the screen's edges (and the safe area) stay free around it, also when the lab scrolls
  table: {
    flex: "0 0 auto",
    margin: `0 max(1em, ${theme.edge.right}) max(0.8em, ${theme.edge.bottom}) max(1em, ${theme.edge.left})`,
    borderRadius: 20,
  },
  // the lab table and the item shelf: tabs on the panel's top edge
  tabs: {
    display: "flex",
    gap: "0.4em",
    padding: "0 1.2em",
  },
  tab: {
    minHeight: 44,
    padding: "0.2em 1em",
    border: "none",
    borderRadius: "0.8em 0.8em 0 0",
    background: theme.color.secondary.dark,
    cursor: "pointer",
    ...bangers(theme),
    fontSize: theme.font.size.lg,
    "&:focus-visible": {
      outline: `3px solid ${theme.color.gold.light}`,
      outlineOffset: -3,
    },
  },
  // the open tab has the colour of the panel's top
  activeTab: {
    background: theme.color.secondary.light,
    color: theme.color.gold.light,
  },
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
  // the bottom panel: "table" (the lab table) or "items" (the item shelf)
  const [tab, setTab] = useState("table");
  // the item card: { item, instanceId } while it is open
  const [card, setCard] = useState(undefined);
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
    fetchRecipes()
      .then((recipes) => setBook(recipes))
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
      .catch((error) =>
        logger.info("could not read the lab intro flag", error)
      );
    return () => {
      active = false;
    };
  }, []);

  const endIntro = () => {
    setIntroStep(undefined);
    OfflineStore.settingsStore
      .set(LAB_INTRO_SEEN, true)
      .catch((error) =>
        logger.info("could not store the lab intro flag", error)
      );
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
    tryIngredients(entityType, picked)
      .then((tried) => {
        setResult({
          ...tried,
          status: tried.result,
          seq: Date.now(),
        });
        if (tried.result === "found") {
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
    fetchOwnProfile()
      .then(({ stats }) => {
        const {
          pantry: fresh,
          spoiling,
          items: owned,
          equipment: equipped,
          loadout: active,
        } = stats;
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
    craftItem(recipe.item)
      .then((crafted) => {
        const changes = {
          pantry: crafted.pantry,
          spoiling: crafted.spoiling,
          coins: crafted.pantry.COCOA || 0,
          items: [crafted.item, ...items],
        };
        updateStats(changes);
        persist(changes);
        setResult(undefined);
        setCrafted(crafted.item);
      })
      .catch((error) => {
        logger.warn("crafting failed", error);
        setResult({ status: "error", seq: Date.now() });
      })
      .finally(() => setBusy(false));
  };

  // puts an item into a building's slot (itemId null empties it); resolves whether it worked,
  // and the caller says why it did not (the lab table for the picker, the item card for Remove)
  const putItem = (type, slot, itemId) => {
    setBusy(true);
    return equipItem(type, slot, itemId)
      .then((equipped) => {
        const changes = {
          equipment: equipped.equipment,
          loadout: equipped.loadout,
        };
        updateStats(changes);
        persist(changes);
        return true;
      })
      .catch((error) => {
        logger.warn("equipping failed", error);
        return false;
      })
      .finally(() => setBusy(false));
  };

  const equip = (itemId) =>
    putItem(entityType, pickerSlot, itemId).then((done) => {
      if (done) {
        setPickerSlot(undefined);
      } else {
        setResult({ status: "error", seq: Date.now() });
      }
    });

  // the free slot of a building (or the first one)
  const freeSlot = (type) => {
    const slots = equipment[type] || [];
    const free = [0, 1].find((i) => !slots[i]);
    return typeof free === "number" ? free : 0;
  };

  // after crafting, offer the free slot of the item's building
  const equipCrafted = () => {
    setCrafted(undefined);
    setPickerSlot(freeSlot(entityType));
  };

  // from the item card: the item's building, and the picker on its free slot
  const equipFromCard = (itemKey) => {
    const type = Items[itemKey].entityType;
    setCard(undefined);
    selectBuilding(type);
    setPickerSlot(freeSlot(type));
  };

  // the server answered a salvage: the item is gone, its ingredients are back
  const salvaged = (answer, itemId) => {
    const changes = {
      pantry: answer.pantry,
      spoiling: answer.spoiling,
      coins: answer.pantry.COCOA || 0,
      items: items.filter((entry) => entry.id !== itemId),
      equipment: answer.equipment,
      loadout: answer.loadout,
    };
    updateStats(changes);
    persist(changes);
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
  // the player's items of the type the item card shows
  const cardGroup = card
    ? shelfGroups(items).find((group) => group.item === card.item)
    : undefined;
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
            <Suspense fallback={null}>
              <MeshPreview selectedEntity={selected} />
            </Suspense>
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
        <div className={classes.tabs} role="tablist">
          {[
            ["table", tr.ITEM_TAB_TABLE, "item-table-tab"],
            ["items", tr.ITEM_SHELF, "item-shelf-tab"],
          ].map(([id, label, testId]) => (
            <button
              type="button"
              key={id}
              role="tab"
              aria-selected={tab === id}
              className={`${classes.tab} ${
                tab === id ? classes.activeTab : ""
              }`}
              onClick={() => setTab(id)}
              data-testid={testId}
            >
              {t(label)}
            </button>
          ))}
        </div>
        {tab === "items" ? (
          <ItemShelf
            items={items}
            onOpen={(item, instanceId) => setCard({ item, instanceId })}
          />
        ) : (
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
        )}
      </div>

      {typeof introStep === "number" ? (
        <>
          <Spotlight
            target={parts.current[introTarget]}
            container={page.current}
          />
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
      {card ? (
        <ItemCard
          open
          close={() => setCard(undefined)}
          item={card.item}
          instanceId={card.instanceId}
          instances={cardGroup ? cardGroup.instances : []}
          equipment={equipment}
          book={book}
          online={online}
          busy={busy}
          buildingName={buildingName}
          onEquip={equipFromCard}
          onTakeOff={({ entityType: type, slot }) => putItem(type, slot, null)}
          onSalvaged={salvaged}
          onGone={refreshStats}
          mintAction={undefined}
          mintStatus={undefined}
        />
      ) : null}
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
