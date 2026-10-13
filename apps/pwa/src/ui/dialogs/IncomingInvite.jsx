import React, { useEffect, useState } from "react";
import { connect } from "react-redux";
import { createUseStyles } from "react-jss";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import Dialog from "./Dialog";
import Button from "../controls/Button";
import { liveLobby } from "../../match/liveLobby";
import { liveConnection } from "../../match/liveConnection";
import { Jukebox } from "../misc";

const useStyles = createUseStyles((theme) => ({
  root: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "2vh",
    padding: "2vh",
    fontFamily: "Bangers",
    color: theme.color.secondary.dark,
    fontSize: "4vh",
    "& p": { margin: 0 },
  },
  actions: { display: "flex", gap: "2vw" },
}));

// an invite to a live match that arrived while the app is open (outside a match)
const IncomingInvite = ({ invite, inMatch }) => {
  const classes = useStyles();
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!invite) {
      return undefined;
    }
    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
    const interval = setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => clearInterval(interval);
  }, [invite]);

  if (!invite || inMatch) {
    return null;
  }
  const secondsLeft = Math.max(0, Math.ceil((invite.expiresAt - liveConnection.clock.serverNow()) / 1000));
  return (
    <Dialog open={true} closable={false} mode="info" title={t(tr.ONLINE_TITLE)}>
      <div className={classes.root} data-testid="incoming-invite">
        <p>{t(tr.SERVER_NOTIFICATION_CHALLENGE_TITLE, invite.from)}</p>
        <p>{secondsLeft}</p>
        <div className={classes.actions}>
          <Button size="small" onClick={() => liveLobby.acceptInvite(invite.id)}>
            {t(tr.ONLINE_ACCEPT)}
          </Button>
          <Button size="small" color="accent" onClick={() => liveLobby.declineInvite(invite.id)}>
            {t(tr.ONLINE_DECLINE)}
          </Button>
        </div>
      </div>
    </Dialog>
  );
};

const mapStateToProps = (state) => ({
  invite: state.live.incomingInvites[0],
  inMatch: typeof state.match.view !== "undefined",
});

export default connect(mapStateToProps)(IncomingInvite);
