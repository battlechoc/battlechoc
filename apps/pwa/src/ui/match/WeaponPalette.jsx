import React from "react";
import { connect } from "react-redux";
import { createUseStyles, useTheme } from "react-jss";
import {
  engine,
  AttackType,
} from "@battlechoc/battlechoc-shared-functions";
import { selectAttack } from "../UiActions";
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
  disabled: { filter: "brightness(40%)", cursor: "default" },
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
  count: {
    position: "absolute",
    top: "-6%",
    left: "-6%",
    color: "white",
    fontFamily: "Bangers",
    fontSize: "2vw",
    textShadow: "0.2vw 0.2vw 0.1vw #222",
    [theme.breakpoints.orientation.portrait]: { fontSize: "4vw" },
  },
}));

// best weapon of each attack type: the one closest to being ready
const weaponOverview = (view, t) => {
  const me = view.players[view.viewer];
  const grid = view.board.fields[me.fieldIndex].grid;
  const overview = {};
  grid.forEach((cell) =>
    cell.occupiedBy.forEach((entity) =>
      (entity.weapons || []).forEach((weapon) => {
        const status = engine.weaponStatus(view, weapon, t);
        const current = overview[weapon.attackType];
        if (!current) {
          overview[weapon.attackType] = { ...status, count: 1, ready: status.state === WeaponState.READY ? 1 : 0 };
        } else {
          current.count += 1;
          current.ready += status.state === WeaponState.READY ? 1 : 0;
          if (status.progress > current.progress) {
            Object.assign(current, { ...status, count: current.count, ready: current.ready });
          }
        }
      })
    )
  );
  return overview;
};

const WeaponPalette = ({ view, selectedAttack, select }) => {
  const classes = useStyles();
  const theme = useTheme();
  const t = useMatchTime(5);
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
          const status = overview[weapon.type];
          const color = stunned ? "#d05531" : colors[status.state];
          const degrees = Math.round(status.progress * 360);
          const affordable = status.state !== WeaponState.RUSHABLE || me.cacao >= status.rushCost;
          let badge = null;
          if (status.state === WeaponState.READY) {
            badge = <div className={classes.badge} style={{ background: color }}>✓</div>;
          } else if (status.state === WeaponState.RUSHABLE) {
            badge = (
              <div className={classes.badge} style={{ background: affordable ? color : "#772549" }}>
                {`-${status.rushCost}`}
              </div>
            );
          }
          return (
            <div
              key={weapon.type}
              data-testid={`weapon-${weapon.image}`}
              data-state={status.state}
              className={`${classes.item} ${selectedAttack === weapon.type ? classes.selected : ""} ${
                status.state === WeaponState.CHARGING || !affordable || stunned ? classes.disabled : ""
              }`}
              style={{
                background: `conic-gradient(${color} ${degrees}deg, rgba(0,0,0,0.35) ${degrees}deg)`,
              }}
              onClick={() => {
                Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                select(weapon.type);
              }}
            >
              <div className={classes.icon} style={{ backgroundImage: `url(/images/${weapon.image}-icon.svg)` }} />
              {status.count > 1 ? <div className={classes.count}>{`${status.ready}/${status.count}`}</div> : null}
              {badge}
            </div>
          );
        })}
    </div>
  );
};

const mapStateToProps = (state) => ({
  view: state.match.view,
  selectedAttack: state.ui.selectedAttack,
});

const mapDispatchToProps = (dispatch) => ({
  select: (type) => dispatch(selectAttack(type)),
});

export default connect(mapStateToProps, mapDispatchToProps)(WeaponPalette);
