import React, { Suspense, useState, useEffect, useRef } from "react";
import "./Hud.css";
import { connect } from "react-redux";
import {
  engine,
  unlocks,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import {
  showQuickMessage,
  showOfflineMessage,
  showNotification,
  hideNotification,
} from "./UiActions";
import Info from "./dialogs/Info";
import Dialog from "./dialogs/Dialog";
import Highscore from "./dialogs/Highscore";
// loaded after the title screen (src/ui/onDemand.js)
import {
  Settings,
  AccountOverview,
  ChallengeDialog,
  Choclab,
  GameEndOverview,
} from "./onDemand";
import { liveLobby } from "../match/liveLobby";
import { matchSession } from "../match/LocalMatchHost";
import { retryAssets } from "../firstLoad";
import { multiplayer } from "../Multiplayer";
import { ServerRequest } from "../helper/settings";
import logger from "../helper/logger";
import { account } from "../account";
import Button from "./controls/Button";
import Fab from "./controls/Fab";
import Progress from "./controls/Progress";
import Actionbar from "./controls/Actionbar";
import GameStartSelection from "./controls/GameStartSelection";
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
// of logo.svg's 1209 × 924). index.html shows the logo in the same box before the script has
// arrived (its splash): change the top or the size there too.
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
    top: theme.edge.top,
    left: theme.edge.left,
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
  // the menu starts at about half the screen's height; when it does not fit below that (phones
  // held sideways), the space above it shrinks, so it never reaches the bottom edge
  lowerHalf: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: theme.edge.bottom,
    zIndex: 4,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    pointerEvents: "none",
  },
  spaceAboveMenu: {
    flex: "0 1 auto",
    minHeight: 0,
    // as a share of the whole screen, the bottom edge included
    height: `calc((100% + ${theme.edge.bottom}) * 0.48)`,
    [theme.breakpoints.orientation.landscape]: {
      "@media screen and (max-height: 339px)": {
        height: `calc((100% + ${theme.edge.bottom}) * 0.55)`,
      },
    },
  },
  // how many matches until the Choclab and online play, below the menu
  unlockHint: {
    flex: "0 0 auto",
    maxWidth: "min(90vw, 30em)",
    margin: "0.2em 0 0",
    textAlign: "center",
    fontFamily: theme.font.display,
    fontSize: theme.font.size.md,
    letterSpacing: "0.03em",
    color: "white",
    "-webkit-text-stroke": `${theme.font.stroke} ${theme.color.secondary.dark}`,
    "-webkit-font-smoothing": "antialiased",
  },
  menu: {
    flex: "0 0 auto",
    display: "flex",
    flexDirection: "column",
    pointerEvents: "auto",
    // the menu buttons share the width of the widest
    "& > div": {
      marginBottom: 6,
      width: "100%",
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
  // the bottom of a match: what to build (its tips above it) at the left, the weapons at the
  // right, always an edge apart; the buildings wrap instead of running into the weapons. Only
  // the buttons take the pointer, the space between them belongs to the board.
  matchBar: {
    position: "absolute",
    left: theme.edge.left,
    right: theme.edge.right,
    bottom: theme.edge.bottom,
    zIndex: 4,
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: theme.edge.gap,
    pointerEvents: "none",
  },
  buildColumn: {
    flex: "1 1 auto",
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: theme.edge.gap,
  },
  titleScreen: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    zIndex: 2,
    // the page's height, not 100vh: mobile browsers take vh with their toolbar hidden, so the
    // screen grew under the toolbar and the info button at the bottom went behind it
    height: "100%",
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
  // "Play with a friend": null (closed), or { locked, lockText }
  const [challengeDialog, setChallengeDialog] = useState(null);
  // a challenge that arrived after the dialog was closed: cancel it (liveSlice challengeToCancel)
  useEffect(() => {
    if (props.challengeToCancel) {
      liveLobby.cancelChallenge(props.challengeToCancel).catch(() => {});
    }
  }, [props.challengeToCancel]);
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

  // what the player has unlocked by playing (shared progression.js, src/unlocks.js)
  const unlocked = unlocks(playerInfos.stats, { early: props.earlyUnlock });

  // what is missing to unlock a menu entry: more matches against the AI, or a player name
  const lockMessage = (feature, part) => {
    const left = unlocked.gamesLeft[part];
    return left > 1
      ? t(tr.UNLOCK_FEATURE_GAMES, feature, left)
      : left === 1
      ? t(tr.UNLOCK_FEATURE_ONE_GAME, feature)
      : t(tr.UNLOCK_NEEDS_NAME);
  };
  const notifyLocked = (feature, part) => {
    props.showNotification({
      title: t(tr.COINS_FOR_NEXT_FEATURE_TITLE, feature),
      message: lockMessage(feature, part),
    });
  };

  const stage = estimateStage();
  let unlockHint = null;
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
          const firstPlayScreen =
            playerInfos.stats.tutorialFinished === false &&
            playerInfos.stats.tutorialSkipped === false;
          // a few matches against the AI unlock the Choclab and online play; friends also need
          // a player name, under which others find and invite you (the server assigns one once
          // it is reachable)
          const unnamed = typeof playername === "undefined" || playername === "Chocnonymous";
          const lockedChoclab = !unlocked.choclab;
          const lockedFriends = unnamed || !unlocked.online;
          // how far the next step is, under the menu
          const gamesLeft = unlocked.gamesLeft.online;
          unlockHint =
            !firstPlayScreen && gamesLeft > 0
              ? gamesLeft === 1
                ? t(tr.UNLOCK_ONLINE_ONE_GAME)
                : t(tr.UNLOCK_ONLINE_GAMES, gamesLeft)
              : null;

          // the start button waits for the 3D models: it fills up while they load and offers
          // another try when one did not arrive (AssetLoader); everything else works at once
          const startButton = (label, start) => (
            <Button
              className={classes.menuButton}
              key="0"
              size="huge"
              data-testid="start-button"
              progress={assetsReady || props.assetsFailed ? undefined : props.assetsProgress}
              onClick={() => (assetsReady ? start() : retryAssets())}
            >
              {assetsReady ? label : props.assetsFailed ? t(tr.ASSETS_FAILED) : t(tr.ASSETS_LOADING)}
            </Button>
          );
          if (firstPlayScreen) {
            controls.push(startButton(t(tr.START_TUTORIAL), () => kickOffTutorial()));
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
            controls.push(startButton(t(tr.START_GAME), () => resumeOrStartGame()));
            controls.push(
              <Button
                className={classes.menuButton}
                key="2"
                size="huge"
                locked={lockedChoclab}
                onLockedClick={() => notifyLocked(t(tr.MAIN_MENU_CHOCLAB), "choclab")}
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
            // a challenge link for a friend; locked, the dialog still takes a friend's code
            controls.push(
              <Button
                className={classes.menuButton}
                key="3"
                size="huge"
                color="secondary"
                locked={lockedFriends}
                onLockedClick={() =>
                  setChallengeDialog({
                    locked: true,
                    lockText: lockMessage(t(tr.CHALLENGE_BUTTON), "online"),
                  })
                }
                offline={!online}
                onOfflineClick={props.showOfflineMessage}
                onClick={() => setChallengeDialog({ locked: false })}
              >
                {t(tr.CHALLENGE_BUTTON)}
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
                <div className={classes.lowerHalf}>
                  <div className={classes.spaceAboveMenu} />
                  <div className={classes.menu}>
                    {/* the title screen shows once the fonts are in (no jumping labels) */}
                    {assetsReady || props.fontsReady ? controls : null}
                  </div>
                  {(assetsReady || props.fontsReady) && unlockHint ? (
                    <p className={classes.unlockHint} data-testid="unlock-hint">
                      {unlockHint}
                    </p>
                  ) : null}
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
              <Info online={online} />
              {/* also open by itself for a challenge the welcome restored after a reload */}
              <Suspense fallback={null}>
                <ChallengeDialog
                  open={challengeDialog !== null || props.challenge !== null}
                  locked={challengeDialog !== null && challengeDialog.locked}
                  lockText={challengeDialog !== null ? challengeDialog.lockText : undefined}
                  close={() => setChallengeDialog(null)}
                />
              </Suspense>
            </>
          );
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
              <p>{waitingRoomText}</p>
              <Progress infiniteAnimation />
            </div>
          );
        } else {
          const result = game.outcome;
          // after a challenge match both may ask for another one (a challenge again)
          const rematchable = Boolean(matchOnline && props.matchKind === "challenge" && matchSession.host);
          const opponentName = game.players[1 - game.viewer].name;
          const rematchStatus = !rematchable
            ? undefined
            : props.outgoingInvite
            ? t(tr.REMATCH_WAITING, opponentName)
            : props.inviteClosed === "declined" || props.inviteClosed === "expired"
            ? t(tr.REMATCH_DECLINED, opponentName)
            : props.liveError === "PLAYER_OFFLINE"
            ? t(tr.REMATCH_GONE, opponentName)
            : undefined;
          return (
            <div>
              <MatchBanner />
              <ResourcePanel />
              <div className={classes.matchBar}>
                <div className={classes.buildColumn}>
                  <InfoCard />
                  <BuildPalette />
                </div>
                <WeaponPalette />
              </div>
              {overviewVisible && result ? (
                <Suspense fallback={null}>
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
                    rematch={
                      rematchable && !props.outgoingInvite
                        ? () => liveLobby.requestRematch(matchSession.host.matchId).catch(() => {})
                        : undefined
                    }
                    rematchStatus={rematchStatus}
                    finishGame={() => endGame()}
                  />
                </Suspense>
              ) : null}
            </div>
          );
        }
      })()}
    </div>
  );
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
  fontsReady: state.ui.fontsReady,
  assetsProgress: state.ui.assetsProgress,
  assetsFailed: state.ui.assetsFailed,
  notification: state.ui.notification,
  playerInfos: state.ui.playerInfos,
  online: state.ui.online,
  earlyUnlock: state.ui.earlyUnlock,
  challenge: state.live.challenge,
  challengeToCancel: state.live.challengeToCancel,
  matchKind: state.match.kind,
  outgoingInvite: state.live.outgoingInvite,
  inviteClosed: state.live.inviteClosed,
  liveError: state.live.error,
});

const mapDispatchToProps = {
  showQuickMessage,
  showOfflineMessage,
  showNotification,
  hideNotification,
};

const HudContainer = connect(mapStateToProps, mapDispatchToProps)(Hud);

export default HudContainer;
