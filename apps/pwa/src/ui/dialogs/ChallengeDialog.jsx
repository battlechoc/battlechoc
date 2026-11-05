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
import { challengeViewed } from "../../match/liveSlice";
import { challengeLink } from "../../challengeLink";
import { Jukebox } from "../misc";

const { ChallengeState, formatChallengeCode, normalizeChallengeCode } = live;

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
}));

// the challenges the server ended, which "Send again" brings back
const ENDED = {
  [ChallengeState.EXPIRED]: tr.CHALLENGE_EXPIRED,
  [ChallengeState.DECLINED]: tr.CHALLENGE_DECLINED,
  [ChallengeState.MISSED]: tr.CHALLENGE_MISSED,
  lost: tr.CHALLENGE_LOST,
};

const countdown = (expiresAt) => {
  const total = Math.max(
    0,
    Math.ceil((expiresAt - liveConnection.clock.serverNow()) / 1000)
  );
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
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
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!open || locked) {
      return undefined;
    }
    // a challenge restored after a reload is shown as it is
    if (challenge === null) {
      liveLobby.createChallenge().catch(() => {});
    }
    const interval = setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => clearInterval(interval);
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

  let content;
  if (locked) {
    content = <p>{lockText}</p>;
  } else if (challenge === null) {
    content = <p>{t(tr.CHALLENGE_CONNECTING)}</p>;
  } else if (ENDED[challenge.state]) {
    content = (
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
    content = (
      <>
        <p>{t(tr.CHALLENGE_SEND_HINT)}</p>
        <Button data-testid="challenge-share" onClick={share}>
          {t(tr.CHALLENGE_SHARE)}
        </Button>
        {copied ? (
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
        ) : null}
        <p className={classes.code} data-testid="challenge-code">
          {t(tr.CHALLENGE_CODE, formatChallengeCode(code))}
        </p>
        <p data-testid="challenge-status">
          {t(waiting ? tr.CHALLENGE_WAITING : tr.CHALLENGE_READING)}
        </p>
        {waiting ? (
          <p className={classes.countdown} data-testid="challenge-countdown">
            {countdown(challenge.expiresAt)}
          </p>
        ) : null}
        <Button
          size="small"
          color="accent"
          data-testid="challenge-cancel"
          onClick={leave}
        >
          {t(tr.CHALLENGE_CANCEL)}
        </Button>
      </>
    );
  }

  return (
    <Dialog open close={leave} mode="info" title={t(tr.CHALLENGE_BUTTON)}>
      <div className={classes.body} data-testid="challenge-dialog">
        {content}
        <CodeEntry classes={classes} openCode={openCode} />
      </div>
    </Dialog>
  );
};

ChallengeDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  close: PropTypes.func.isRequired,
  locked: PropTypes.bool,
  lockText: PropTypes.string,
};

const mapStateToProps = (state) => ({
  challenge: state.live.challenge,
  playerName: state.ui.playerInfos.stats.username,
});

const mapDispatchToProps = (dispatch) => ({
  viewChallenge: (view) => dispatch(challengeViewed(view)),
});

export default connect(mapStateToProps, mapDispatchToProps)(ChallengeDialog);
