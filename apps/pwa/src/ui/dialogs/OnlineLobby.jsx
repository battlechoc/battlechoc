import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { createUseStyles } from "react-jss";
import {
  live,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import Dialog from "./Dialog";
import Button from "../controls/Button";
import { liveLobby } from "../../match/liveLobby";
import { liveConnection } from "../../match/liveConnection";
import { Jukebox } from "../misc";

const { LiveError, InviteClosedReason } = live;

const useStyles = createUseStyles((theme) => ({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: "2vh",
    padding: "2vh 4vw",
    fontFamily: theme.font.display,
    color: theme.color.secondary.dark,
    fontSize: theme.font.size.md,
    [theme.breakpoints.orientation.portrait]: { gap: "2vw" },
    "& p": { margin: 0 },
    "& small": { fontSize: theme.font.size.sm, opacity: 0.8 },
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: "2vw",
    flexWrap: "wrap",
  },
  input: {
    flex: 1,
    minWidth: "30vw",
    fontFamily: "var(--font-display)",
    fontSize: "inherit",
    padding: "1vh 2vh",
    borderRadius: "2vh",
    border: `0.3vh solid ${theme.color.secondary.light}`,
    color: theme.color.secondary.dark,
    outline: "none",
  },
  friends: {
    display: "flex",
    flexWrap: "wrap",
    gap: "1vh",
  },
  friend: {
    padding: "0.5vh 2vh",
    borderRadius: "2vh",
    background: theme.color.secondary.light,
    color: "white",
    cursor: "pointer",
    border: "none",
    fontFamily: theme.font.display,
    fontSize: theme.font.size.md,
  },
  online: {
    background: theme.color.primary.dark,
  },
  error: {
    color: theme.color.accent.dark,
  },
}));

const errorText = {
  [LiveError.PLAYER_NOT_FOUND]: tr.ONLINE_PLAYER_NOT_FOUND,
  [LiveError.PLAYER_OFFLINE]: tr.ONLINE_PLAYER_OFFLINE,
  [LiveError.ALREADY_IN_MATCH]: tr.ONLINE_ALREADY_IN_MATCH,
};

const elapsed = (since) => {
  const total = Math.max(0, Math.floor((liveConnection.clock.serverNow() - since) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

// matchmaking and invites; the match itself starts through liveLobby's onMatch
const OnlineLobby = ({ open, close, live: state, friends }) => {
  const classes = useStyles();
  const [username, setUsername] = useState("");
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    liveLobby.enter().catch(() => {});
    const names = (friends || []).map((friend) => friend.name);
    if (names.length > 0) {
      liveLobby.queryPresence(names).catch(() => {});
    }
    const interval = setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => clearInterval(interval);
  }, [open, friends]);

  const searching = state.queuedSince !== null;
  const waiting = state.outgoingInvite !== null;
  const reachable = state.status === "online";
  const sendInvite = (name) => {
    if (name.trim().length > 0) {
      Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
      liveLobby.invite(name.trim());
    }
  };

  return (
    <Dialog
      open={open}
      close={() => {
        if (searching) {
          liveLobby.leaveQueue();
        }
        close();
      }}
      title={t(tr.ONLINE_TITLE)}
    >
      <div className={classes.root} data-testid="online-lobby">
        {!reachable ? <p data-testid="online-unavailable">{t(tr.ONLINE_UNAVAILABLE)}</p> : null}
        {searching ? (
          <div className={classes.row}>
            <p data-testid="online-searching">
              {t(tr.ONLINE_SEARCHING)} {elapsed(state.queuedSince)}
            </p>
            <Button size="small" color="accent" onClick={() => liveLobby.leaveQueue()}>
              {t(tr.ONLINE_CANCEL)}
            </Button>
          </div>
        ) : (
          <Button
            disabled={!reachable || waiting}
            onClick={() => {
              Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
              liveLobby.joinQueue();
            }}
          >
            {t(tr.ONLINE_RANDOM)}
          </Button>
        )}
        <small>{t(tr.ONLINE_AI_HINT)}</small>
        <p>{t(tr.ONLINE_INVITE_FRIEND)}</p>
        {waiting ? (
          <div className={classes.row}>
            <p data-testid="online-invite-waiting">
              {t(tr.ONLINE_INVITE_SENT)} ({state.outgoingInvite.to})
            </p>
            <Button size="small" color="accent" onClick={() => liveLobby.cancelInvite(state.outgoingInvite.id)}>
              {t(tr.ONLINE_CANCEL)}
            </Button>
          </div>
        ) : (
          <div className={classes.row}>
            <input
              className={classes.input}
              data-testid="online-invite-name"
              placeholder={t(tr.ONLINE_INVITE_PLACEHOLDER)}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && sendInvite(username)}
            />
            <Button size="small" disabled={!reachable || searching} onClick={() => sendInvite(username)}>
              {t(tr.ONLINE_INVITE_SEND)}
            </Button>
          </div>
        )}
        {(friends || []).length > 0 ? (
          <div className={classes.friends}>
            {friends.map((friend) => {
              const isOnline = state.onlinePlayers.includes(friend.name);
              return (
                <button
                  key={friend.name}
                  type="button"
                  className={`${classes.friend} ${isOnline ? classes.online : ""}`}
                  onClick={() => (isOnline ? sendInvite(friend.name) : setUsername(friend.name))}
                >
                  {friend.name}
                  {isOnline ? ` · ${t(tr.ONLINE_ONLINE)}` : ""}
                </button>
              );
            })}
          </div>
        ) : null}
        {state.inviteClosed === InviteClosedReason.DECLINED ? (
          <p className={classes.error}>{t(tr.ONLINE_INVITE_DECLINED)}</p>
        ) : null}
        {state.inviteClosed === InviteClosedReason.EXPIRED ? (
          <p className={classes.error}>{t(tr.ONLINE_INVITE_EXPIRED)}</p>
        ) : null}
        {errorText[state.error] ? (
          <p className={classes.error} data-testid="online-error">
            {t(errorText[state.error])}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
};

OnlineLobby.propTypes = {
  open: PropTypes.bool.isRequired,
  close: PropTypes.func.isRequired,
};

const mapStateToProps = (state) => ({
  live: state.live,
  friends: state.ui.friends,
});

export default connect(mapStateToProps)(OnlineLobby);
