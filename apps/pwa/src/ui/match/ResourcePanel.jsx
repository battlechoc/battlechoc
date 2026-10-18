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
      fontFamily: "var(--font-display)",
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
    fontFamily: "var(--font-display)",
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
  // one small donut per build slot, like the donut above the factory: a whole donut per
  // free slot, a grey one per used slot, the next one grows piece by piece while it refills
  slots: {
    display: "flex",
    flexWrap: "wrap-reverse",
    justifyContent: "flex-end",
    maxWidth: "17vw",
    margin: "0 5px 0 0",
    [theme.breakpoints.orientation.portrait]: { maxWidth: "34vw" },
  },
  slot: {
    position: "relative",
    width: "3vw",
    height: "3vw",
    margin: "0.15vw",
    filter: `drop-shadow(0 0 0.15vw ${theme.color.secondary.dark})`,
    [theme.breakpoints.orientation.portrait]: { width: "5.4vw", height: "5.4vw", margin: "0.3vw" },
  },
  // a donut image (--donut), optionally glazed with --tint where the image is opaque
  layer: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    backgroundImage: "var(--donut)",
    backgroundSize: "100% 100%",
    backgroundRepeat: "no-repeat",
    "&::after": {
      content: '""',
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      background: "var(--tint, transparent)",
      WebkitMaskImage: "var(--donut)",
      WebkitMaskSize: "100% 100%",
      WebkitMaskRepeat: "no-repeat",
      maskImage: "var(--donut)",
      maskSize: "100% 100%",
      maskRepeat: "no-repeat",
    },
  },
  grey: { "--tint": "rgba(118, 112, 108, 0.88)", opacity: 0.92 },
  ready: { "--tint": "rgba(144, 208, 27, 0.55)" },
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  },
}));

const donut = (percent) => ({ "--donut": `url(/images/progress-${percent}.svg)` });

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
          className={classes.slots}
          data-testid="build-tokens"
          data-tokens={me.buildTokens}
          data-capacity={capacity}
        >
          <span className={classes.srOnly}>{`${me.buildTokens}/${capacity}`}</span>
          {Array.from({ length: capacity }, (_, i) => {
            const full = i < me.buildTokens;
            // the donut steps of the 3D indicator: ten pieces, the first one as soon as it starts
            const step =
              i === me.buildTokens && typeof buildProgress === "number" && buildProgress > 0
                ? Math.max(1, Math.min(10, Math.round(buildProgress * 10)))
                : 0;
            return (
              <div key={i} className={classes.slot} data-slot={full ? "full" : step > 0 ? `filling-${step * 10}` : "empty"}>
                {full ? null : <i className={`${classes.layer} ${classes.grey}`} style={donut(100)} />}
                {full || step > 0 ? (
                  <i
                    className={`${classes.layer} ${full && me.buildTokens >= capacity ? classes.ready : ""}`}
                    style={donut(full ? 100 : step * 10)}
                  />
                ) : null}
              </div>
            );
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
