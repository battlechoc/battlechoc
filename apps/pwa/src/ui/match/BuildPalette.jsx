import React, { useEffect, useRef } from "react";
import { connect } from "react-redux";
import { createUseStyles } from "react-jss";
import {
  engine,
  EntityType,
  unlocks,
  buildingsUnlockedBetween,
} from "@battlechoc/battlechoc-shared-functions";
import { selectBuilding, tapBuilding, focusBoard, deselectBuildings } from "../UiActions";
import { fruitCannonPossible } from "../../match/fruitCannon";
import { Jukebox } from "../misc";
import { LESSON } from "../../tutorial/ids";

const buildings = [
  { type: EntityType.CACAOTREE, image: "cacao-tree" },
  { type: EntityType.RUM_TRUFFLE_CANNON, image: "truffle-cannon" },
  { type: EntityType.CREAM, image: "cream" },
  { type: EntityType.FACTORY_EXTENSION, image: "factory-extension" },
  { type: EntityType.SPYING_EASTER_BUNNY, image: "easter-bunny" },
  { type: EntityType.XMAS_FACTORY, image: "xmas-factory" },
  { type: EntityType.CHOCOLATE_FOUNTAIN, image: "fountain" },
  { type: EntityType.FRUIT_CANNON, image: "fruit-cannon" },
  { type: EntityType.DONUT_FACTORY, image: "donut-factory" },
];

const donutImages = {
  [EntityType.DONUT_PORTAL_BLUE]: "portal-donut",
  [EntityType.DONUT_PORTAL_RED]: "portal-donut",
  [EntityType.DONUT_SURPRISE_YELLOW]: "surprise-donut",
  [EntityType.DONUT_HEALTH_GREEN]: "health-donut",
  [EntityType.DONUT_STOP_PINK]: "stop-donut",
  [EntityType.DONUT_CREAM_WHITE]: "cream-donut",
};

// the picture of each building, for the dialog that announces new ones too (dialogs/Unlocked.jsx)
export const buildingImages = Object.fromEntries(buildings.map((building) => [building.type, building.image]));

// the room between two buttons
const GAP = 6;

const size = (theme) => ({
  [theme.breakpoints.orientation.portrait]: { width: "12vw", height: "12vw" },
  [theme.breakpoints.orientation.landscape]: {
    width: "6vw",
    height: "6vw",
    maxWidth: "11vh",
    maxHeight: "11vh",
  },
  [theme.breakpoints.orientation.square]: {
    width: "calc(3vh + 3vw)",
    height: "calc(3vh + 3vw)",
  },
});

const useStyles = createUseStyles((theme) => ({
  // placed by the match's bottom bar (Hud.jsx), beside the weapons; it wraps into more rows
  // when they leave little room. Only the buttons take the pointer, the gaps go to the board.
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: GAP,
    pointerEvents: "none",
  },
  palette: {
    display: "flex",
    flexWrap: "wrap",
    gap: GAP,
  },
  item: {
    position: "relative",
    pointerEvents: "auto",
    border: `0.4vw solid ${theme.color.secondary.dark}`,
    borderRadius: "50%",
    background: "linear-gradient(0deg, #3DA2CE 0%, #9DD5E9 80%)",
    cursor: "pointer",
    "& > .icon": {
      backgroundSize: "100% 100%",
      backgroundRepeat: "no-repeat",
      ...size(theme),
    },
  },
  disabled: { filter: "brightness(35%)" },
  // the tutorial points at the building the current step asks for
  "@keyframes hintPulse": {
    "0%": { transform: "scale(1)" },
    "50%": { transform: "scale(1.12)" },
    "100%": { transform: "scale(1)" },
  },
  hint: {
    border: `0.4vw solid ${theme.color.gold.light}`,
    animation: "$hintPulse 1.2s ease-in-out infinite",
  },
  selected: {
    border: `0.4vw solid ${theme.color.gold.light}`,
    "& > .icon": { filter: "brightness(120%)" },
  },
  locked: {
    border: `0.4vw solid ${theme.color.accent.dark}`,
    background: `linear-gradient(0deg, ${theme.color.accent.dark} 0%, ${theme.color.accent.light} 80%)`,
    cursor: "default",
    "& > .icon": { backgroundSize: "50% 50%", backgroundPosition: "center" },
  },
  costs: {
    position: "absolute",
    bottom: "-8%",
    right: "-8%",
    minWidth: "2.2em",
    padding: "0 0.25em",
    borderRadius: "1em",
    background: theme.color.brown.light,
    border: `0.1em solid ${theme.color.gold.light}`,
    color: "white",
    fontFamily: theme.font.display,
    // body size: on the icons (in vw/vh) it stays readable on small phones and big screens
    fontSize: theme.font.size.md,
    textAlign: "center",
  },
}));

const countOnOwnField = (grid, entityType) =>
  grid.filter((cell) =>
    cell.occupiedBy.some((entity) => entity.type === entityType)
  ).length;

const BuildPalette = ({
  view,
  stats,
  earlyUnlock,
  tutorial,
  lesson,
  matchKind,
  selectedBuilding,
  select,
  endSelection,
  whitelist,
}) => {
  const classes = useStyles();
  // a selected fruit cannon ends by itself once it can no longer be built (no cacao, no free
  // building slot, no cannon left): the spotlight on the cannons goes and the board is normal again
  const fruitPossible = fruitCannonPossible(view);
  const fruitWasPossible = useRef(fruitPossible);
  useEffect(() => {
    if (selectedBuilding === EntityType.FRUIT_CANNON && fruitWasPossible.current && !fruitPossible) {
      endSelection();
    }
    fruitWasPossible.current = fruitPossible;
  }, [fruitPossible, selectedBuilding, endSelection]);

  if (
    typeof view === "undefined" ||
    view.phase !== engine.MatchPhase.RUNNING
  ) {
    return null;
  }
  const me = view.players[view.viewer];
  const grid = view.board.fields[me.fieldIndex].grid;
  // the first matches unlock the buildings two by two (shared progression.js); the building demos
  // and a challenge match (a friend's link) show them all
  const unlockedBuildings = unlocks(stats, { early: earlyUnlock }).unlockedBuildings;
  // the lesson offers its own three buildings and locks the rest, as the first match does
  const lessonBuildings = lesson ? buildingsUnlockedBetween(-1, 0) : null;
  const unlocked = (type) =>
    lesson
      ? lessonBuildings.includes(type)
      : tutorial || matchKind === "challenge" || unlockedBuildings.includes(type);

  const canBuild = (type) => {
    if (Array.isArray(whitelist) && !whitelist.includes(type)) {
      return false;
    }
    const entitySpec = view.balance.entities[type];
    if (me.buildTokens < 1 || me.cacao < engine.buildCosts(view, view.viewer, type)) {
      return false;
    }
    if (entitySpec.maxPerField && countOnOwnField(grid, type) >= entitySpec.maxPerField) {
      return false;
    }
    if (type === EntityType.FRUIT_CANNON) {
      return countOnOwnField(grid, EntityType.RUM_TRUFFLE_CANNON) > 0;
    }
    if (type === EntityType.FACTORY_EXTENSION) {
      return countOnOwnField(grid, EntityType.FACTORY) > 0;
    }
    return true;
  };

  const pendingDonut = me.donuts.length > 0 ? me.donuts[0] : undefined;

  return (
    <div className={classes.container}>
      {pendingDonut ? (
        <div className={classes.palette}>
          <div
            className={`${classes.item} ${
              selectedBuilding === pendingDonut.type ? classes.selected : ""
            }`}
            onClick={() => {
              Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
              select(pendingDonut.type);
            }}
          >
            <div
              className="icon"
              style={{
                backgroundImage: `url(/images/${donutImages[pendingDonut.type]}-icon.svg)`,
              }}
            />
          </div>
        </div>
      ) : null}
      <div className={classes.palette} data-testid="build-palette">
        {buildings.map((building) => {
          if (!unlocked(building.type)) {
            return (
              <div key={building.type} className={`${classes.item} ${classes.locked}`}>
                <div className="icon" style={{ backgroundImage: "url(/images/lock.svg)" }} />
              </div>
            );
          }
          const possible = canBuild(building.type);
          const costs = engine.buildCosts(view, view.viewer, building.type);
          return (
            <div
              key={building.type}
              data-testid={`build-${building.image}`}
              className={`${classes.item} ${
                selectedBuilding === building.type ? classes.selected : ""
              } ${possible ? "" : classes.disabled} ${
                possible && Array.isArray(whitelist) && selectedBuilding !== building.type ? classes.hint : ""
              }`}
              onClick={() => {
                // the tutorial only lets the player pick what the current step asks for
                if (Array.isArray(whitelist) && !whitelist.includes(building.type)) {
                  return;
                }
                Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                select(building.type);
              }}
            >
              <div
                className="icon"
                style={{ backgroundImage: `url(/images/${building.image}-icon.svg)` }}
              />
              {costs > 0 ? <div className={classes.costs}>{costs}</div> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const mapStateToProps = (state) => ({
  view: state.match.view,
  stats: state.ui.playerInfos.stats,
  earlyUnlock: state.ui.earlyUnlock,
  selectedBuilding: state.ui.selectedBuilding,
  whitelist: state.ui.whitelistBuildings,
  tutorial: state.ui.tutorial,
  lesson: state.ui.tutorial && Array.isArray(state.ui.loopAnimations) && state.ui.loopAnimations[0] === LESSON,
  matchKind: state.match.kind,
});

const mapDispatchToProps = (dispatch) => ({
  // picking something to build always turns the camera to the own board
  select: (type) => {
    dispatch(tapBuilding(type));
    dispatch(selectBuilding(type));
    dispatch(focusBoard("own"));
  },
  endSelection: () => dispatch(deselectBuildings()),
});

export default connect(mapStateToProps, mapDispatchToProps)(BuildPalette);
