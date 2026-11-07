import { createUseStyles } from "react-jss";
import withDefaultProps from "../../helper/defaultProps";
import { outlined } from "../styles";

// one dark blue strip per player (the own one pink): rank, name (shortened with an ellipsis
// when it is long) and rating; the list is as wide as its dialog
const useStyles = createUseStyles((theme) => ({
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "0.3em",
    width: "100%",
    fontFamily: theme.font.display,
    fontSize: `calc(${theme.font.size.md} * 1.2)`,
    ...outlined(theme, "#0f3045"),
  },
  row: {
    display: "flex",
    alignItems: "center",
    padding: "0.25em 0.7em",
    borderRadius: "0.25em",
    backgroundColor: theme.color.secondary.dark,
    cursor: "pointer",
    userSelect: "none",
  },
  own: {
    backgroundColor: theme.color.accent.light,
    "-webkit-text-stroke-color": theme.color.accent.dark,
  },
  rank: {
    minWidth: "2.4em",
    paddingRight: "0.6em",
    textAlign: "right",
    whiteSpace: "nowrap",
  },
  name: {
    flex: "1 1 auto",
    minWidth: 0,
    textAlign: "left",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  score: {
    paddingLeft: "0.6em",
  },
  icon: {
    flex: "0 0 auto",
    width: "1.1em",
    height: "1.1em",
    marginLeft: "0.25em",
    background: "url(/images/score.svg) no-repeat center",
    backgroundSize: "contain",
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
                isPlayer ? `${classes.row} ${classes.own}` : classes.row
              }
              onClick={() => openPlayerProfile(player)}
            >
              {withScore ? (
                <div className={classes.rank} data-testid="player-list-rank">
                  {isRanked(player) ? `${player.ranking}.` : NO_RANK}
                </div>
              ) : null}
              <div className={classes.name} title={player.name}>
                {player.name}
              </div>
              {withScore ? (
                <>
                  <div className={classes.score}>
                    {isRanked(player) ? player.score : NO_RANK}
                  </div>
                  <div className={classes.icon} aria-hidden="true" />
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
};

export default PlayerList;
