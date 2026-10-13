import React, { useState, useEffect } from "react";
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
  showNotification,
  hideNotification,
} from "./UiActions";
import {
  Info,
  Tooltip,
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
  InfoPanel,
  BuildingPalette,
  AttackPalette,
  GameStartSelection,
  GameEndOverview,
} from "./controls";
import { createUseStyles } from "react-jss";
import { selectActiveGame, selectIsRealtime } from "../match/matchSlice";
import {
  BuildPalette,
  WeaponPalette,
  ResourcePanel,
  MatchBanner,
  InfoCard,
} from "./match";

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
      [theme.breakpoints.orientation.landscape]: {
        top: "5vh",
        width: "50vh",
        height: "50vh",
      },
      [theme.breakpoints.orientation.portrait]: {
        top: "12vh",
        width: "40vh",
        height: "40vh",
      },
    },
    "& > :last-child": {
      position: "absolute",
      background: "url(/images/stripes.svg) no-repeat",
      backgroundSize: "100%",
      zIndex: 0,
      animation: "pulse 20s linear 0s infinite",
      [theme.breakpoints.orientation.landscape]: {
        top: "-160vh",
        height: "350vh",
        width: "350vh",
        marginLeft: "-12vh",
      },
      [theme.breakpoints.orientation.portrait]: {
        top: "-85vh",
        height: "200vh",
        width: "200vh",
        marginLeft: "-10vh",
      },
    },
  },
  menu: {
    display: "flex",
    flexDirection: "column",
    position: "absolute",
    zIndex: 4,
    "& > div": {
      marginBottom: 6,
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
  coins: {
    position: "absolute",
    top: 5,
    right: 5,
    display: "flex",
    alignItems: "center",
    zIndex: 1,
    "& span": {
      color: "#fff",
      "-webkit-font-smoothing": "antialiased",
      fontFamily: "Bangers",
      marginRight: "1.5vw",
      fontSize: "calc(3.5vh + 3.5vw)",
      WebkitTextStroke: "calc(0.08vh + 0.08vw) #3C1C0C",
    },
    "& > div": {
      background: "url(/images/coins.svg) no-repeat",
      padding: "calc(2vh + 2vw) calc(3vh + 3vw)",
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
    fontSize: "5vw",
    textAlign: "center",
    [theme.breakpoints.orientation.landscape]: {
      fontSize: "3.4vw",
    },
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
    selectedAttack,
    tappedBuilding,
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
    realtime,
    matchAwards,
  } = props;

  const [open, setOpen] = useState(false);
  const [openSettings, setOpenSettings] = useState(false);
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
      prepareNewGameCallback(false);
    }
  };

  const kickOffTutorial = async () => {
    multiplayer.tutorialStarted();
    startTutorial();
  };

  const skipTutorial = async () => {
    await multiplayer.tutorialSkipped();
  };

  /*const notifyUnlock = (missingScore, feature) => {
        props.showNotification({ title: t(tr.COINS_FOR_NEXT_FEATURE_TITLE, feature), message: t(tr.COINS_FOR_NEXT_FEATURE_BODY, feature, missingScore) });
    }*/

  const stage = estimateStage();
  return (
    <div className={className}>
      <Settings
        startTutorial={kickOffTutorial}
        open={openSettings}
        close={() => setOpenSettings(false)}
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
              showSettings={() => setOpenSettings(true)}
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
          const locked =
            typeof playername === "undefined" ||
            playername === "Chocnonymous" ||
            score < 1;

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
                {typeof playername === "undefined" ||
                playername === "Chocnonymous"
                  ? t(tr.NEW_GAME)
                  : t(tr.MAIN_MENU_SINGLEPLAYER)}
              </Button>
            );
            controls.push(
              <Button
                className={classes.menuButton}
                key="1"
                size="huge"
                locked={locked}
                color="secondary"
                onClick={() => setShowOnlineLobby(true)}
              >
                {t(tr.ONLINE_TITLE)}
              </Button>
            );
            controls.push(
              <Button
                className={classes.menuButton}
                key="2"
                size="huge"
                locked={locked}
                color="accent"
                onClick={() => {
                  setChoclabScreen(true);
                }}
              >
                {t(tr.MAIN_MENU_CHOCLAB)}
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
                        prepareNewGameCallback(false);
                      }}
                    >
                      {t(tr.HUD_NEW_GAME)}
                    </Button>
                  </div>
                </div>
              </Dialog>
              <div className={classes.titleScreen}>
                {typeof playerInfos.stats.coins !== "undefined" ? (
                  <div className={classes.coins}>
                    <span>{playerInfos.stats.coins}</span>
                    <div />
                  </div>
                ) : null}
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
              <Info openInfo={openInfo} />
              <OnlineLobby
                open={showOnlineLobby}
                close={() => setShowOnlineLobby(false)}
              />
            </>
          );
        } else if (stage === "CHOOSE_MENU") {
          return (
            <div className="chooseStage">
              <Tooltip
                state={state}
                currentPlayerName={
                  game.players[multiplayer.localPlayerIndex].name
                }
                tappedBuilding={tappedBuilding}
                selectedAttack={selectedAttack}
                level={game.players[multiplayer.localPlayerIndex].level}
                playerTurn={multiplayer.isLocalPlayer(game.currentPlayerIndex)}
              />
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
        } else if (realtime) {
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
                    coins: award.coins,
                  }))}
                  outcome={
                    result.winners.length === 1 &&
                    result.winners[0] === game.viewer
                      ? "won"
                      : "lost"
                  }
                  finishGame={(coins) => endGame(coins)}
                />
              ) : null}
            </div>
          );
        } else {
          let player = game.players[multiplayer.localPlayerIndex];
          return (
            <div>
              <Tooltip
                state={state}
                currentPlayerName={player.name}
                tappedBuilding={tappedBuilding}
                selectedAttack={selectedAttack}
                level={player.level}
                playerTurn={multiplayer.isLocalPlayer(game.currentPlayerIndex)}
              />
              <AttackPalette />
              <BuildingPalette />
              <InfoPanel players={game.players} />
            </div>
          );
        }
      })()}
    </div>
  );
};

Hud.propTypes = {
  prepareNewGameCallback: PropTypes.func.isRequired,
  startTutorial: PropTypes.func.isRequired,
  endGame: PropTypes.func.isRequired,
  challengedPlayer: PropTypes.string,
  className: PropTypes.string.isRequired,
};

const mapStateToProps = (state) => ({
  game: selectActiveGame(state),
  realtime: selectIsRealtime(state),
  matchAwards: state.match.awards,
  state:
    typeof selectActiveGame(state) === "undefined"
      ? undefined
      : selectActiveGame(state).state || selectActiveGame(state).phase,
  overviewVisible: state.ui.overviewVisible,
  resumeGamePossible: state.ui.resumeGamePossible,
  assetsReady: state.ui.assetsReady,
  notification: state.ui.notification,
  playerInfos: state.ui.playerInfos,
  tappedBuilding: state.ui.tappedBuilding,
  selectedAttack: state.ui.selectedAttack,
});

const mapDispatchToProps = {
  showQuickMessage,
  showNotification,
  hideNotification,
};

const HudContainer = connect(mapStateToProps, mapDispatchToProps)(Hud);

export default HudContainer;
