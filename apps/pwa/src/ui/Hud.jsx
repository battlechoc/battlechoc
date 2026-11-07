import React, { Suspense, useState, useRef, useCallback } from "react";
import "./Hud.css";
import { connect } from "react-redux";
import {
  engine,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import {
  showQuickMessage,
  showOfflineMessage,
  showNotification,
  hideNotification,
} from "./uiSlice";
// loaded after the title screen (src/ui/onDemand.js)
import { Settings, AccountOverview, Choclab } from "./onDemand";
import { multiplayer } from "../Multiplayer";
import Fab from "./controls/Fab";
import Progress from "./controls/Progress";
import Actionbar from "./controls/Actionbar";
import GameStartSelection from "./controls/GameStartSelection";
import { createUseStyles } from "react-jss";
import { selectActiveGame } from "../match/matchSlice";
import TitleScreen from "./TitleScreen";
import MatchHud from "./MatchHud";
import useProfileRoute from "./useProfileRoute";

const useStyles = createUseStyles((theme) => ({
  actionbar: {
    position: "absolute",
    top: theme.edge.top,
    left: theme.edge.left,
    zIndex: theme.layer.hud + 1,
  },
}));

// what the HUD shows: the title, the field choice of a match, the Choclab, the wait for a
// profile link, or a running match
const stageOf = ({ phase, choclab, waitingRoom }) => {
  if (typeof phase === "undefined" && !choclab && !waitingRoom) {
    return "TITLE_SCREEN";
  } else if (phase === engine.MatchPhase.FIELD_CHOICE) {
    return "CHOOSE_MENU";
  } else if (choclab) {
    return "CHOCLAB_SCREEN";
  } else if (waitingRoom) {
    return "WAITING_ROOM";
  }
  return "INGAME";
};

// the buttons at the top left: back from the Choclab, none while waiting, else the action bar
const TopBar = ({ stage, classes, closeChoclab, endGame, showSettings, showSignInOrUp }) => {
  if (stage === "CHOCLAB_SCREEN") {
    return (
      <div className={classes.actionbar}>
        <Fab color="secondary" icon="back" onClick={closeChoclab}></Fab>
      </div>
    );
  } else if (stage === "WAITING_ROOM") {
    return null;
  }
  return <Actionbar endGame={endGame} showSettings={showSettings} showSignInOrUp={showSignInOrUp} />;
};

// what a stage shows below the top bar
const Stage = ({ stage, titleScreen, endGame }) => {
  if (stage === "TITLE_SCREEN") {
    return <TitleScreen {...titleScreen} />;
  } else if (stage === "CHOOSE_MENU") {
    return (
      <div className="chooseStage">
        <GameStartSelection />
      </div>
    );
  } else if (stage === "CHOCLAB_SCREEN") {
    return (
      <Suspense fallback={null}>
        <Choclab />
      </Suspense>
    );
  } else if (stage === "WAITING_ROOM") {
    return (
      <div className="waiting-room">
        <p>{t(tr.TRY_TO_SHOW_PLAYER_ACCOUNT)}</p>
        <Progress infiniteAnimation />
      </div>
    );
  }
  return <MatchHud endGame={endGame} />;
};

const Hud = (props) => {
  const classes = useStyles(props);
  const { phase, className, startTutorial, endGame } = props;

  // the title's dialogs: Resume or a new game, and "Play with a friend" (null when closed, else
  // { locked, lockText }); they stay open across a match
  const [resumeDialog, setResumeDialog] = useState(false);
  const [challengeDialog, setChallengeDialog] = useState(null);
  const [openSettings, setOpenSettings] = useState(false);
  // what to do once the settings close (the match menu comes back)
  const afterSettings = useRef(undefined);
  const [showAccountOverview, setShowAccountOverview] = useState(false);
  const [dialogStyle, setDialogStyle] = useState("default");
  const [choclabScreen, setChoclabScreen] = useState(false);
  const [playerAccount, setPlayerAccount] = useState(undefined);

  const openAccountOverview = useCallback((account, style = "default") => {
    setDialogStyle(style);
    setShowAccountOverview(true);
    setPlayerAccount(account);
  }, []);

  // a profile link (battlechoc.com/<username>)
  const waitingRoom = useProfileRoute(props.challengedPlayer, {
    show: openAccountOverview,
    showQuickMessage: props.showQuickMessage,
  });

  const kickOffTutorial = () => {
    multiplayer.tutorialStarted();
    startTutorial();
  };

  const stage = stageOf({ phase, choclab: choclabScreen, waitingRoom });
  return (
    <div className={className}>
      <Suspense fallback={null}>
        <Settings
          startTutorial={kickOffTutorial}
          showBuildingDemos={props.showBuildingDemos}
          open={openSettings}
          close={() => {
            setOpenSettings(false);
            const after = afterSettings.current;
            afterSettings.current = undefined;
            if (after) {
              after();
            }
          }}
        />
        <AccountOverview
          dialogStyle={dialogStyle}
          playerAccount={playerAccount}
          open={showAccountOverview}
          close={() => setShowAccountOverview(false)}
        />
      </Suspense>
      <TopBar
        stage={stage}
        classes={classes}
        closeChoclab={() => setChoclabScreen(false)}
        endGame={endGame}
        showSettings={(after) => {
          afterSettings.current = after;
          setOpenSettings(true);
        }}
        showSignInOrUp={openAccountOverview}
      />
      <Stage
        stage={stage}
        endGame={endGame}
        titleScreen={{
          playerInfos: props.playerInfos,
          earlyUnlock: props.earlyUnlock,
          online: props.online,
          assetsReady: props.assetsReady,
          fontsReady: props.fontsReady,
          assetsProgress: props.assetsProgress,
          assetsFailed: props.assetsFailed,
          resumeGamePossible: props.resumeGamePossible,
          notification: props.notification,
          challenge: props.challenge,
          resumeDialog,
          setResumeDialog,
          challengeDialog,
          setChallengeDialog,
          startGame: () => props.startGameCallback(),
          resumeGame: () => props.prepareNewGameCallback(true),
          startTutorial: kickOffTutorial,
          skipTutorial: () => multiplayer.tutorialSkipped(),
          signIn: () => setShowAccountOverview(true),
          openChoclab: () => setChoclabScreen(true),
          showProfile: openAccountOverview,
          showNotification: props.showNotification,
          hideNotification: props.hideNotification,
          showOfflineMessage: props.showOfflineMessage,
          showQuickMessage: props.showQuickMessage,
        }}
      />
    </div>
  );
};

const mapStateToProps = (state) => {
  const game = selectActiveGame(state);
  return {
    phase: typeof game === "undefined" ? undefined : game.state || game.phase,
    resumeGamePossible: state.ui.resumeGamePossible,
    assetsReady: state.ui.assetsReady,
    fontsReady: state.ui.fontsReady,
    assetsProgress: state.ui.assetsProgress,
    assetsFailed: state.ui.assetsFailed,
    notification: state.ui.notification,
    playerInfos: state.ui.playerInfos,
    online: state.ui.online,
    earlyUnlock: state.ui.earlyUnlock,
    challenge: state.live.challenge,
  };
};

const mapDispatchToProps = {
  showQuickMessage,
  showOfflineMessage,
  showNotification,
  hideNotification,
};

const HudContainer = connect(mapStateToProps, mapDispatchToProps)(Hud);

export default HudContainer;
