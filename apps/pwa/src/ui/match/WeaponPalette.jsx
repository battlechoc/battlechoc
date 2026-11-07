import { useEffect, useRef, useState } from "react";
import { connect } from "react-redux";
import { createUseStyles, useTheme } from "react-jss";
import { engine } from "@battlechoc/battlechoc-shared-functions";
import { selectAttack, focusBoard } from "../uiSlice";
import Jukebox from "../misc/Jukebox";
import useMatchTime from "./useMatchTime";
import ProgressRing from "./ProgressRing";
import TapPointer from "../controls/TapPointer";
import { WEAPON_PALETTE, ATTACK_ICON, iconUrl } from "../../catalog";

const { WeaponState } = engine;

const weapons = WEAPON_PALETTE.map((type) => ({
  type,
  image: ATTACK_ICON[type],
}));

const stateColors = (theme) => ({
  [WeaponState.READY]: theme.color.primary.light,
  [WeaponState.RUSHABLE]: theme.color.secondary.light,
  [WeaponState.CHARGING]: "#8a7b72",
});

const useStyles = createUseStyles((theme) => ({
  // placed by the match's bottom bar (Hud.jsx): a row from the right in landscape, a column
  // from the bottom in portrait, so the buildings keep the width of the screen
  container: {
    display: "flex",
    flexDirection: "row-reverse",
    gap: 6,
    pointerEvents: "none",
    [theme.breakpoints.orientation.portrait]: {
      flexDirection: "column-reverse",
    },
  },
  item: {
    position: "relative",
    pointerEvents: "auto",
    "& > div:first-child": { position: "relative" },
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
  // the tutorial's hand on a button: one and a half icons wide
  pointer: {
    [theme.breakpoints.orientation.portrait]: { "--tap-size": "21vw" },
    [theme.breakpoints.orientation.landscape]: {
      "--tap-size": "min(10.5vw, 19.5vh)",
    },
    [theme.breakpoints.orientation.square]: {
      "--tap-size": "calc(5.25vh + 5.25vw)",
    },
  },
  // nothing to fire right now; the button stays clickable to aim
  empty: {
    "& > div:first-child": { filter: "grayscale(60%) brightness(60%)" },
  },
  "@keyframes deniedFlash": {
    "0%, 100%": {
      transform: "scale(1)",
      boxShadow: "0 0 0 0 rgba(255, 78, 133, 0)",
    },
    "25%, 75%": {
      transform: "scale(1.12)",
      boxShadow: `0 0 0 0.6vw ${theme.color.accent.light}`,
    },
    "50%": {
      transform: "scale(0.95)",
      boxShadow: "0 0 0 0 rgba(255, 78, 133, 0)",
    },
  },
  denied: { animation: "$deniedFlash 0.6s ease-in-out" },
  // price of an early shot, in cacao: on the lower edge of the ring, inside the button (hanging
  // below it, it went out of the window at the bottom right)
  price: {
    position: "absolute",
    bottom: 0,
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    alignItems: "center",
    padding: "0 0.35em 0 0.2em",
    borderRadius: "1em",
    color: "white",
    fontFamily: theme.font.display,
    // body size: on the icons (in vw/vh) it stays readable on small phones and big screens
    fontSize: theme.font.size.md,
    whiteSpace: "nowrap",
    border: "0.1em solid white",
    "& i": {
      display: "inline-block",
      width: "1.15em",
      height: "1.15em",
      marginRight: "0.15em",
      background: "url(/images/cacao-icon.svg) no-repeat",
      backgroundSize: "100% 100%",
    },
  },
  // how many shots of this type can be fired now, when more than one
  count: {
    position: "absolute",
    top: "-8%",
    right: "-8%",
    minWidth: "1.4em",
    height: "1.4em",
    lineHeight: "1.4em",
    padding: "0 0.25em",
    borderRadius: "1em",
    color: "white",
    fontFamily: theme.font.display,
    fontSize: theme.font.size.md,
    textAlign: "center",
    border: "0.1em solid white",
  },
}));

// per attack type: how many weapons are ready, how many could fire early, the rush price,
// and how far the readiest weapon has charged
const weaponOverview = (view, t) => {
  const me = view.players[view.viewer];
  const grid = view.board.fields[me.fieldIndex].grid;
  const overview = {};
  grid.forEach((cell) =>
    cell.occupiedBy.forEach((entity) =>
      (entity.weapons || []).forEach((weapon) => {
        const status = engine.weaponStatus(view, weapon, t);
        const entry = overview[weapon.attackType] || {
          total: 0,
          ready: 0,
          rushable: 0,
          rushCost: 0,
          progress: 0,
        };
        entry.total += 1;
        entry.progress = Math.max(entry.progress, status.progress);
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

// the attack buttons: a ring shows how far the readiest weapon has charged, green when a shot
// is free, "×N" when several can fire, and a cacao price tag when a shot can only be fired early
// (red when the cacao is not enough); a denied shot flashes the button
// how many shots of each weapon type can be fired now: { [attackType]: { available, free } }
const availability = (view, t) => {
  if (typeof view === "undefined" || view.phase !== engine.MatchPhase.RUNNING) {
    return {};
  }
  const me = view.players[view.viewer];
  const stunned = t < me.stunnedUntil;
  const overview = weaponOverview(view, t);
  return Object.fromEntries(
    Object.entries(overview).map(([type, entry]) => {
      const affordableRushes = me.cacao >= entry.rushCost ? entry.rushable : 0;
      return [
        type,
        {
          available: stunned ? 0 : entry.ready + affordableRushes,
          free: stunned ? 0 : entry.ready,
        },
      ];
    })
  );
};

const WeaponPalette = ({
  view,
  selectedAttack,
  deniedAttack,
  pointer,
  select,
  switchTo,
}) => {
  const classes = useStyles();
  const theme = useTheme();
  const t = useMatchTime(4);
  const [flashing, setFlashing] = useState(undefined);

  // the selected weapon has fired its last shot: the selection moves on to one that can fire
  // (a free shot first, else an early one the cacao pays for), in the palette's order
  const shots = availability(view, t);
  const shotsKey = weapons
    .map((weapon) => `${(shots[weapon.type] || {}).available || 0}`)
    .join(",");
  const previousShots = useRef(shots);
  useEffect(() => {
    const before = previousShots.current;
    previousShots.current = shots;
    const had = before[selectedAttack] && before[selectedAttack].available > 0;
    const has = shots[selectedAttack] && shots[selectedAttack].available > 0;
    if (!selectedAttack || !had || has) {
      return;
    }
    const next =
      weapons.find(
        (weapon) => shots[weapon.type] && shots[weapon.type].free > 0
      ) ||
      weapons.find(
        (weapon) => shots[weapon.type] && shots[weapon.type].available > 0
      );
    if (next) {
      switchTo(next.type);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shotsKey, selectedAttack]);
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
          const affordableRushes =
            me.cacao >= entry.rushCost ? entry.rushable : 0;
          const available = stunned ? 0 : entry.ready + affordableRushes;
          const state =
            entry.ready > 0
              ? WeaponState.READY
              : entry.rushable > 0
                ? WeaponState.RUSHABLE
                : WeaponState.CHARGING;
          const free = !stunned && entry.ready > 0;
          const color =
            available === 0
              ? colors[WeaponState.CHARGING]
              : free
                ? colors[WeaponState.READY]
                : colors[WeaponState.RUSHABLE];
          const showPrice = !free && !stunned && entry.rushable > 0;
          const affordable = me.cacao >= entry.rushCost;
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
              <div
                className={classes.icon}
                style={{ backgroundImage: `url(${iconUrl(weapon.image)})` }}
              >
                <ProgressRing
                  progress={stunned ? 0 : entry.progress}
                  color={free ? colors[WeaponState.READY] : "white"}
                  width={7}
                  outset={4}
                />
              </div>
              {available > 1 ? (
                <div className={classes.count} style={{ background: color }}>
                  {`×${available}`}
                </div>
              ) : null}
              {showPrice ? (
                <div
                  className={classes.price}
                  data-testid="rush-price"
                  style={{
                    background: affordable
                      ? colors[WeaponState.RUSHABLE]
                      : theme.color.accent.light,
                  }}
                >
                  <i />
                  {entry.rushCost}
                </div>
              ) : null}
              {pointer && pointer.weapon === weapon.type ? (
                // from the top left: the buttons stand in the bottom right corner
                <TapPointer
                  data-testid="tutorial-pointer"
                  className={classes.pointer}
                  from="top-left"
                  x="50%"
                  y="50%"
                />
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
  pointer: state.ui.tutorialPointer,
});

const mapDispatchToProps = (dispatch) => ({
  // picking an attack always turns the camera to the opponent's board
  select: (type) => {
    dispatch(selectAttack(type));
    dispatch(focusBoard("opponent"));
  },
  // the camera stays where it is
  switchTo: (type) => dispatch(selectAttack(type)),
});

export default connect(mapStateToProps, mapDispatchToProps)(WeaponPalette);
