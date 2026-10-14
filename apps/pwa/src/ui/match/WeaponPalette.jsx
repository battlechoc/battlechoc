import React, { useEffect, useState } from "react";
import { connect } from "react-redux";
import { createUseStyles, useTheme } from "react-jss";
import {
  engine,
  AttackType,
} from "@battlechoc/battlechoc-shared-functions";
import { selectAttack, focusBoard } from "../UiActions";
import { Jukebox } from "../misc";
import useMatchTime from "./useMatchTime";

const { WeaponState } = engine;

const weapons = [
  { type: AttackType.TRUFFLE, image: "truffle-cannon" },
  { type: AttackType.FRUIT, image: "fruit-cannon" },
  { type: AttackType.BUNNY, image: "easter-bunny" },
  { type: AttackType.HOT_CHOCOLATE, image: "ballista" },
];

const stateColors = (theme) => ({
  [WeaponState.READY]: theme.color.primary.light,
  [WeaponState.RUSHABLE]: theme.color.secondary.light,
  [WeaponState.CHARGING]: "#8a7b72",
});

const useStyles = createUseStyles((theme) => ({
  container: {
    position: "absolute",
    bottom: 0,
    right: 0,
    zIndex: 1,
    display: "flex",
    flexDirection: "row-reverse",
    marginBottom: 5,
    marginRight: 5,
  },
  item: {
    position: "relative",
    marginLeft: 5,
    borderRadius: "50%",
    padding: "0.5vw",
    cursor: "pointer",
    [theme.breakpoints.orientation.portrait]: { padding: "1vw" },
  },
  icon: {
    borderRadius: "50%",
    backgroundColor: "#9DD5E9",
    backgroundSize: "100% 100%",
    backgroundRepeat: "no-repeat",
    [theme.breakpoints.orientation.portrait]: { width: "14vw", height: "14vw" },
    [theme.breakpoints.orientation.landscape]: {
      width: "7vw",
      height: "7vw",
      maxWidth: "13vh",
      maxHeight: "13vh",
    },
    [theme.breakpoints.orientation.square]: {
      width: "calc(3.5vh + 3.5vw)",
      height: "calc(3.5vh + 3.5vw)",
    },
  },
  selected: { boxShadow: `0 0 0 0.4vw ${theme.color.gold.light}` },
  // nothing to fire right now; the button stays clickable to aim
  empty: { "& > div:first-child": { filter: "grayscale(60%) brightness(60%)" } },
  "@keyframes deniedFlash": {
    "0%, 100%": { transform: "scale(1)", boxShadow: "0 0 0 0 rgba(255, 78, 133, 0)" },
    "25%, 75%": { transform: "scale(1.12)", boxShadow: `0 0 0 0.6vw ${theme.color.accent.light}` },
    "50%": { transform: "scale(0.95)", boxShadow: "0 0 0 0 rgba(255, 78, 133, 0)" },
  },
  denied: { animation: "$deniedFlash 0.6s ease-in-out" },
  badge: {
    position: "absolute",
    bottom: "-6%",
    right: "-6%",
    minWidth: "2.2em",
    padding: "0 0.3em",
    borderRadius: "1em",
    color: "white",
    fontFamily: "Bangers",
    fontSize: "1.8vw",
    textAlign: "center",
    border: "0.2vw solid white",
    [theme.breakpoints.orientation.portrait]: { fontSize: "3.4vw" },
  },
  // how many shots of this type can be fired now
  count: {
    position: "absolute",
    top: "-8%",
    right: "-8%",
    minWidth: "1.4em",
    height: "1.4em",
    lineHeight: "1.4em",
    borderRadius: "50%",
    color: "white",
    fontFamily: "Bangers",
    fontSize: "2.2vw",
    textAlign: "center",
    border: "0.2vw solid white",
    [theme.breakpoints.orientation.portrait]: { fontSize: "4.4vw" },
  },
}));

// per attack type: how many weapons are ready, how many could fire early, the rush price
const weaponOverview = (view, t) => {
  const me = view.players[view.viewer];
  const grid = view.board.fields[me.fieldIndex].grid;
  const overview = {};
  grid.forEach((cell) =>
    cell.occupiedBy.forEach((entity) =>
      (entity.weapons || []).forEach((weapon) => {
        const status = engine.weaponStatus(view, weapon, t);
        const entry = overview[weapon.attackType] || { total: 0, ready: 0, rushable: 0, rushCost: 0 };
        entry.total += 1;
        if (status.state === WeaponState.READY) {
          entry.ready += 1;
        } else if (status.state === WeaponState.RUSHABLE) {
          entry.rushable += 1;
          entry.rushCost = status.rushCost;
        }
        overview[weapon.attackType] = entry;
      })
    )
  );
  return overview;
};

// the attack buttons: no timers here (the rings above the units show those), only how many
// shots are available: green = free, blue = early for cacao; a denied shot flashes the button
const WeaponPalette = ({ view, selectedAttack, deniedAttack, select }) => {
  const classes = useStyles();
  const theme = useTheme();
  const t = useMatchTime(4);
  const [flashing, setFlashing] = useState(undefined);
  useEffect(() => {
    if (deniedAttack.seq === 0) {
      return undefined;
    }
    setFlashing({ type: deniedAttack.type, seq: deniedAttack.seq });
    const timeout = setTimeout(() => setFlashing(undefined), 650);
    return () => clearTimeout(timeout);
  }, [deniedAttack]);

  if (typeof view === "undefined" || view.phase !== engine.MatchPhase.RUNNING) {
    return null;
  }
  const me = view.players[view.viewer];
  const stunned = t < me.stunnedUntil;
  const overview = weaponOverview(view, t);
  const colors = stateColors(theme);

  return (
    <div className={classes.container} data-testid="weapon-palette">
      {weapons
        .filter((weapon) => overview[weapon.type])
        .map((weapon) => {
          const entry = overview[weapon.type];
          const affordableRushes = me.cacao >= entry.rushCost ? entry.rushable : 0;
          const available = stunned ? 0 : entry.ready + affordableRushes;
          const state = entry.ready > 0 ? WeaponState.READY : entry.rushable > 0 ? WeaponState.RUSHABLE : WeaponState.CHARGING;
          const free = !stunned && entry.ready > 0;
          const color = available === 0 ? colors[WeaponState.CHARGING] : free ? colors[WeaponState.READY] : colors[WeaponState.RUSHABLE];
          const flash = flashing && flashing.type === weapon.type;
          return (
            <div
              key={flash ? `${weapon.type}-${flashing.seq}` : weapon.type}
              data-testid={`weapon-${weapon.image}`}
              data-state={state}
              data-available={available}
              className={`${classes.item} ${selectedAttack === weapon.type ? classes.selected : ""} ${
                available === 0 ? classes.empty : ""
              } ${flash ? classes.denied : ""}`}
              onClick={() => {
                Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                select(weapon.type);
              }}
            >
              <div className={classes.icon} style={{ backgroundImage: `url(/images/${weapon.image}-icon.svg)` }} />
              <div className={classes.count} style={{ background: color }}>
                {available}
              </div>
              {!free && available > 0 ? (
                <div className={classes.badge} style={{ background: color }}>
                  {`-${entry.rushCost}`}
                </div>
              ) : null}
            </div>
          );
        })}
    </div>
  );
};

const mapStateToProps = (state) => ({
  view: state.match.view,
  selectedAttack: state.ui.selectedAttack,
  deniedAttack: state.ui.deniedAttack,
});

const mapDispatchToProps = (dispatch) => ({
  // picking an attack always turns the camera to the opponent's board
  select: (type) => {
    dispatch(selectAttack(type));
    dispatch(focusBoard("opponent"));
  },
});

export default connect(mapStateToProps, mapDispatchToProps)(WeaponPalette);
