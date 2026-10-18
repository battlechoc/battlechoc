import React, { useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { createUseStyles } from "react-jss";
import {
  EmptyPlayerStats,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import { Jukebox } from "../ui/misc";
import { ServerRequest } from "../helper/settings";
import { multiplayer } from "../Multiplayer";
import OfflineStore from "../OfflineStore";
import { updatePlayerStats, showNotification, loadUiState } from "../ui/UiActions";
import { PlayerNameInput, Button } from "../ui/controls";
import { Dialog } from "../ui/dialogs";
import { matchSession } from "../match/LocalMatchHost";
import { TutorialRunner } from "./runner";
import { LESSON, lessonSteps } from "./lesson";
import { demos } from "./demos";
import logger from "../helper/logger";

const useStyles = createUseStyles((theme) => ({
  coach: {
    position: "absolute",
    zIndex: 5,
    left: "1vw",
    top: "calc(12px + 7vw)",
    width: "27vw",
    maxHeight: "calc(100vh - 7vw - 13vw)",
    overflowY: "auto",
    boxSizing: "border-box",
    padding: "1.2vw 1.4vw",
    borderRadius: 20,
    background: `linear-gradient(0deg, ${theme.color.secondary.dark} 0%, ${theme.color.secondary.light} 80%)`,
    border: `0.3vw solid ${theme.color.secondary.light}`,
    boxShadow: "0 0.5vw 1.5vw rgba(0, 0, 0, 0.35)",
    color: "white",
    [theme.breakpoints.orientation.portrait]: {
      left: "3vw",
      width: "94vw",
      top: "calc(12px + 14vw)",
      padding: "3vw",
    },
  },
  title: {
    margin: "0 0 0.6vw 0",
    fontFamily: "var(--font-display)",
    fontSize: "2.4vw",
    letterSpacing: "0.05em",
    "-webkit-text-stroke": `0.08vw ${theme.color.secondary.dark}`,
    [theme.breakpoints.orientation.portrait]: { fontSize: "6vw" },
  },
  message: {
    margin: 0,
    fontSize: "1.35vw",
    lineHeight: 1.4,
    [theme.breakpoints.orientation.portrait]: { fontSize: "3.8vw" },
  },
  footer: {
    marginTop: "1vw",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "1vw",
  },
  progress: {
    fontFamily: "var(--font-display)",
    fontSize: "1.4vw",
    opacity: 0.85,
    [theme.breakpoints.orientation.portrait]: { fontSize: "4vw" },
  },
  skip: {
    background: "none",
    border: "none",
    color: "white",
    opacity: 0.8,
    textDecoration: "underline",
    cursor: "pointer",
    fontSize: "1.1vw",
    padding: 0,
    [theme.breakpoints.orientation.portrait]: { fontSize: "3.4vw" },
  },
  buttons: {
    display: "flex",
    gap: "0.8vw",
  },
  finished: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
  },
}));

const isNamed = (stats) =>
  typeof stats.username !== "undefined" && stats.username !== EmptyPlayerStats.username;

/**
 * The tutorial on the real-time engine: an interactive first lesson against Mimi Marzipan
 * (loops = [LESSON]) or a series of scripted demos of the unlocked buildings.
 */
const Tutorial = (props) => {
  const classes = useStyles();
  const { loops, view, playerInfos, dispatch, clearScene, testClock } = props;
  const lesson = loops[0] === LESSON;
  const stats = playerInfos.stats;
  const playerName = isNamed(stats) ? stats.username : "Carolin Cacao";

  const runner = useRef(undefined);
  if (typeof runner.current === "undefined") {
    runner.current = new TutorialRunner({ dispatch, clearScene, testClock });
  }
  const [page, setPage] = useState(0);
  const [step, setStep] = useState(0);
  const memory = useRef({});
  const [finished, setFinished] = useState(false);
  const [named, setNamed] = useState(isNamed(stats));
  const [initialUserName, setInitialUserName] = useState(stats.username);

  // the lesson: start once; the demos: (re)start whenever the page changes
  useEffect(() => {
    if (lesson) {
      runner.current.startLesson({
        playerName,
        onEnded: () => setFinished(true),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson]);

  useEffect(() => {
    if (!lesson) {
      runner.current.startDemo(loops[page], { playerName });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson, loops, page]);

  useEffect(() => () => runner.current.stop(), []);

  // the board takes clicks only in the lesson; the palette offers what the step asks for
  const current = lessonSteps[step];
  useEffect(() => {
    dispatch(
      loadUiState({
        tutorialInteractive: lesson,
        whitelistBuildings: lesson && !finished ? current.whitelist : undefined,
      })
    );
  }, [dispatch, lesson, current, finished]);

  // lesson progress: check the current step against the view and the match time
  useEffect(() => {
    if (!lesson || finished) {
      return undefined;
    }
    const check = () => {
      const host = matchSession.host;
      if (typeof view === "undefined" || typeof host === "undefined") {
        return;
      }
      const context = { view, now: host.now(), memory: memory.current };
      if (current.done && current.done(context)) {
        const following = lessonSteps[step + 1];
        if (following) {
          memory.current = following.enter ? following.enter(context) : {};
          Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
          setStep(step + 1);
        }
      }
    };
    check();
    const interval = setInterval(check, 250);
    return () => clearInterval(interval);
  }, [lesson, finished, view, current, step]);

  // the lesson is won: credit the tutorial once and ask for a name if there is none yet
  useEffect(() => {
    if (lesson && finished) {
      if (!stats.tutorialFinished) {
        multiplayer.tutorialFinished();
      }
      if (!named) {
        (isNamed(stats) ? Promise.resolve(stats.username) : multiplayer.fetchRandomName())
          .then((name) => setInitialUserName(name))
          .catch((error) => logger.info(error));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson, finished]);

  const close = (startGame) => {
    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
    runner.current.stop();
    if (!lesson && props.notificationOnLoopsEnd) {
      props.showNotification(props.notificationOnLoopsEnd);
    }
    props.closeTutorial(startGame);
  };

  const skipLesson = async () => {
    if (!stats.tutorialFinished && !stats.tutorialSkipped) {
      await multiplayer.tutorialSkipped();
    }
    close(false);
  };

  const setPlayerName = (name) => {
    ServerRequest("post", "/user/username", { username: name })
      .then(async () => {
        await multiplayer.tutorialFinished();
        props.updatePlayerStats({ username: name });
        const playerStats = await OfflineStore.playerStore.get("stats");
        if (playerStats) {
          playerStats.username = name;
          OfflineStore.playerStore.set("stats", playerStats);
        }
        setNamed(true);
      })
      .catch((error) => logger.warn(error));
  };

  let card;
  if (lesson) {
    const ready = !current.ready || (typeof view !== "undefined" && current.ready({ view }));
    card = (
      <div className={classes.coach} data-testid="tutorial-coach" data-step={current.id}>
        <p className={classes.title}>{t(current.title)}</p>
        <p className={classes.message}>{t(current.message)}</p>
        <div className={classes.footer}>
          <span className={classes.progress}>
            {step + 1}/{lessonSteps.length}
          </span>
          <button type="button" className={classes.skip} onClick={skipLesson}>
            {t(tr.SKIP_TUTORIAL)}
          </button>
          {current.next && ready ? (
            <Button
              icon="forward"
              size="small"
              onClick={() => {
                Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                const following = lessonSteps[step + 1];
                memory.current = following.enter && view ? following.enter({ view, memory: {} }) : {};
                setStep(step + 1);
              }}
            />
          ) : null}
        </div>
      </div>
    );
  } else {
    const demo = demos[loops[page]];
    const last = page >= loops.length - 1;
    card = (
      <div className={classes.coach} data-testid="tutorial-coach" data-demo={loops[page]}>
        <p className={classes.title}>{t(demo.title)}</p>
        <p className={classes.message}>{t(demo.message)}</p>
        <div className={classes.footer}>
          <span className={classes.progress}>
            {page + 1}/{loops.length}
          </span>
          <div className={classes.buttons}>
            {page > 0 ? (
              <Button
                color="accent"
                icon="backward-accent"
                size="small"
                onClick={() => {
                  Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                  setPage(page - 1);
                }}
              />
            ) : null}
            <Button
              icon={last ? "done" : "forward"}
              size="small"
              onClick={() => {
                if (last) {
                  close(false);
                } else {
                  Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                  setPage(page + 1);
                }
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {finished ? null : card}
      <Dialog
        open={lesson && finished}
        close={() => close(false)}
        closable={named}
        title={named ? t(tr.TUTORIAL_DIALOG_TITLE) : t(tr.TUTORIAL_DIALOG_TITLE_BEFORE)}
      >
        {named ? (
          <div className={classes.finished} data-testid="tutorial-finished">
            <p>
              {t(tr.TUTORIAL_DIALOG_MESSAGE)}
              <br />
              {t(tr.TUTORIAL_DIALOG_HINT)}
            </p>
            <Button onClick={() => close(true)}>{t(tr.TUTORIAL_DIALOG_PLAY_GAME)}</Button>
          </div>
        ) : (
          <div data-testid="tutorial-name">
            <PlayerNameInput setPlayerName={setPlayerName} startValue={initialUserName} current={stats.username} />
            <p>{t(tr.TUTORIAL_CHOOSE_NAME_INFO)}</p>
          </div>
        )}
      </Dialog>
    </>
  );
};

Tutorial.propTypes = {
  closeTutorial: PropTypes.func.isRequired,
  clearScene: PropTypes.func.isRequired,
  testClock: PropTypes.bool,
};

const mapStateToProps = (state) => ({
  view: state.match.view,
  loops: state.ui.loopAnimations,
  notificationOnLoopsEnd: state.ui.notificationOnLoopsEnd,
  playerInfos: state.ui.playerInfos,
});

const mapDispatchToProps = (dispatch) => ({
  dispatch,
  updatePlayerStats: (stats) => dispatch(updatePlayerStats(stats)),
  showNotification: (notification) => dispatch(showNotification(notification)),
});

export default connect(mapStateToProps, mapDispatchToProps)(Tutorial);
