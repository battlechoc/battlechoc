import React, { useState, useEffect, useRef, useCallback } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { createUseStyles } from "react-jss";
import {
  EmptyPlayerStats,
  StarterKit,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import IngredientBag from "../ui/ingredients/IngredientBag";
import { Jukebox } from "../ui/misc";
import { multiplayer } from "../Multiplayer";
import {
  updatePlayerStats,
  showNotification,
  loadUiState,
  tapBuilding,
  selectBuilding,
  deselectBuildings,
  focusBoard,
} from "../ui/UiActions";
import PlayerNameInput from "../ui/controls/PlayerNameInput";
import Button from "../ui/controls/Button";
import CoachCard from "../ui/controls/CoachCard";
import Dialog from "../ui/dialogs/Dialog";
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
  // the demos have no buttons at the top left: their card goes right to the top (across the
  // middle of the edge: clear of a camera cutout's whole band in full screen)
  top: {
    [theme.breakpoints.orientation.portrait]: {
      "&&": { top: theme.edge.topMiddle },
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
  const { loops, view, playerInfos, selectedAttack, dispatch, clearScene, testClock } = props;
  // the first finished lesson brings the starter kit (the server credits it once, also later
  // when the lesson was played without it); a restarted lesson brings nothing
  const firstFinish = useRef(!playerInfos.stats.tutorialFinished);
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
  // where the hand points, as last told to the scene and the weapon palette
  const pointerKey = useRef("null");
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

  useEffect(
    () => () => {
      runner.current.stop();
      dispatch(loadUiState({ tutorialPointer: null }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

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

  // the step's building is picked for the player (the palette shows it picked); a step without
  // one picks nothing, so a tap on the board builds nothing by accident
  useEffect(() => {
    if (!lesson || finished) {
      return;
    }
    if (current.whitelist.length === 1) {
      dispatch(tapBuilding(current.whitelist[0]));
      dispatch(selectBuilding(current.whitelist[0]));
      dispatch(focusBoard("own"));
    } else {
      dispatch(deselectBuildings());
    }
  }, [dispatch, lesson, current, finished]);

  // lesson progress: check the current step against the view and the match time, and point
  // the hand at what the step asks for
  useEffect(() => {
    if (!lesson || finished) {
      return undefined;
    }
    const check = () => {
      const host = matchSession.host;
      if (typeof view === "undefined" || typeof host === "undefined") {
        return;
      }
      const context = { view, now: host.now(), memory: memory.current, selectedAttack };
      const target = current.point ? current.point(context) : null;
      const key = JSON.stringify(target);
      if (key !== pointerKey.current) {
        pointerKey.current = key;
        dispatch(loadUiState({ tutorialPointer: target }));
      }
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
  }, [dispatch, lesson, finished, view, current, step, selectedAttack]);

  // the lesson is won: the hand goes, credit the tutorial once and ask for a name if there is
  // none yet
  useEffect(() => {
    if (lesson && finished) {
      pointerKey.current = "null";
      dispatch(loadUiState({ tutorialPointer: null }));
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

  // without the server the name stays on the device until it answers (as in the profile), so a
  // lesson finished offline does not end in a dialog that cannot be closed
  const setPlayerName = async (name) => {
    try {
      await multiplayer.changeUsername(name, props.online);
    } catch (error) {
      // online, the name may be taken: the player picks another
      logger.warn(error);
      return;
    }
    await multiplayer.tutorialFinished();
    setNamed(true);
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
            {firstFinish.current ? (
              <div data-testid="starter-kit">
                <p>{t(tr.TUTORIAL_STARTER_KIT)}</p>
                <IngredientBag
                  items={Object.entries(StarterKit).map(([ingredient, amount]) => ({ ingredient, amount }))}
                  showSources={false}
                />
              </div>
            ) : null}
            <p>
              {t(tr.TUTORIAL_DIALOG_MESSAGE)}
              <br />
              {t(tr.TUTORIAL_DIALOG_HINT)}
            </p>
            <Button onClick={() => close(true)}>{t(tr.TUTORIAL_DIALOG_PLAY_GAME)}</Button>
          </div>
        ) : (
          <div data-testid="tutorial-name">
            <PlayerNameInput
              setPlayerName={setPlayerName}
              startValue={initialUserName}
              current={stats.username}
              offline={!props.online}
            />
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
  online: state.ui.online,
  selectedAttack: state.ui.selectedAttack,
});

const mapDispatchToProps = (dispatch) => ({
  dispatch,
  updatePlayerStats: (stats) => dispatch(updatePlayerStats(stats)),
  showNotification: (notification) => dispatch(showNotification(notification)),
});

export default connect(mapStateToProps, mapDispatchToProps)(Tutorial);
