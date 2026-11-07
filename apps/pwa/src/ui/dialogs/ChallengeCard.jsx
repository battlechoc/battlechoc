import React, { useEffect, useState } from "react";
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
import { challengeViewed, challengeUnreachable } from "../../match/liveSlice";
import { Jukebox } from "../misc";
import { CHALLENGE_UNREACHABLE_MS } from "./challengeTiming";

const { ChallengeViewState: View, formatChallengeCode } = live;

const useStyles = createUseStyles((theme) => ({
  body: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.8em",
    width: "min(26em, 76vw)",
    // never wider than the dialog (in portrait its inside is narrower than 76vw)
    maxWidth: "100%",
    boxSizing: "border-box",
    // long player names break instead of sticking out
    overflowWrap: "anywhere",
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
  // the two names facing each other
  versus: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.6em",
    width: "100%",
  },
  side: {
    flex: "1 1 0",
    minWidth: 0,
    padding: "0.4em 0.6em",
    borderRadius: "0.6em",
    background: "rgba(93, 58, 36, 0.6)",
    fontFamily: theme.font.display,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  vs: {
    fontFamily: theme.font.display,
    fontSize: theme.font.size.lg,
    color: "#f3c26b",
  },
  textLink: {
    background: "none",
    border: "none",
    color: "white",
    textDecoration: "underline",
    cursor: "pointer",
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
  },
  // the code for the battlechoc app on an iPhone (its storage is not Safari's): tap to copy
  codeChip: {
    margin: "0.3em 0 0",
    padding: "0.2em 0.9em",
    borderRadius: "0.4em",
    border: "2px dashed rgba(255, 255, 255, 0.55)",
    background: "rgba(93, 58, 36, 0.55)",
    color: "white",
    cursor: "pointer",
    fontFamily: theme.font.display,
    fontSize: theme.font.size.md,
    letterSpacing: "0.06em",
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
  markUnreachable,
}) => {
  const classes = useStyles();
  const [copied, setCopied] = useState(false);
  // no answer from the server in time (a link or a typed code): it cannot be reached
  const connecting = Boolean(view) && view.state === "connecting";
  useEffect(() => {
    if (!connecting) {
      return undefined;
    }
    const timeoutId = setTimeout(
      () => markUnreachable(),
      CHALLENGE_UNREACHABLE_MS
    );
    return () => clearTimeout(timeoutId);
  }, [connecting, markUnreachable]);
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
    const headline = (
      <p className={classes.headline} data-testid="challenge-headline">
        {t(tr.CHALLENGE_HEADLINE, from)}
      </p>
    );
    const named = name && name !== EmptyPlayerStats.username;
    const accept = (
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
    );
    const formatted = formatChallengeCode(view.code);
    const copyCode = () => {
      const done = () => setCopied(true);
      if (navigator.clipboard) {
        navigator.clipboard.writeText(formatted).then(done, done);
      } else {
        done();
      }
    };
    content = (
      <>
        {headline}
        <div className={classes.versus}>
          <span className={classes.side} title={from}>
            {from}
          </span>
          <span className={classes.vs}>VS</span>
          <span className={classes.side} title={named ? name : ""}>
            {named ? name : "?"}
          </span>
        </div>
        {newcomer ? <p>{t(tr.CHALLENGE_PRIMER, from)}</p> : null}
        {accept}
        <button
          type="button"
          className={classes.textLink}
          data-testid="challenge-not-now"
          onClick={notNow}
        >
          {t(tr.CHALLENGE_NOT_NOW)}
        </button>
        {newcomer ? (
          <div className={classes.hint}>
            <p>{t(tr.CHALLENGE_APP_HINT)}</p>
            <button
              type="button"
              className={classes.codeChip}
              data-testid="challenge-copy-code"
              onClick={copyCode}
            >
              {copied ? `${formatted} ✓` : formatted}
            </button>
            {copied ? <p>{t(tr.CHALLENGE_CODE_COPIED)}</p> : null}
          </div>
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
  markUnreachable: () => dispatch(challengeUnreachable()),
});

export default connect(mapStateToProps, mapDispatchToProps)(ChallengeCard);
