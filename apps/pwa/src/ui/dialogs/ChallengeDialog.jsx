import React, { useEffect, useState } from "react";
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
import { challengeViewed } from "../../match/liveSlice";
import { challengeLink } from "../../challengeLink";
import Jukebox from "../misc/Jukebox";
import { CHALLENGE_UNREACHABLE_MS } from "./challengeTiming";
import { useCountdown, minutesAndSeconds, Pill } from "../controls/Countdown";

const { ChallengeState, formatChallengeCode, normalizeChallengeCode } = live;

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
  code: {
    fontFamily: theme.font.display,
    fontSize: theme.font.size.lg,
    letterSpacing: "0.08em",
  },
  countdown: {
    fontFamily: theme.font.display,
  },
  actions: {
    display: "flex",
    gap: "1em",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  whatsapp: {
    color: "white",
  },
  entry: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.4em",
    marginTop: "0.6em",
    fontSize: theme.font.size.sm,
  },
  entryRow: {
    display: "flex",
    gap: "0.5em",
    alignItems: "center",
  },
  input: {
    width: "8.5em",
    fontFamily: theme.font.display,
    fontSize: theme.font.size.md,
    textAlign: "center",
    textTransform: "uppercase",
    padding: "0.3em 0.6em",
    borderRadius: "0.6em",
    border: `2px solid ${theme.color.secondary.light}`,
    color: theme.color.secondary.dark,
    outline: "none",
  },
  error: {
    color: theme.color.accent.light,
  },
  // A: the code on a chocolate tile, the countdown as a pill, a line before the code field
  codeTile: {
    padding: "0.3em 0.9em",
    borderRadius: "0.4em",
    border: "2px dashed rgba(255, 255, 255, 0.55)",
    background: "rgba(93, 58, 36, 0.55)",
  },
  // beside the status line
  pill: {
    marginLeft: "0.5em",
  },
  divider: {
    width: "70%",
    height: 0,
    borderTop: "1px solid rgba(255, 255, 255, 0.3)",
    margin: "0.4em 0 0",
  },
}));

// the challenges the server ended, which "Send again" brings back
const ENDED = {
  [ChallengeState.EXPIRED]: tr.CHALLENGE_EXPIRED,
  [ChallengeState.DECLINED]: tr.CHALLENGE_DECLINED,
  [ChallengeState.MISSED]: tr.CHALLENGE_MISSED,
  lost: tr.CHALLENGE_LOST,
};


// a friend's code typed in (an iPhone's home-screen app does not get the link): opens their card
const CodeEntry = ({ classes, openCode }) => {
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState(false);
  const go = () => {
    const code = normalizeChallengeCode(text);
    if (code === null) {
      setInvalid(true);
      return;
    }
    openCode(code);
  };
  return (
    <div className={classes.entry}>
      <span>{t(tr.CHALLENGE_ENTER_CODE)}</span>
      <div className={classes.entryRow}>
        <input
          className={classes.input}
          data-testid="challenge-code-input"
          placeholder="K7Q2-M9XD"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setInvalid(false);
          }}
          onKeyDown={(event) => event.key === "Enter" && go()}
        />
        <Button size="small" data-testid="challenge-code-go" onClick={go}>
          {t(tr.CHALLENGE_CODE_GO)}
        </Button>
      </div>
      {invalid ? (
        <span className={classes.error}>{t(tr.CHALLENGE_CODE_INVALID)}</span>
      ) : null}
    </div>
  );
};

// "Play with a friend": the player's own challenge link (created on opening), its code and how long
// it waits; locked, only the field for a friend's code. Closing it ends the challenge.
const ChallengeDialog = ({
  open,
  close,
  locked,
  lockText,
  challenge,
  playerName,
  viewChallenge,
}) => {
  const classes = useStyles();
  const [copied, setCopied] = useState(false);
  // the server never answered the new challenge: say so instead of loading forever
  const [unreachable, setUnreachable] = useState(false);
  const waitingForServer = open && !locked && challenge === null;
  useEffect(() => {
    if (!waitingForServer) {
      setUnreachable(false);
      return undefined;
    }
    const timeoutId = setTimeout(
      () => setUnreachable(true),
      CHALLENGE_UNREACHABLE_MS
    );
    return () => clearTimeout(timeoutId);
  }, [waitingForServer]);
  // the challenge's time left, renewed every second while the dialog is open
  const secondsLeft = useCountdown(challenge ? challenge.expiresAt : undefined, open && !locked);

  useEffect(() => {
    // a challenge restored after a reload is shown as it is
    if (open && !locked && challenge === null) {
      liveLobby.createChallenge().catch(() => {});
    }
    // only when the dialog opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, locked]);

  if (!open) {
    return null;
  }

  const code = challenge ? challenge.code : null;
  const leave = () => {
    if (code !== null) {
      liveLobby.cancelChallenge(code).catch(() => {});
    } else if (!locked) {
      liveLobby.dismissChallenge();
    }
    setCopied(false);
    close();
  };
  const openCode = (friendCode) => {
    leave();
    viewChallenge({ code: friendCode, state: "connecting" });
    liveLobby.openChallenge(friendCode).catch(() => {});
  };
  const link = code ? challengeLink(code) : null;
  const text = t(tr.CHALLENGE_PREVIEW_TITLE, playerName);
  const share = () => {
    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
    if (navigator.share) {
      navigator.share({ title: "battlechoc", text, url: link }).catch(() => {});
      return;
    }
    const done = () => setCopied(true);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(link).then(done, done);
    } else {
      done();
    }
  };
  const again = () => {
    if (challenge.state === "lost") {
      liveLobby.createChallenge().catch(() => {});
    } else {
      liveLobby.renewChallenge(code).catch(() => {});
    }
  };

  const entry = <CodeEntry classes={classes} openCode={openCode} />;
  const cancelButton = (
    <Button
      size="small"
      color="accent"
      data-testid="challenge-cancel"
      onClick={leave}
    >
      {t(tr.CHALLENGE_CANCEL)}
    </Button>
  );

  let main;
  if (locked) {
    main = <p>{lockText}</p>;
  } else if (challenge === null && unreachable) {
    main = (
      <>
        <p data-testid="challenge-status">{t(tr.CHALLENGE_UNREACHABLE)}</p>
        <Button
          size="small"
          color="accent"
          data-testid="challenge-back"
          onClick={leave}
        >
          {t(tr.CHALLENGE_BACK_HOME)}
        </Button>
      </>
    );
  } else if (challenge === null) {
    main = <p>{t(tr.CHALLENGE_CONNECTING)}</p>;
  } else if (ENDED[challenge.state]) {
    main = (
      <>
        <p data-testid="challenge-status">{t(ENDED[challenge.state])}</p>
        <div className={classes.actions}>
          <Button
            size="small"
            data-testid="challenge-send-again"
            onClick={again}
          >
            {t(tr.CHALLENGE_SEND_AGAIN)}
          </Button>
          <Button
            size="small"
            color="accent"
            data-testid="challenge-back"
            onClick={leave}
          >
            {t(tr.CHALLENGE_BACK_HOME)}
          </Button>
        </div>
      </>
    );
  } else {
    const waiting = challenge.state === ChallengeState.WAITING;
    const status = t(waiting ? tr.CHALLENGE_WAITING : tr.CHALLENGE_READING);
    const formatted = formatChallengeCode(code);
    const shareButton = (
      <Button data-testid="challenge-share" onClick={share}>
        {t(tr.CHALLENGE_SHARE)}
      </Button>
    );
    const copiedLine = copied ? (
      <p>
        {t(tr.CHALLENGE_COPIED)} ·{" "}
        <a
          className={classes.whatsapp}
          href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`${text} ${link}`)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t(tr.CHALLENGE_WHATSAPP)}
        </a>
      </p>
    ) : null;
    main = (
      <>
        <p>{t(tr.CHALLENGE_SEND_HINT)}</p>
        {shareButton}
        {copiedLine}
        <p
          className={`${classes.code} ${classes.codeTile}`}
          data-testid="challenge-code"
        >
          {t(tr.CHALLENGE_CODE, formatted)}
        </p>
        <p data-testid="challenge-status">
          {status}
          {waiting ? (
            <Pill className={classes.pill} data-testid="challenge-countdown">
              {minutesAndSeconds(secondsLeft)}
            </Pill>
          ) : null}
        </p>
        {cancelButton}
      </>
    );
  }

  // the waiting link (A): a line before the code field; locked (C): the code field right below
  const body = (
    <>
      {main}
      {locked ? null : <div className={classes.divider} />}
      {entry}
    </>
  );

  return (
    <Dialog open close={leave} mode="info" title={t(tr.CHALLENGE_BUTTON)}>
      <div className={classes.body} data-testid="challenge-dialog">
        {body}
      </div>
    </Dialog>
  );
};

const mapStateToProps = (state) => ({
  challenge: state.live.challenge,
  playerName: state.ui.playerInfos.stats.username,
});

const mapDispatchToProps = (dispatch) => ({
  viewChallenge: (view) => dispatch(challengeViewed(view)),
});

export default connect(mapStateToProps, mapDispatchToProps)(ChallengeDialog);
