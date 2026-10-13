import React from "react";
import { connect } from "react-redux";
import { createUseStyles } from "react-jss";
import {
  engine,
  EntityType,
} from "@battlechoc/battlechoc-shared-functions";
import { selectBuilding, tapBuilding } from "../UiActions";
import { Jukebox } from "../misc";

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

const unlockedWithoutScore = [
  EntityType.CACAOTREE,
  EntityType.RUM_TRUFFLE_CANNON,
  EntityType.CREAM,
];

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
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    zIndex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
  },
  palette: {
    display: "flex",
    flexWrap: "wrap",
    marginBottom: 5,
    marginLeft: 5,
    [theme.breakpoints.orientation.portrait]: { width: "80vw" },
  },
  item: {
    position: "relative",
    marginRight: 5,
    marginTop: 5,
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
    border: `0.2vw solid ${theme.color.gold.light}`,
    color: "white",
    fontFamily: "Bangers",
    fontSize: "1.6vw",
    textAlign: "center",
    [theme.breakpoints.orientation.portrait]: { fontSize: "3vw" },
  },
}));

const countOnOwnField = (grid, entityType) =>
  grid.filter((cell) =>
    cell.occupiedBy.some((entity) => entity.type === entityType)
  ).length;

const BuildPalette = ({ view, score, selectedBuilding, select, whitelist }) => {
  const classes = useStyles();
  if (
    typeof view === "undefined" ||
    view.phase !== engine.MatchPhase.RUNNING
  ) {
    return null;
  }
  const me = view.players[view.viewer];
  const grid = view.board.fields[me.fieldIndex].grid;
  const unlocked = (type) => score >= 1 || unlockedWithoutScore.includes(type);

  const canBuild = (type) => {
    if (Array.isArray(whitelist) && !whitelist.includes(type)) {
      return false;
    }
    const entitySpec = view.balance.entities[type];
    if (me.buildTokens < 1 || me.cacao < (entitySpec.costs || 0)) {
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
          const costs = view.balance.entities[building.type].costs || 0;
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
  score: state.ui.playerInfos.stats.score,
  selectedBuilding: state.ui.selectedBuilding,
  whitelist: state.ui.whitelistBuildings,
});

const mapDispatchToProps = (dispatch) => ({
  select: (type) => {
    dispatch(tapBuilding(type));
    dispatch(selectBuilding(type));
  },
});

export default connect(mapStateToProps, mapDispatchToProps)(BuildPalette);
