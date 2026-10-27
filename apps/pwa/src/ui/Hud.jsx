import React, { useState, useEffect, useRef } from "react";
import "./Hud.css";
import PropTypes from "prop-types";
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
} from "./UiActions";
import {
  Info,
  Settings,
  AccountOverview,
  Dialog,
  Highscore,
} from "./dialogs";
import OnlineLobby from "./dialogs/OnlineLobby";
import { liveLobby } from "../match/liveLobby";
import Choclab from "./pages/Choclab";
import { multiplayer } from "../Multiplayer";
import { ServerRequest } from "../helper/settings";
import logger from "../helper/logger";
import { account } from "../account";
import {
  Button,
  Fab,
  Progress,
  Actionbar,
  GameStartSelection,
  GameEndOverview,
} from "./controls";
import { createUseStyles } from "react-jss";
import { selectActiveGame } from "../match/matchSlice";
import {
  BuildPalette,
  WeaponPalette,
  ResourcePanel,
  MatchBanner,
  InfoCard,
} from "./match";

// The title screen's logo: its top and size (a square in vh; logo.svg fills its width) and the
// rays turning behind it, centred on the fountain (dev/icons.mjs puts it at x 308, y 22 to 392
// of logo.svg's 1209 × 924)
const LOGO = {
  landscape: { top: 5, size: 50, rays: 350 },
  portrait: { top: 12, size: 40, rays: 200 },
};
const FOUNTAIN = { x: 308 / 1209, y: 207 / 1209 };

const logoBox = ({ top, size }) => ({
  top: `${top}vh`,
  width: `${size}vh`,
  height: `${size}vh`,
});

const raysBox = ({ top, size, rays }) => ({
  top: `${top + FOUNTAIN.y * size - rays / 2}vh`,
  left: `calc(50% + ${(FOUNTAIN.x - 0.5) * size - rays / 2}vh)`,
  width: `${rays}vh`,
  height: `${rays}vh`,
});

const useStyles = createUseStyles((theme) => ({
  actionbar: {
    position: "absolute",
    top: 5,
    left: 5,
    zIndex: 5,
  },
  logo: {
    position: "relative",
    width: "100%",
    height: "100%",
    display: "flex",
    justifyContent: "center",
    overflow: "hidden",
    "& > :first-child": {
      position: "absolute",
      background: "url(/images/logo.svg) no-repeat",
      zIndex: 1,
      [theme.breakpoints.orientation.landscape]: logoBox(LOGO.landscape),
      [theme.breakpoints.orientation.portrait]: logoBox(LOGO.portrait),
    },
    "& > :last-child": {
      position: "absolute",
      background: "url(/images/stripes.svg) no-repeat",
      backgroundSize: "100%",
      zIndex: 0,
      animation: "pulse 20s linear 0s infinite",
      [theme.breakpoints.orientation.landscape]: raysBox(LOGO.landscape),
      [theme.breakpoints.orientation.portrait]: raysBox(LOGO.portrait),
    },
  },
  menu: {
    display: "flex",
    flexDirection: "column",
    position: "absolute",
    zIndex: 4,
    // the menu buttons share the width of the widest
    "& > div": {
      marginBottom: 6,
      width: "100%",
    },
    [theme.breakpoints.orientation.portrait]: {
      top: "48%",
    },
    [theme.breakpoints.orientation.landscape]: {
      top: "55%",
      "@media screen and (min-height: 340px)": {
        top: "48%",
      },
    },
  },
  decoration: {
    position: "fixed",
    background: "url(/images/decoration.svg) no-repeat",
    zIndex: 3,
    [theme.breakpoints.orientation.portrait]: {
      bottom: "-20vh",
      left: "-15vh",
      width: "45vh",
      height: "45vh",
    },
    [theme.breakpoints.orientation.landscape]: {
      bottom: "-35vh",
      left: "-25vh",
      width: "70vh",
      height: "70vh",
    },
  },
  resumeGameDialog: {
    color: "white",
    textAlign: "center",
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-evenly",
    [theme.breakpoints.orientation.portrait]: {
      justifyContent: "unset",
      alignItems: "center",
      flexDirection: "column",
      "& > div:last-child": {
        marginTop: "3vh",
      },
    },
  },
  notification: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
  },
  titleScreen: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    zIndex: 2,
    height: "100vh",
  },
}));

const Hud = (props) => {
  const classes = useStyles(props);
  const {
    resumeGamePossible,
    showQuickMessage,
    challengedPlayer,
    assetsReady,
    overviewVisible,
    game,
    state,
    openInfo,
    prepareNewGameCallback,
    className,
    startTutorial,
    playerInfos,
    endGame,
    notification,
    hideNotification,
    matchAwards,
    matchOnline,
    matchResult,
    online,
  } = props;

  const [open, setOpen] = useState(false);
  const [openSettings, setOpenSettings] = useState(false);
  // what to do once the settings close (the match menu comes back)
  const afterSettings = useRef(undefined);
  const [showAccountOverview, setShowAccountOverview] = useState(false);
  const [dialogStyle, setDialogStyle] = useState("default");
  const [showOnlineLobby, setShowOnlineLobby] = useState(false);
  const [waitingRoom, setWaitingRoom] = useState(false);
  const [waitingRoomText, setWaitingRoomText] = useState(
    t(tr.TRY_TO_JOIN_GAME)
  );
  const [choclabScreen, setChoclabScreen] = useState(false);
  const [playerAccount, setPlayerAccount] = useState(undefined);
  const [challengedProfile, setChallengedProfile] = useState(undefined);

  const sleep = (ms) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
  };

  const openAccountOverview = (account, style = "default") => {
    setDialogStyle(style);
    setShowAccountOverview(true);
    setPlayerAccount(account);
  };

  useEffect(() => {
    const checkForWaitingRoom = async () => {
      if (typeof challengedPlayer !== "undefined") {
        setWaitingRoom(true);
        setWaitingRoomText(t(tr.TRY_TO_SHOW_PLAYER_ACCOUNT));

        try {
          while (!account.isReady()) {
            await sleep(100);
          }
          const response = await ServerRequest(
            "get",
            "/user/" + challengedPlayer
          );
          openAccountOverview(response.data[0]);
        } catch (error) {
          if (error.response) {
            if (error.response.status === 404) {
              showQuickMessage({
                text: t(tr.WARNING_PLAYER_NOT_FOUND, challengedPlayer),
              });
            } else {
              logger.warn(error, error.response.toString());
            }
          } else {
            logger.error(error);
          }
        } finally {
          setWaitingRoom(false);
        }
      }
    };
    checkForWaitingRoom();
  }, [challengedPlayer, showQuickMessage]);

  const estimateStage = () => {
    if (
      typeof state === "undefined" &&
      !choclabScreen &&
      !challengedProfile &&
      !waitingRoom
    ) {
      return "TITLE_SCREEN";
    } else if (state === engine.MatchPhase.FIELD_CHOICE) {
      return "CHOOSE_MENU";
    } else if (choclabScreen) {
      return "CHOCLAB_SCREEN";
    } else if (challengedProfile) {
      return "CHALLENGE_SCREEN";
    } else if (waitingRoom) {
      return "WAITING_ROOM";
    } else {
      return "INGAME";
    }
  };

  const resumeOrStartGame = () => {
    if (resumeGamePossible) {
      setOpen(true);
    } else {
      props.startGameCallback();
    }
  };

  const kickOffTutorial = async () => {
    multiplayer.tutorialStarted();
    startTutorial();
  };

  const skipTutorial = async () => {
    await multiplayer.tutorialSkipped();
  };

  // what is missing to unlock a menu entry: a first win (a coin) or a player name
  const notifyLocked = (feature) => {
    const score = playerInfos.stats.score || 0;
    props.showNotification({
      title: t(tr.COINS_FOR_NEXT_FEATURE_TITLE, feature),
      message: score < 1 ? t(tr.COINS_FOR_NEXT_FEATURE_BODY, feature, 1 - score) : t(tr.UNLOCK_NEEDS_NAME),
    });
  };

  const stage = estimateStage();
  return (
    <div className={className}>
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
        challengePlayer={(username) => {
          setShowAccountOverview(false);
          setShowOnlineLobby(true);
          liveLobby.invite(username);
        }}
        addFriend={async (friend) => {
          await multiplayer.addFriend(friend);
        }}
        removeFriend={async (friend) => {
          await multiplayer.removeFriend(friend);
        }}
        dialogStyle={dialogStyle}
        playerAccount={playerAccount}
        open={showAccountOverview}
        close={() => setShowAccountOverview(false)}
      />
      {(() => {
        if (stage === "CHOCLAB_SCREEN") {
          return (
            <div className={classes.actionbar}>
              <Fab
                color="secondary"
                icon="back"
                onClick={() => setChoclabScreen(false)}
              ></Fab>
            </div>
          );
        } else if (stage === "CHALLENGE_SCREEN") {
          return (
            <div className={classes.actionbar}>
              <Fab
                color="secondary"
                icon="back"
                onClick={() => setChallengedProfile(undefined)}
              ></Fab>
            </div>
          );
        } else if (stage === "WAITING_ROOM") {
          return null;
        } else {
          return (
            <Actionbar
              endGame={endGame}
              showSettings={(after) => {
                afterSettings.current = after;
                setOpenSettings(true);
              }}
              showSignInOrUp={openAccountOverview}
            />
          );
        }
      })()}

      {(() => {
        if (stage === "TITLE_SCREEN") {
          const controls = [];
          const playername = playerInfos.stats.username;
          const score = playerInfos.stats.score;
          const firstPlayScreen =
            playerInfos.stats.tutorialFinished === false &&
            playerInfos.stats.tutorialSkipped === false;
          // a first win unlocks the Choclab; friends also need a player name, under which
          // others find and invite you (the server assigns one once it is reachable)
          const unnamed = typeof playername === "undefined" || playername === "Chocnonymous";
          const lockedChoclab = score < 1;
          const lockedFriends = unnamed || score < 1;

          if (firstPlayScreen) {
            controls.push(
              <Button
                className={classes.menuButton}
                key="0"
                size="huge"
                onClick={() => kickOffTutorial()}
              >
                {t(tr.START_TUTORIAL)}
              </Button>
            );
            controls.push(
              <Button
                className={classes.menuButton}
                key="1"
                size="huge"
                color="accent"
                onClick={() => skipTutorial()}
              >
                {t(tr.SKIP_TUTORIAL)}
              </Button>
            );
            controls.push(
              <Button
                className={classes.menuButton}
                key="2"
                size="huge"
                color="secondary"
                offline={!online}
                onOfflineClick={props.showOfflineMessage}
                onClick={() => setShowAccountOverview(true)}
              >
                {t(tr.SIGNINORUP)}
              </Button>
            );
          } else {
            controls.push(
              <Button
                className={classes.menuButton}
                key="0"
                size="huge"
                onClick={() => resumeOrStartGame()}
              >
                {t(tr.START_GAME)}
              </Button>
            );
            controls.push(
              <Button
                className={classes.menuButton}
                key="2"
                size="huge"
                locked={lockedChoclab}
                onLockedClick={() => notifyLocked(t(tr.MAIN_MENU_CHOCLAB))}
                offline={!online}
                onOfflineClick={props.showOfflineMessage}
                color="accent"
                onClick={() => {
                  setChoclabScreen(true);
                }}
              >
                {t(tr.MAIN_MENU_CHOCLAB)}
              </Button>
            );
            // friends: invites and the lobby; others find you by your name
            controls.push(
              <Button
                className={classes.menuButton}
                key="3"
                size="huge"
                color="secondary"
                locked={lockedFriends}
                onLockedClick={() => notifyLocked(t(tr.FRIENDS))}
                offline={!online}
                onOfflineClick={props.showOfflineMessage}
                onClick={() => setShowOnlineLobby(true)}
              >
                {t(tr.FRIENDS)}
              </Button>
            );
          }

          return (
            <>
              <Dialog
                open={open}
                close={() => setOpen(false)}
                title={t(tr.HUD_RESUME_GAME)}
              >
                <div className={classes.resumeGameDialog}>
                  <p>{t(tr.HUD_ASK_NEW_OR_RESUME)}</p>
                  <div className={classes.actions}>
                    <Button
                      onClick={() => {
                        setOpen(false);
                        prepareNewGameCallback(true);
                      }}
                    >
                      {t(tr.HUD_RESUME_GAME)}
                    </Button>
                    <Button
                      color="accent"
                      onClick={() => {
                        setOpen(false);
                        props.startGameCallback();
                      }}
                    >
                      {t(tr.HUD_NEW_GAME)}
                    </Button>
                  </div>
                </div>
              </Dialog>
              <div className={classes.titleScreen}>
                <div className={classes.logo}>
                  <div />
                  <div />
                </div>
                <div className={classes.decoration} />
                <div className={classes.menu}>
                  {assetsReady ? controls : null}
                </div>
              </div>
              <Highscore
                offline={!online}
                showOfflineMessage={props.showOfflineMessage}
                playername={playername}
                showPlayerProfile={(session) =>
                  openAccountOverview(session.opponent, "stacked")
                }
                showQuickMessage={showQuickMessage}
              />
              <Dialog
                open={notification.open}
                mode="info"
                closable={false}
                title={notification.title}
              >
                <div className={classes.notification}>
                  <p>{notification.message}</p>
                  <Button
                    size="small"
                    style={{ marginRight: 32 }}
                    onClick={() => hideNotification()}
                  >
                    Ok
                  </Button>
                </div>
              </Dialog>
              <Info openInfo={openInfo} online={online} />
              <OnlineLobby
                open={showOnlineLobby}
                close={() => setShowOnlineLobby(false)}
              />
            </>
          );
        } else if (stage === "CHOOSE_MENU") {
          return (
            <div className="chooseStage">
              <GameStartSelection />
            </div>
          );
        } else if (stage === "CHOCLAB_SCREEN") {
          return <Choclab />;
        } else if (stage === "WAITING_ROOM") {
          return (
            <div className="waiting-room">
              <p>{waitingRoomText}</p>
              <Progress infiniteAnimation />
            </div>
          );
        } else {
          const result = game.outcome;
          return (
            <div>
              <MatchBanner />
              <InfoCard />
              <ResourcePanel />
              <BuildPalette />
              <WeaponPalette />
              {overviewVisible && result ? (
                <GameEndOverview
                  awards={(matchAwards || []).map((award) => ({
                    ...engine.matchAwards.find(
                      (candidate) => candidate.key === award.key
                    ),
                    xp: award.xp,
                  }))}
                  outcome={
                    result.winners.length === 1 &&
                    result.winners[0] === game.viewer
                      ? "won"
                      : "lost"
                  }
                  isWinner={result.winners.includes(game.viewer)}
                  verified={matchOnline}
                  drops={matchResult ? matchResult.drops : undefined}
                  finishGame={(xp) => endGame(xp)}
                />
              ) : null}
            </div>
          );
        }
      })()}
    </div>
  );
};

Hud.propTypes = {
  prepareNewGameCallback: PropTypes.func.isRequired,
  startGameCallback: PropTypes.func.isRequired,
  startTutorial: PropTypes.func.isRequired,
  endGame: PropTypes.func.isRequired,
  challengedPlayer: PropTypes.string,
  className: PropTypes.string.isRequired,
};

const mapStateToProps = (state) => ({
  game: selectActiveGame(state),
  matchAwards: state.match.awards,
  matchOnline: state.match.online,
  matchResult: state.match.result,
  state:
    typeof selectActiveGame(state) === "undefined"
      ? undefined
      : selectActiveGame(state).state || selectActiveGame(state).phase,
  overviewVisible: state.ui.overviewVisible,
  resumeGamePossible: state.ui.resumeGamePossible,
  assetsReady: state.ui.assetsReady,
  notification: state.ui.notification,
  playerInfos: state.ui.playerInfos,
  online: state.ui.online,
});

const mapDispatchToProps = {
  showQuickMessage,
  showOfflineMessage,
  showNotification,
  hideNotification,
};

const HudContainer = connect(mapStateToProps, mapDispatchToProps)(Hud);

export default HudContainer;
