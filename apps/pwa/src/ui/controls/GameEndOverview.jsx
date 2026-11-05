import React, { useState, useRef, useEffect } from "react";
import PropTypes from "prop-types";
import Fab from "./Fab";
import Button from "./Button";
import {
  translate as t,
  translationKeys as tr,
  achievementXp,
} from "@battlechoc/battlechoc-shared-functions";
import IngredientBag from "../ingredients/IngredientBag";
import { createUseStyles } from "react-jss";
import confetti from "canvas-confetti";
import CountUpModule from "react-countup";

// the default import of this CommonJS module is its module.exports object
const CountUp = CountUpModule.default ?? CountUpModule;

const useStyles = createUseStyles((theme) => ({
  overview: {
    height: "100%",
    width: "100%",
    position: "absolute",
    zIndex: 100,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    fontFamily: theme.font.display,
    fontSize: theme.font.size.lg,
    color: "white",
    "-webkit-text-stroke": `${theme.font.stroke} ${theme.color.secondary.dark}`,
    "-webkit-font-smoothing": "antialiased",
  },
  headline: {
    textAlign: "center",
    marginTop: `max(2vh, ${theme.edge.top})`,
    padding: `0 ${theme.edge.right} 0 ${theme.edge.left}`,
    fontSize: theme.font.size.xxl,
  },
  total: {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-evenly",
  },
  actions: {
    width: "100%",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "1.5em",
    marginBottom: "8vh",
  },
  rematchStatus: {
    width: "100%",
    margin: "0 0 0.6em",
    textAlign: "center",
    color: "white",
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
  },
  xp: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "center",
    "& span": {
      fontSize: theme.font.size.xxl,
      marginRight: "0.1em",
    },
    "& > small": {
      fontSize: theme.font.size.lg,
      marginLeft: "0.2em",
    },
  },
  award: {
    display: "flex",
    flexDirection: "column",
    opacity: 1,
    transition: "opacity .25s ease-in-out",
    textAlign: "center",
    "& > div": {
      minHeight: "1.2em",
    },
  },
  table: {
    display: "table",
    margin: "0 auto",
    width: "fit-content",
    borderSpacing: "1em 0.25em",
    color: theme.color.primary.light,
    "-webkit-text-stroke": `${theme.font.stroke} ${theme.color.primary.dark}`,
    "-webkit-font-smoothing": "antialiased",
    "& > div": {
      display: "table-row",
      "& > div": {
        textAlign: "left",
        display: "table-cell",
      },
    },
  },
  bag: {
    fontSize: theme.font.size.md,
  },
  confetti: {
    position: "absolute",
    zIndex: -1,
    width: "100%",
    height: "100%",
  },
}));

// the cocoa that achievements gave instead of a special ingredient is shown as one item;
// special ingredients and the daily fresh batch keep their source
const bagItems = (drops) => {
  const fallback = drops.filter((drop) => drop.ingredient === "COCOA" && drop.achievement !== "FRESHBATCH");
  const cocoa = fallback.reduce((sum, drop) => sum + drop.amount, 0);
  return [
    ...(cocoa > 0 ? [{ ingredient: "COCOA", amount: cocoa }] : []),
    ...drops.filter((drop) => !fallback.includes(drop)),
  ];
};

// The confetti: chocolate, caramel and the game's sweet colours. canvas-confetti colours a burst's
// particles in order (colors[i % colors.length]), so the bursts of two particles each that rain
// down here took only the first two colours of its palette, blue and purple: every burst gets
// two of these at random instead.
const CONFETTI_COLORS = [
  "#a0652f", // milk chocolate (dark chocolate disappears on the dark overview)
  "#f3e5c8", // white chocolate
  "#d9913b", // caramel
  "#fad25a", // gold
  "#ff4e85", // raspberry
  "#90d01b", // pistachio
  "#ff9ec4", // strawberry cream
  "#3190c3", // blueberry
];
const pickColors = (count) =>
  Array.from({ length: count }, () => CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]);

const GameEndOverview = (props) => {
  const classes = useStyles();
  const { outcome, awards, isWinner, verified, drops } = props;

  const pointer = useRef(0);
  const confettiCanvas = useRef();
  const highlight = useRef();
  const [award, setAward] = useState(pointer.current);
  const [count, setCount] = useState(awards.length > 0 ? awards[0].xp : 0);
  let headline = t(tr.MESSAGE_WIN_GAME);
  if (outcome !== "won") {
    headline = t(tr.MESSAGE_LOST_GAME);
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // the award animation waits between steps; once the overview is closed it must stop
  const closed = useRef(false);
  useEffect(() => {
    // set again on mount: StrictMode in development unmounts and mounts once more
    closed.current = false;
    return () => {
      closed.current = true;
    };
  }, []);
  const fadeHighlight = (opacity) => {
    if (highlight.current) {
      highlight.current.style.opacity = opacity;
    }
  };

  useEffect(() => {
    const startGettingAwards = async () => {
      await sleep(2200);
      if (closed.current) {
        return;
      }
      fadeHighlight(0);
      await sleep(300);
      if (!closed.current) {
        showNextAward();
      }
    };

    if (outcome === "won") {
      const shootConfetti = confetti.create(confettiCanvas.current, {
        resize: true,
      });
      // let it rain confetti until the overview is closed: big pieces, one at a time. (A burst
      // of several starts them all at one point with no speed, and they fell as little
      // clusters; the user saw them, 2026-11-01.)
      const interval = setInterval(
        () =>
          shootConfetti({
            particleCount: 1,
            colors: pickColors(1),
            shapes: ["square", "circle"],
            scalar: 1.6,
            startVelocity: 0,
            gravity: 0.6,
            ticks: 400,
            origin: { x: Math.random(), y: -0.1 },
          }),
        25
      );
      startGettingAwards();

      return () => {
        clearInterval(interval);
        shootConfetti.reset();
      };
    }
    startGettingAwards();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome]);

  // losers get half the XP of their achievements
  const xp = achievementXp(awards, isWinner);

  const showNextAward = (skip = false) => {
    pointer.current++;
    if (skip) {
      pointer.current = awards.length;
      setAward(pointer.current);
    } else if (pointer.current < awards.length + 1) {
      setAward(pointer.current);
    }
  };

  useEffect(() => {
    fadeHighlight(1);
    const timeout = setTimeout(async () => {
      fadeHighlight(0);
      await sleep(300);
      if (!closed.current) {
        showNextAward();
      }
    }, 2200);

    if (award > 0 && award < awards.length) {
      setCount((current) => current + awards[award].xp);
    }

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [award, awards]);

  let title = "";
  let subtitle = "";
  if (award < awards.length) {
    title = `${awards[award].title()} +${awards[award].xp}`;
    subtitle = awards[award].subtitle();
  }

  const counterView = (
    <CountUp
      duration={2.5}
      useEasing={false}
      end={count}
      preserveValue={true}
    />
  );

  return (
    <div className={classes.overview}>
      <canvas className={classes.confetti} ref={confettiCanvas} />
      <div className={classes.headline}>{headline}</div>
      <div className={classes.total}>
        <div className={classes.xp} data-testid="end-xp">
          <span>{award < awards.length ? counterView : xp}</span>
          <small>{t(tr.END_XP)}</small>
        </div>
        <div className={classes.table}>
          {awards.map((entry, index) => (
            <div
              key={index}
              style={index < award ? null : { visibility: "hidden" }}
            >
              <div>{entry.title()}</div>
              <div>{`+${entry.xp}`}</div>
            </div>
          ))}
        </div>
        <div
          ref={highlight}
          style={
            award < awards.length
              ? { opacity: 1 }
              : { opacity: 0, visibility: "hidden" }
          }
          className={classes.award}
        >
          <div>{title}</div>
          <div>{subtitle}</div>
        </div>
        {award >= awards.length ? (
          <div className={classes.bag}>
            {verified ? (
              <IngredientBag
                items={bagItems(drops || [])}
                message={typeof drops === "undefined" ? t(tr.END_BAG_WAITING) : undefined}
              />
            ) : (
              <IngredientBag
                items={[{ ingredient: "COCOA", amount: 0 }]}
                greyed
                showSources={false}
                message={t(tr.END_BAG_OFFLINE)}
              />
            )}
          </div>
        ) : null}
      </div>

      {props.rematchStatus ? (
        <p className={classes.rematchStatus} data-testid="rematch-status">
          {props.rematchStatus}
        </p>
      ) : null}
      <div className={classes.actions}>
        {props.rematch ? (
          <Button size="small" data-testid="rematch" onClick={props.rematch}>
            {t(tr.REMATCH)}
          </Button>
        ) : null}
        {award < awards.length ? (
          <Fab
            color="accent"
            icon="fast-forward"
            onClick={() => showNextAward(true)}
          />
        ) : (
          <Fab
            color="secondary"
            icon="done"
            onClick={() => props.finishGame(xp)}
          />
        )}
      </div>
    </div>
  );
};

GameEndOverview.propTypes = {
  finishGame: PropTypes.func.isRequired,
  outcome: PropTypes.string.isRequired,
  awards: PropTypes.array.isRequired,
  isWinner: PropTypes.bool.isRequired,
  // online matches are verified by the server, which sends the drops (undefined while pending)
  verified: PropTypes.bool.isRequired,
  drops: PropTypes.array,
  // after a challenge match: asks the opponent for another one; rematchStatus says how it goes
  rematch: PropTypes.func,
  rematchStatus: PropTypes.string,
};

export default GameEndOverview;
