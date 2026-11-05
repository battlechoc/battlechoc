import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { createUseStyles } from "react-jss";
import {
  live,
  translate as t,
  translationKeys as tr,
  EmptyPlayerStats,
} from "@battlechoc/battlechoc-shared-functions";
import Dialog from "./Dialog";
import Button from "../controls/Button";
import { liveLobby } from "../../match/liveLobby";
import { challengeViewed } from "../../match/liveSlice";
import { Jukebox } from "../misc";

const { ChallengeViewState: View, formatChallengeCode } = live;

const useStyles = createUseStyles((theme) => ({
  body: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.8em",
    width: "min(26em, 76vw)",
    color: "white",
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    textAlign: "center",
    "& p": { margin: 0 },
  },
  headline: {
    fontFamily: theme.font.display,
    fontSize: theme.font.size.lg,
  },
  hint: {
    fontSize: theme.font.size.sm,
    opacity: 0.85,
  },
  actions: {
    display: "flex",
    gap: "1em",
    flexWrap: "wrap",
    justifyContent: "center",
  },
}));

// what a challenge that cannot be played says (the others are the open card and the wait for the challenger)
const STATUS = {
  connecting: tr.CHALLENGE_CONNECTING,
  unreachable: tr.CHALLENGE_UNREACHABLE,
  [View.ENDED]: tr.CHALLENGE_ENDED,
  [View.TAKEN]: tr.CHALLENGE_TAKEN,
  [View.OWN]: tr.CHALLENGE_OWN,
  [View.BUSY]: tr.CHALLENGE_BUSY,
};

// A friend's challenge, opened from its link (?challenge=) or a typed code. A newcomer gets it
// instead of the tutorial: who challenges, what the game is about in one sentence, and Accept as
// soon as the game has loaded.
const ChallengeCard = ({
  view,
  inMatch,
  assetsReady,
  newcomer,
  playerName,
  close,
  learn,
  startMatch,
}) => {
  const classes = useStyles();
  if (!view || inMatch) {
    return null;
  }
  const from = view.from;
  const name = view.name || playerName;
  const notNow = () => {
    liveLobby.declineChallenge(view.code).catch(() => {});
    close();
  };
  const back = (
    <Button
      size="small"
      color="accent"
      data-testid="challenge-back"
      onClick={close}
    >
      {t(tr.CHALLENGE_BACK_HOME)}
    </Button>
  );
  const learnButton = (
    <Button
      size="small"
      data-testid="challenge-learn"
      onClick={() => {
        close();
        learn();
      }}
    >
      {t(tr.CHALLENGE_LEARN)}
    </Button>
  );

  let content;
  if (view.state === View.OPEN) {
    content = (
      <>
        <p className={classes.headline} data-testid="challenge-headline">
          {t(tr.CHALLENGE_HEADLINE, from)}
        </p>
        {newcomer ? <p>{t(tr.CHALLENGE_PRIMER, from)}</p> : null}
        {newcomer && name && name !== EmptyPlayerStats.username ? (
          <p>{t(tr.CHALLENGE_YOU_PLAY_AS, name)}</p>
        ) : null}
        <div className={classes.actions}>
          <Button
            data-testid="challenge-accept"
            disabled={!assetsReady}
            onClick={() => {
              Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
              liveLobby.acceptChallenge(view.code).catch(() => {});
            }}
          >
            {assetsReady ? t(tr.CHALLENGE_ACCEPT) : t(tr.CHALLENGE_PREPARING)}
          </Button>
          <Button
            size="small"
            color="accent"
            data-testid="challenge-not-now"
            onClick={notNow}
          >
            {t(tr.CHALLENGE_NOT_NOW)}
          </Button>
        </div>
        {newcomer ? (
          <p className={classes.hint}>
            {t(tr.CHALLENGE_APP_HINT, formatChallengeCode(view.code))}
          </p>
        ) : null}
      </>
    );
  } else if (view.state === View.WAITING_FOR_CHALLENGER) {
    content = (
      <p data-testid="challenge-card-status">
        {t(tr.CHALLENGE_ON_THE_WAY, from)}
      </p>
    );
  } else if (view.state === View.CHALLENGER_AWAY) {
    content = (
      <>
        <p data-testid="challenge-card-status">{t(tr.CHALLENGE_AWAY, from)}</p>
        <div className={classes.actions}>{back}</div>
      </>
    );
  } else if (view.state === View.TAKEN) {
    content = (
      <>
        <p data-testid="challenge-card-status">{t(tr.CHALLENGE_TAKEN)}</p>
        <div className={classes.actions}>
          {newcomer ? (
            learnButton
          ) : (
            <Button
              size="small"
              data-testid="challenge-start"
              onClick={() => {
                close();
                startMatch();
              }}
            >
              {t(tr.CHALLENGE_START_MATCH)}
            </Button>
          )}
          {back}
        </div>
      </>
    );
  } else {
    content = (
      <>
        <p data-testid="challenge-card-status">
          {t(STATUS[view.state] || tr.CHALLENGE_ENDED)}
        </p>
        {view.state === "connecting" ? null : (
          <div className={classes.actions}>
            {newcomer && view.state === View.ENDED ? learnButton : null}
            {back}
          </div>
        )}
      </>
    );
  }

  return (
    <Dialog
      open
      close={view.state === View.OPEN ? notNow : close}
      mode="info"
      title={t(tr.CHALLENGE_BUTTON)}
    >
      <div className={classes.body} data-testid="challenge-card">
        {content}
      </div>
    </Dialog>
  );
};

ChallengeCard.propTypes = {
  // starts the tutorial (a newcomer) and the normal Start (everyone else)
  learn: PropTypes.func.isRequired,
  startMatch: PropTypes.func.isRequired,
};

const mapStateToProps = (state) => {
  const stats = state.ui.playerInfos.stats;
  return {
    view: state.live.challengeView,
    inMatch: typeof state.match.view !== "undefined",
    assetsReady: state.ui.assetsReady,
    newcomer: !stats.tutorialFinished && !stats.tutorialSkipped,
    playerName: stats.username,
  };
};

const mapDispatchToProps = (dispatch) => ({
  close: () => dispatch(challengeViewed(null)),
});

export default connect(mapStateToProps, mapDispatchToProps)(ChallengeCard);
