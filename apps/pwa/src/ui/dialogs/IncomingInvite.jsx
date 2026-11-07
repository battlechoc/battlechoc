import React, { useEffect } from "react";
import { connect } from "react-redux";
import { createUseStyles } from "react-jss";
import {
  engine,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import Dialog from "./Dialog";
import Button from "../controls/Button";
import { liveLobby } from "../../match/liveLobby";
import Jukebox from "../misc/Jukebox";
import { useCountdown, Pill } from "../controls/Countdown";

const useStyles = createUseStyles((theme) => ({
  root: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "2vh",
    padding: "2vh",
    fontFamily: theme.font.display,
    color: "white",
    fontSize: theme.font.size.md,
    "& p": { margin: 0 },
  },
  actions: { display: "flex", gap: "2vw" },
  // over the end screen of the finished match (GameEndOverview)
  layer: { position: "fixed", inset: 0, zIndex: theme.layer.overEndScreen },
}));

// the opponent of a challenge match asks for a rematch (on the end screen, or back on the title)
const IncomingInvite = ({ invite, inMatch }) => {
  const classes = useStyles();
  useEffect(() => {
    if (invite) {
      Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
    }
  }, [invite]);
  // the time left, as the challenge dialog shows it
  const secondsLeft = useCountdown(invite ? invite.expiresAt : undefined, Boolean(invite));

  if (!invite || inMatch) {
    return null;
  }
  return (
    <div className={classes.layer}>
      <Dialog open={true} closable={false} mode="info" title={t(tr.REMATCH)}>
        <div className={classes.root} data-testid="incoming-invite">
          <p>{t(tr.REMATCH_OFFER, invite.from)}</p>
          <p>
            <Pill>{t(tr.SECONDS_LEFT, secondsLeft)}</Pill>
          </p>
          <div className={classes.actions}>
            <Button
              size="small"
              onClick={() => liveLobby.acceptInvite(invite.id)}
            >
              {t(tr.ONLINE_ACCEPT)}
            </Button>
            <Button
              size="small"
              color="accent"
              onClick={() => liveLobby.declineInvite(invite.id)}
            >
              {t(tr.ONLINE_DECLINE)}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};

const mapStateToProps = (state) => ({
  invite: state.live.incomingInvites[0],
  // a finished match's end screen still has its view: the offer shows there too
  inMatch:
    typeof state.match.view !== "undefined" &&
    state.match.view.phase !== engine.MatchPhase.ENDED,
});

export default connect(mapStateToProps)(IncomingInvite);
