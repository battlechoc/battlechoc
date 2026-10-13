import React from "react";
import { connect } from "react-redux";
import { createUseStyles } from "react-jss";
import {
  engine,
  EntityType,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import { matchSession } from "../../match/LocalMatchHost";
import { liveConnection } from "../../match/liveConnection";
import useMatchTime from "./useMatchTime";

const { MatchPhase, OutcomeReason } = engine;

const useStyles = createUseStyles((theme) => ({
  banner: {
    position: "absolute",
    top: 5,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 3,
    textAlign: "center",
    pointerEvents: "none",
    userSelect: "none",
    color: "white",
    fontFamily: "Bangers",
    "-webkit-text-stroke": `0.15vw ${theme.color.secondary.dark}`,
    "-webkit-font-smoothing": "antialiased",
    "& p": { margin: 0, fontSize: "3vw", [theme.breakpoints.orientation.portrait]: { fontSize: "6vw" } },
    "& .timer": { fontSize: "2.4vw", [theme.breakpoints.orientation.portrait]: { fontSize: "5vw" } },
    "& .warning": { color: theme.color.accent.light },
  },
  // longer messages go below the row of action buttons
  message: {
    top: "calc(10px + 8vw)",
    width: "90vw",
    [theme.breakpoints.orientation.portrait]: { top: "calc(10px + 16vw)" },
  },
  countdown: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    zIndex: 3,
    pointerEvents: "none",
    color: theme.color.gold.light,
    fontFamily: "Bangers",
    fontSize: "18vw",
    "-webkit-text-stroke": `0.5vw ${theme.color.brown.light}`,
  },
  paused: {
    position: "absolute",
    inset: 0,
    zIndex: 6,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(30, 15, 10, 0.55)",
    color: "white",
    fontFamily: "Bangers",
    cursor: "pointer",
    "& p": { margin: 0, fontSize: "6vw" },
    "& small": { fontSize: "2.5vw", [theme.breakpoints.orientation.portrait]: { fontSize: "5vw" } },
  },
}));

const seconds = (ms) => Math.max(0, Math.ceil(ms / 1000));
const clockText = (ms) => {
  const total = seconds(ms);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

const MatchBanner = ({ view, paused, online, presence, liveStatus, pending }) => {
  const classes = useStyles();
  const now = useMatchTime(4);
  if (typeof view === "undefined") {
    return null;
  }
  const me = view.players[view.viewer];

  let banner = null;
  let message = null;
  if (view.phase === MatchPhase.PLACEMENT) {
    const grid = view.board.fields[me.fieldIndex].grid;
    const placed = grid.some((cell) => cell.occupiedBy.some((entity) => entity.type === EntityType.FACTORY));
    banner = <p className="timer">{seconds(view.phaseEndsAt - now)}</p>;
    message = <p>{placed ? t(tr.MATCH_WAIT_FOR_OPPONENT) : t(tr.MATCH_PLACE_FACTORY)}</p>;
  } else if (view.phase === MatchPhase.RUNNING) {
    const stunned = now < me.stunnedUntil;
    const left = view.endsAt - now;
    banner = <p className={`timer ${left < 60000 ? "warning" : ""}`} data-testid="time-left">{clockText(left)}</p>;
    message = stunned ? <p className="warning">{t(tr.MATCH_STUNNED)}</p> : null;
  } else if (view.phase === MatchPhase.ENDED && view.outcome && view.outcome.reason === OutcomeReason.TIME_LIMIT) {
    message = <p>{t(tr.MATCH_TIME_UP)}</p>;
  }
  // online: our own connection first, then the opponent's
  if (online && view.phase !== MatchPhase.ENDED) {
    if (liveStatus !== "online") {
      message = <p className="warning" data-testid="reconnecting">{t(tr.MATCH_RECONNECTING)}</p>;
    } else if (presence && presence.online === false && presence.forfeitAt) {
      const left = presence.forfeitAt - liveConnection.clock.serverNow();
      message = (
        <p className="warning" data-testid="opponent-left">
          {t(tr.MATCH_OPPONENT_LEFT)} {seconds(left)}
        </p>
      );
    }
  }

  return (
    <>
      <div className={classes.banner} data-testid="match-banner" data-pending={pending}>
        {banner}
      </div>
      {message ? <div className={`${classes.banner} ${classes.message}`}>{message}</div> : null}
      {view.phase === MatchPhase.COUNTDOWN ? (
        <div className={classes.countdown}>{seconds(view.phaseEndsAt - now) || t(tr.MATCH_GO)}</div>
      ) : null}
      {paused && view.phase !== MatchPhase.ENDED ? (
        <div
          className={classes.paused}
          data-testid="paused-overlay"
          onClick={() => matchSession.host && matchSession.host.resume()}
        >
          <p>{t(tr.MATCH_PAUSED)}</p>
          <small>{t(tr.MATCH_RESUME)}</small>
        </div>
      ) : null}
    </>
  );
};

const mapStateToProps = (state) => ({
  view: state.match.view,
  paused: state.match.paused,
  online: state.match.online,
  pending: state.match.pending,
  presence: state.live.opponentPresence,
  liveStatus: state.live.status,
});

export default connect(mapStateToProps)(MatchBanner);
