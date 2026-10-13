import React from "react";
import { connect } from "react-redux";
import {
  EntityType,
  engine,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import { selectActiveGame } from "../../match/matchSlice";
import { submit, ignoreRuleErrors } from "../match/submit";
import useMatchTime from "../match/useMatchTime";
import { Jukebox } from "../misc";
import { createUseStyles } from "react-jss";

const useStyles = createUseStyles((theme) => ({
  realtimeHint: {
    alignSelf: "center",
    textAlign: "center",
    margin: "0 3vw",
    fontFamily: "Bangers",
    fontSize: "3vw",
    "-webkit-text-stroke": `0.15vw ${theme.color.secondary.dark}`,
    "& p": { margin: "0.3em 0" },
    [theme.breakpoints.orientation.portrait]: { fontSize: "6vw" },
  },
  page: {
    marginTop: 20,
    display: "flex",
    color: "white",
    height: "100%",
    flexDirection: "column",
    justifyContent: "center",
    [theme.breakpoints.orientation.landscape]: {
      flexDirection: "row",
    },
  },
  button: {
    background: `linear-gradient(0deg, ${theme.color.secondary.dark} 0%, ${theme.color.secondary.light} 70%)`,
    height: "28vh",
    width: "28vh",
    border: `0.1vh solid ${theme.color.secondary.light}`,
    borderRadius: "50%",
    display: "flex",
    position: "relative",
    alignSelf: "center",
    alignItems: "center",
    margin: 10,
    justifyContent: "center",
    cursor: "pointer",
    [theme.breakpoints.orientation.landscape]: {
      height: "30vw",
      width: "30vw",
      border: `0.1vw solid ${theme.color.secondary.light}`,
    },
  },
  cream: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    position: "absolute",
    top: 0,
    left: 0,
    "& > div": {
      padding: "4.5vw",
      backgroundSize: "100% 100%",
      backgroundRepeat: "no-repeat",
      backgroundImage: "url(/images/cream.svg)",
      [theme.breakpoints.orientation.portrait]: {
        padding: "4.2vh",
      },
    },
    "& > p": {
      position: "absolute",
      fontFamily: "Bangers",
      margin: "0 0 0 -3px",
      textShadow: "0.1vw 0.1vw 0.3vw white",
      color: theme.color.secondary.dark,
      fontSize: "4vw",
      [theme.breakpoints.orientation.portrait]: {
        fontSize: "3.7vh",
      },
    },
  },
  creamy: {
    position: "absolute",
    backgroundSize: "100% 100%",
    backgroundRepeat: "no-repeat",
    backgroundImage: "url(/images/cream.svg)",
    transform: "rotateZ(-135deg)",
  },
  six: {
    flex: "1 0 16.666%",
    "& $creamy": {
      padding: "1.25vw",
      [theme.breakpoints.orientation.portrait]: {
        padding: "1.2vh",
      },
    },
  },
  eight: {
    flex: "1 0 12.5%",
    "& $creamy": {
      padding: "1.2vw",
      [theme.breakpoints.orientation.portrait]: {
        padding: "1.1vh",
      },
    },
  },
  ten: {
    flex: "1 0 10%",
    "& $creamy": {
      padding: "1.15vw",
      [theme.breakpoints.orientation.portrait]: {
        padding: "1vh",
      },
    },
  },
  fields: {
    width: "20vw",
    height: "20vw",
    display: "flex",
    flexWrap: "wrap",
    transform: "rotateZ(135deg)",
    "& > div": {
      borderRadius: "15%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    },
    [theme.breakpoints.orientation.portrait]: {
      width: "18vh",
      height: "18vh",
    },
  },
  white: {
    backgroundColor: "#bdbd83",
  },
  brown: {
    backgroundColor: "#523112",
  },
  black: {
    backgroundColor: "#140e09",
  },
}));

const GameStartSelection = (props) => {
  const classes = useStyles(props);
  const { game } = props;
  const now = useMatchTime(4);
  const unlocked = game.fieldChooser === game.viewer;

  const choose = (fieldIndex) => {
    if (unlocked) {
      Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
      submit(engine.MatchActionTypes.chooseField, { fieldIndex }).catch(ignoreRuleErrors);
    }
  };

  const drawCell = (cell, i) => {
    const creamy = cell.occupiedBy
      .map((entity) => entity.type)
      .includes(EntityType.CREAM);
    const sizeClassName =
      game.board.size.cols === 6
        ? classes.six
        : game.board.size.cols === 8
        ? classes.eight
        : classes.ten;
    return (
      <div key={i} className={`${classes[cell.previewStyle]} ${sizeClassName}`}>
        <div className={creamy ? classes.creamy : ""} />
      </div>
    );
  };

  return (
    <div className={classes.page}>
      <div
        className={(unlocked ? "active " : "inactive ") + classes.button}
        onClick={() => choose(0)}
      >
        {(() => {
          if (typeof game.board !== "undefined") {
            const creamedCells = game.board.fields[0].grid.filter((cell) =>
              cell.occupiedBy
                .map((entity) => entity.type)
                .includes(EntityType.CREAM)
            );
            return (
              <div className={classes.cream}>
                <div />
                <p>{creamedCells.length}</p>
              </div>
            );
          }
        })()}
        <div className={classes.fields}>
          {(() => {
            if (typeof game.board !== "undefined") {
              return game.board.fields[0].grid.map(drawCell);
            }
          })()}
        </div>
      </div>

      <div className={classes.realtimeHint}>
        <p>{unlocked ? t(tr.MATCH_CHOOSE_FIELD) : t(tr.MATCH_OPPONENT_CHOOSES_FIELD)}</p>
        <p>{Math.max(0, Math.ceil((game.phaseEndsAt - now) / 1000))}</p>
      </div>

      <div
        className={(unlocked ? "active " : "inactive ") + classes.button}
        onClick={() => choose(1)}
      >
        {(() => {
          if (typeof game.board !== "undefined") {
            const creamedCells = game.board.fields[1].grid.filter((cell) =>
              cell.occupiedBy
                .map((entity) => entity.type)
                .includes(EntityType.CREAM)
            );
            return (
              <div className={classes.cream}>
                <div />
                <p>{creamedCells.length}</p>
              </div>
            );
          }
        })()}
        <div className={classes.fields}>
          {(() => {
            if (typeof game.board !== "undefined") {
              return game.board.fields[1].grid.map(drawCell);
            }
          })()}
        </div>
      </div>
    </div>
  );
};

const mapStateToProps = (state) => ({
  game: selectActiveGame(state),
});

const GameStartSelectionContainer = connect(mapStateToProps)(GameStartSelection);

export default GameStartSelectionContainer;
