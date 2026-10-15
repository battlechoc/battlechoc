import React, { useState, useRef, useEffect } from "react";
import PropTypes from "prop-types";
import Fab from "./Fab";
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
    fontFamily: "Bangers",
    fontSize: "8vh",
    color: "white",
    "-webkit-text-stroke": `0.05vh ${theme.color.secondary.dark}`,
    "-webkit-font-smoothing": "antialiased",
    [theme.breakpoints.orientation.portrait]: {
      fontSize: "5vh",
    },
  },
  headline: {
    textAlign: "center",
    marginTop: "2vh",
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
    marginBottom: "8vh",
  },
  xp: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "center",
    "& span": {
      fontSize: "10vh",
      marginRight: "0.5vh",
      [theme.breakpoints.orientation.portrait]: {
        fontSize: "6.5vh",
      },
    },
    "& > small": {
      fontSize: "5vh",
      marginLeft: "1vh",
      [theme.breakpoints.orientation.portrait]: {
        fontSize: "3.5vh",
      },
    },
  },
  award: {
    display: "flex",
    flexDirection: "column",
    fontSize: "5vh",
    opacity: 1,
    transition: "opacity .25s ease-in-out",
    textAlign: "center",
    "& > div": {
      minHeight: "5.5vh",
    },
  },
  table: {
    display: "table",
    fontSize: "5vh",
    margin: "0 auto",
    width: "fit-content",
    borderSpacing: "5vw 1vh",
    color: theme.color.primary.light,
    "-webkit-text-stroke": `0.05vh ${theme.color.primary.dark}`,
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
    fontSize: "4vh",
    [theme.breakpoints.orientation.portrait]: { fontSize: "2.6vh" },
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

  useEffect(() => {
    const startGettingAwards = async () => {
      await sleep(2200);
      highlight.current.style.opacity = 0;
      await sleep(300);
      showNextAward();
    };

    if (outcome === "won") {
      const shootConfetti = confetti.create(confettiCanvas.current, {
        resize: true,
      });
      // let it rain confetti until the overview is closed
      const interval = setInterval(
        () =>
          shootConfetti({
            particleCount: 2,
            startVelocity: 0,
            gravity: 0.6,
            ticks: 400,
            origin: { x: Math.random(), y: -0.1 },
          }),
        100
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
    highlight.current.style.opacity = 1;
    const timeout = setTimeout(async () => {
      highlight.current.style.opacity = 0;
      await sleep(300);
      showNextAward();
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

      <div className={classes.actions}>
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
};

export default GameEndOverview;
