import React from "react";
import PropTypes from "prop-types";
import { createUseStyles } from "react-jss";
import withDefaultProps from "../../helper/defaultProps";

const useStyles = createUseStyles((theme) => ({
  list: {
    fontFamily: "var(--font-display)",
    fontSize: (props) => (props.size === "small" ? "2.5vw" : "3vw"),
    "-webkit-text-stroke": `0.1vw ${theme.color.secondary.dark}`,
    "& > :nth-child(odd)": {
      backgroundColor: theme.color.secondary.dark,
    },
    display: "table",
    [theme.breakpoints.orientation.portrait]: {
      fontSize: (props) => (props.size === "small" ? "3vh" : "3.5vh"),
      "-webkit-text-stroke": `0.1vh ${theme.color.secondary.dark}`,
    },
    "-webkit-font-smoothing": "antialiased",
  },
  row: {
    cursor: "pointer",
    userSelect: "none",
    display: "table-row",
  },
  cell: {
    display: "table-cell",
    borderTop: "4px solid transparent",
    borderBottom: "4px solid transparent",
  },
  name: {
    width: "100%",
    textAlign: "center",
    borderLeft: "8px solid transparent",
    borderRight: "8px solid transparent",
  },
  rank: {
    borderLeft: "8px solid transparent",
    whiteSpace: "nowrap",
  },
  own: {
    backgroundColor: `${theme.color.accent.light} !important`,
    color: "white",
  },
  icon: {
    padding: "1vw",
    [theme.breakpoints.orientation.portrait]: {
      padding: "1vh",
    },
  },
}));

// no rank yet (no rated match): a dash instead of rank and rating
const NO_RANK = "–";
const isRanked = (player) =>
  player.ranking !== null && typeof player.ranking !== "undefined";

const PlayerList = (componentProps) => {
  const props = withDefaultProps(componentProps, defaultProps);
  const { username, players, showProfile, withScore } = props;
  const classes = useStyles(props);

  const openPlayerProfile = (player) => {
    const isPlayer = username === player.name;
    if (!isPlayer) {
      showProfile({ opponent: player });
    }
  };

  if (players.length > 0) {
    return (
      <div style={props.style} className={`${classes.list} ${props.className}`}>
        {players.map((player, i) => {
          const isPlayer = username === player.name;
          return (
            <div
              key={i}
              data-testid={isPlayer ? "player-list-own" : undefined}
              className={
                isPlayer ? `${classes.own} ${classes.row}` : classes.row
              }
            >
              {withScore ? (
                <div
                  onClick={() => openPlayerProfile(player)}
                  className={`${classes.cell} ${classes.rank}`}
                  data-testid="player-list-rank"
                >
                  {isRanked(player) ? `${player.ranking}.` : NO_RANK}
                </div>
              ) : null}
              <div
                onClick={() => openPlayerProfile(player)}
                className={`${classes.cell} ${classes.name}`}
              >
                {player.name}
              </div>
              {withScore ? (
                <>
                  <div
                    style={{ borderRight: "4px solid transparent" }}
                    className={classes.cell}
                  >
                    {isRanked(player) ? player.score : NO_RANK}
                  </div>
                  <div
                    className={`${classes.icon} ${classes.cell}`}
                    style={{
                      background: `url(/images/score.svg) no-repeat`,
                      backgroundSize: "100% 100%",
                      borderRight: "0.3vw solid transparent",
                    }}
                  />
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  } else {
    return null;
  }
};

const defaultProps = {
  withScore: false,
  style: {},
  className: "",
  username: "",
  size: "small",
};

PlayerList.propTypes = {
  showProfile: PropTypes.func.isRequired,
  players: PropTypes.array.isRequired,
  withScore: PropTypes.bool,
  style: PropTypes.object,
  username: PropTypes.string,
  className: PropTypes.string,
  size: PropTypes.oneOf(["small", "medium"]),
};

export default PlayerList;
