import React, { useEffect, useRef, useState } from "react";
import { connect } from "react-redux";
import { createUseStyles, useTheme } from "react-jss";
import { engine } from "@battlechoc/battlechoc-shared-functions";
import useMatchTime from "./useMatchTime";
import ProgressRing from "./ProgressRing";

const POP_MS = 1400;

const useStyles = createUseStyles((theme) => ({
  panel: {
    position: "absolute",
    top: 5,
    right: 5,
    zIndex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    userSelect: "none",
    whiteSpace: "nowrap",
  },
  info: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    marginBottom: 5,
    "& p": {
      margin: "0 5px 0 0",
      color: "white",
      fontFamily: "Bangers",
      fontSize: "3vw",
      "-webkit-text-stroke": `0.15vw ${theme.color.secondary.dark}`,
      "-webkit-font-smoothing": "antialiased",
      [theme.breakpoints.orientation.portrait]: { fontSize: "5.5vw" },
    },
  },
  icon: {
    position: "relative",
    border: `0.4vw solid ${theme.color.secondary.dark}`,
    borderRadius: "50%",
    background: "linear-gradient(0deg, #3DA2CE 0%, #9DD5E9 80%)",
    "& > div": {
      padding: "2.6vw",
      backgroundSize: "100% 100%",
      backgroundRepeat: "no-repeat",
      [theme.breakpoints.orientation.portrait]: { padding: "5vw" },
    },
  },
  // cacao that just came in or went out, floating away from the number
  pops: {
    position: "absolute",
    right: "100%",
    top: 0,
    bottom: 0,
    pointerEvents: "none",
  },
  pop: {
    position: "absolute",
    right: "0.5em",
    top: "50%",
    display: "flex",
    alignItems: "center",
    fontFamily: "Bangers",
    fontSize: "2.4vw",
    "-webkit-text-stroke": `0.12vw ${theme.color.secondary.dark}`,
    [theme.breakpoints.orientation.portrait]: { fontSize: "4.4vw" },
    "& i": {
      display: "inline-block",
      width: "1em",
      height: "1em",
      marginLeft: "0.15em",
      background: "url(/images/cacao-icon.svg) no-repeat",
      backgroundSize: "100% 100%",
    },
  },
  "@keyframes gain": {
    "0%": { opacity: 0, transform: "translate(1.5em, -10%) scale(0.6)" },
    "20%": { opacity: 1, transform: "translate(0, -60%) scale(1.15)" },
    "100%": { opacity: 0, transform: "translate(0, -180%) scale(1)" },
  },
  "@keyframes spend": {
    "0%": { opacity: 0, transform: "translate(0, -50%) scale(1.2)" },
    "15%": { opacity: 1 },
    "100%": { opacity: 0, transform: "translate(0, 90%) scale(0.9)" },
  },
  gain: { color: "white", animation: `$gain ${POP_MS}ms ease-out forwards` },
  spend: { color: theme.color.accent.light, animation: `$spend ${POP_MS}ms ease-in forwards` },
  // one socket per build slot; the next one fills up while it refills
  sockets: {
    display: "flex",
    flexWrap: "wrap-reverse",
    justifyContent: "flex-end",
    maxWidth: "16vw",
    margin: "0 5px 0 0",
    [theme.breakpoints.orientation.portrait]: { maxWidth: "34vw" },
  },
  socket: {
    width: "1.9vw",
    height: "1.9vw",
    margin: "0.2vw",
    borderRadius: "0.5vw",
    border: `0.25vw solid ${theme.color.secondary.dark}`,
    background: "rgba(255, 255, 255, 0.25)",
    transition: "background 0.3s",
    [theme.breakpoints.orientation.portrait]: { width: "4vw", height: "4vw", borderRadius: "1vw" },
  },
  full: { background: theme.color.gold.light },
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  },
}));

// progress (0..1) of the soonest timer among the entities that have one
const nextTimerProgress = (entities, timerOf, intervalOf, t) => {
  let next;
  entities.forEach((entity) => {
    const at = timerOf(entity);
    if (typeof at === "number" && (typeof next === "undefined" || at < next.at)) {
      next = { at, interval: intervalOf(entity) };
    }
  });
  if (typeof next === "undefined" || !(next.interval > 0)) {
    return undefined;
  }
  return Math.min(1, Math.max(0, 1 - (next.at - t) / next.interval));
};

// "+12" when cacao comes in, "-40" when it is spent; each pop removes itself
const useCacaoPops = (cacao, matchKey) => {
  const [pops, setPops] = useState([]);
  const previous = useRef({ cacao, matchKey });
  const nextId = useRef(0);
  useEffect(() => {
    const before = previous.current;
    previous.current = { cacao, matchKey };
    if (before.matchKey !== matchKey || typeof before.cacao !== "number" || cacao === before.cacao) {
      return;
    }
    const pop = { id: nextId.current++, amount: cacao - before.cacao };
    setPops((current) => [...current.slice(-5), pop]);
    setTimeout(() => setPops((current) => current.filter((p) => p.id !== pop.id)), POP_MS);
  }, [cacao, matchKey]);
  return pops;
};

const ResourcePanel = ({ view }) => {
  const classes = useStyles();
  const theme = useTheme();
  const t = useMatchTime(10);
  const running = typeof view !== "undefined" && view.phase === engine.MatchPhase.RUNNING;
  const me = running ? view.players[view.viewer] : undefined;
  const pops = useCacaoPops(me ? me.cacao : undefined, running ? `${view.viewer}:${view.startedAt}` : undefined);
  if (!running) {
    return null;
  }
  const own = engine.entitiesOf(view, view.viewer);
  const capacity = engine.buildCapacity(view, view.viewer);
  const cacaoProgress = nextTimerProgress(
    own,
    (entity) => entity.cacaoAt,
    (entity) => engine.producerStats(view, view.viewer, entity).intervalMs,
    t
  );
  const buildProgress =
    me.buildTokens < capacity
      ? nextTimerProgress(
          own,
          (entity) => entity.buildAt,
          (entity) => engine.generatorStats(view, view.viewer, entity).intervalMs,
          t
        )
      : undefined;

  return (
    <div className={classes.panel} data-testid="resource-panel">
      <div className={classes.info}>
        <div className={classes.pops}>
          {pops.map((pop) => (
            <span key={pop.id} className={`${classes.pop} ${pop.amount > 0 ? classes.gain : classes.spend}`}>
              {pop.amount > 0 ? `+${pop.amount}` : `−${-pop.amount}`}
              <i />
            </span>
          ))}
        </div>
        <p data-testid="cacao">{me.cacao}</p>
        <div className={classes.icon}>
          <div style={{ backgroundImage: "url(/images/cacao-icon.svg)" }} />
          {typeof cacaoProgress === "number" ? <ProgressRing progress={cacaoProgress} color={theme.color.gold.light} /> : null}
        </div>
      </div>
      <div className={classes.info}>
        <div
          className={classes.sockets}
          data-testid="build-tokens"
          data-tokens={me.buildTokens}
          data-capacity={capacity}
        >
          <span className={classes.srOnly}>{`${me.buildTokens}/${capacity}`}</span>
          {Array.from({ length: capacity }, (_, i) => {
            const filling = i === me.buildTokens && typeof buildProgress === "number";
            const style = filling
              ? {
                  background: `linear-gradient(0deg, ${theme.color.gold.light} ${Math.round(
                    buildProgress * 100
                  )}%, rgba(255,255,255,0.25) ${Math.round(buildProgress * 100)}%)`,
                }
              : undefined;
            return <div key={i} className={`${classes.socket} ${i < me.buildTokens ? classes.full : ""}`} style={style} />;
          })}
        </div>
        <div className={classes.icon}>
          <div style={{ backgroundImage: "url(/images/buildings-icon.svg)" }} />
        </div>
      </div>
    </div>
  );
};

const mapStateToProps = (state) => ({ view: state.match.view });

export default connect(mapStateToProps)(ResourcePanel);
