import React, { useState, useEffect, useRef, useCallback } from "react";
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
import { PlayerNameInput, Button, CoachCard } from "../ui/controls";
import { Dialog } from "../ui/dialogs";
import { matchSession } from "../match/LocalMatchHost";
import { TutorialRunner } from "./runner";
import { LESSON, lessonSteps } from "./lesson";
import { demos } from "./demos";
import logger from "../helper/logger";

const useStyles = createUseStyles((theme) => ({
  finished: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
  },
  // portrait: the card leaves the cacao and the building slots at the top right visible
  card: {
    [theme.breakpoints.orientation.portrait]: {
      "&&": { width: "67vw" },
    },
  },
  // the demos have no buttons at the top left: their card goes right to the top
  top: {
    [theme.breakpoints.orientation.portrait]: {
      "&&": { top: 5 },
    },
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
  // in portrait the card lies across the top of the board: the scene moves the board below it
  const cardLayout = useCallback((bottom) => dispatch(loadUiState({ boardTopInset: bottom })), [dispatch]);

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
      <CoachCard
        data-testid="tutorial-coach"
        onLayout={cardLayout}
        className={classes.card}
        data-step={current.id}
        title={t(current.title)}
        message={t(current.message)}
        progress={`${step + 1}/${lessonSteps.length}`}
        skipLabel={t(tr.SKIP_TUTORIAL)}
        onSkip={skipLesson}
      >
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
      </CoachCard>
    );
  } else {
    const demo = demos[loops[page]];
    const last = page >= loops.length - 1;
    card = (
      <CoachCard
        data-testid="tutorial-coach"
        onLayout={cardLayout}
        className={`${classes.card} ${classes.top}`}
        data-demo={loops[page]}
        title={t(demo.title)}
        message={t(demo.message)}
        progress={`${page + 1}/${loops.length}`}
      >
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
      </CoachCard>
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
