import React from "react";
import { connect } from "react-redux";
import { createUseStyles } from "react-jss";
import { engine } from "@battlechoc/battlechoc-shared-functions";

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
    "& small": { fontSize: "60%", marginLeft: "0.3em" },
  },
  icon: {
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
}));

const ResourcePanel = ({ view }) => {
  const classes = useStyles();
  if (typeof view === "undefined" || view.phase !== engine.MatchPhase.RUNNING) {
    return null;
  }
  const me = view.players[view.viewer];
  const capacity = engine.buildCapacity(view, view.viewer);
  const income = Math.round(engine.cacaoPerSecond(view, view.viewer) * 10);

  return (
    <div className={classes.panel} data-testid="resource-panel">
      <div className={classes.info}>
        <p data-testid="cacao">
          {me.cacao}
          <small>{`+${income}/10s`}</small>
        </p>
        <div className={classes.icon}>
          <div style={{ backgroundImage: "url(/images/cacao-icon.svg)" }} />
        </div>
      </div>
      <div className={classes.info}>
        <p data-testid="build-tokens">{`${me.buildTokens}/${capacity}`}</p>
        <div className={classes.icon}>
          <div style={{ backgroundImage: "url(/images/buildings-icon.svg)" }} />
        </div>
      </div>
    </div>
  );
};

const mapStateToProps = (state) => ({ view: state.match.view });

export default connect(mapStateToProps)(ResourcePanel);
