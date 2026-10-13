import React, { Component, Suspense } from "react";
import { connect } from "react-redux";
import "./App.css";
import { Jukebox } from "./ui/misc";
import OfflineStore from "./OfflineStore";
import { ServerRequest } from "./helper/settings";
import { multiplayer } from "./Multiplayer";
import {
  Rules,
  GameStateTypes,
  PlayerType,
  EntityType,
  isDonut,
  translate as t,
  translationKeys as tr,
  setCurrentLanguage,
  engine,
} from "@battlechoc/battlechoc-shared-functions";
import { LocalMatchHost, matchSession } from "./match/LocalMatchHost";
import { RemoteMatchHost } from "./match/RemoteMatchHost";
import { liveConnection } from "./match/liveConnection";
import { liveLobby } from "./match/liveLobby";
import { account } from "./account";
import { MatchClock, ManualClock } from "./match/clock";
import { matchCleared } from "./match/matchSlice";
import { resumeGame, finishGame, endGame } from "./gameplay/GameActions";
import {
  hideQuickMessage,
  showQuickMessage,
  startTutorial,
  stopTutorial,
  showOverview,
  resetUi,
  selectAttack,
  gameResumeable,
  loadUiState,
  updatePlayerStats,
  loadFriendsList,
  setPlayerRank,
  notifyPlayerSignedIn,
  tapBuilding,
  selectBuilding,
  toggleDonutHighlighting,
  showNotification,
  deselectBuildings,
  deselectAttack,
} from "./ui/UiActions";
import { scenarios, debugScenarios } from "./situations/scenarios";
import Hud from "./ui/Hud";
import { v4 as uuidv4 } from "uuid";
import IncomingInvite from "./ui/dialogs/IncomingInvite";
import Tutorial from "./tutorial/Tutorial";
import QuickMessage from "./ui/dialogs/QuickMessage";
import logger from "./helper/logger";
import { TutorialSituations } from "./situations/tutorial/";
const Scene = React.lazy(() => import("./3d/Scene"));

class App extends Component {
  constructor(props) {
    super(props);
    // ?testclock replaces the real-time match clock with a manual one (e2e tests); read it
    // before the path is reset below
    const query = new URLSearchParams(window.location.search);
    this.testClock = query.has("testclock");
    // an invite to a live match, opened from its push notification
    this.inviteId = query.get("invite") || undefined;
    let path = window.location.pathname;
    let openInfo = false;
    if (path === "/privacy-policy") {
      openInfo = true;
    } else if (/^(\/[a-zA-Z][a-zA-Z0-9_]{2,15})$/.test(path)) {
      var player = path.slice(1);
    } else if (path.startsWith("/situation/")) {
      var situation = path.replace("/situation/", "").slice(0, 32);
    }

    if (path !== "/" || query.has("invite")) {
      window.history.pushState({}, null, window.location.origin);
    }

    this.timeouts = [];
    this.state = {
      player: player,
      situation: situation,
      openInfo: openInfo,
    };
  }

  detonateAtPosition = (row, col, playerField = true) => {
    try {
      const position = { row: row, col: col };
      let playerIndex = multiplayer.localPlayerIndex;
      if (!playerField) {
        playerIndex = 1 - playerIndex;
        position.row -= this.scene.opponentGameFieldDistance;
        position.col += this.scene.opponentGameFieldDistance;
      }

      this.scene.detonateAtPosition(row, col, playerField);
      const playerBoard =
        this.props.game.board.fields[
          this.props.game.players[playerIndex].fieldIndex
        ];
      const selectedCell =
        playerBoard.grid[row * this.props.game.board.size.cols + col];

      if (
        selectedCell.occupiedBy.filter(
          (entity) => entity.type !== EntityType.CREAM && !isDonut(entity.type)
        ).length > 0 ||
        selectedCell.shielded
      ) {
        let entity = selectedCell.occupiedBy.filter(
          (entity) => !isDonut(entity.type)
        )[0];

        const entitiesWithHp = selectedCell.occupiedBy.filter(
          (entity) => entity.type !== EntityType.CREAM && !isDonut(entity.type)
        );
        if (entitiesWithHp.length > 0) {
          entity = entitiesWithHp[0];
        }

        this.scene.showEnergyBar(entity, position, playerField);
      } else {
        this.scene.hideEnergyBar(null, position);
      }
    } catch (error) {
      logger.warn(error);
    }
  };

  componentDidMount() {
    multiplayer.registerCallbacks({
      updatePlayerStats: this.props.updatePlayerStats,
      loadFriendsList: this.props.loadFriendsList,
      setPlayerRank: this.props.setPlayerRank,
      notifyPlayerSignedIn: this.props.notifyPlayerSignedIn,
      showQuickMessage: this.props.showQuickMessage,
      showNotification: this.props.showNotification,
    });

    let browserLanguage = "en";
    if (navigator.userLanguage) {
      browserLanguage = navigator.userLanguage.substr(0, 2);
    } else if (navigator.language) {
      browserLanguage = navigator.language.substr(0, 2);
    }

    OfflineStore.settingsStore.get("language").then((language) => {
      const languageValue =
        typeof language !== "undefined" ? language : browserLanguage;
      setCurrentLanguage(languageValue, () => {
        ServerRequest("post", "/user/language", { language: languageValue })
          .catch((error) => {
            if (!(error instanceof ReferenceError)) {
              console.warn(error);
            }
          })
          .finally(() =>
            OfflineStore.settingsStore.set("language", languageValue)
          );
      });
      this.forceUpdate();
    });

    this.connectLive();

    OfflineStore.playerStore.get("friends").then((friends) => {
      if (typeof friends !== "undefined") {
        this.props.loadFriendsList(friends);
      }
    });

    OfflineStore.hasGameToResume().then((resumeable) => {
      this.props.gameResumeable(resumeable);
    });

    if (this.props.language !== "en") {
      document
        .querySelector('meta[name="description"]')
        .setAttribute("content", t(tr.META_DESCRIPTION));
      document
        .querySelector('meta[name="keywords"]')
        .setAttribute("content", t(tr.META_KEYWORDS));
    }

    window.onfocus = () => Jukebox.playMusic();
    window.onblur = () => Jukebox.pauseMusic();

    multiplayer.fetchPlayerStats(this.props.updatePlayerStats);

    let iOSDevice = /^(iPhone|iPad|iPod)/.test(navigator.platform);
    let isFullscreen =
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement;
    let isPWA = window.matchMedia("(display-mode: fullscreen)").matches;

    if (iOSDevice && !isFullscreen && !isPWA) {
      OfflineStore.settingsStore.get("iOSMessage").then((iOSMessage) => {
        if (typeof iOSMessage === "undefined") {
          this.props.showQuickMessage({
            text: t(tr.IOS_MESSAGE),
            variant: "apple-pwa-hint",
            autoHideDuration: 6000,
          });
          OfflineStore.settingsStore.set("iOSMessage", "hide next time");
        }
      });
    }
  }

  availableTutorials = () => {
    const tutorials = [
      TutorialSituations.BATTLECHOC_INTRO,
      TutorialSituations.FACTORY,
      TutorialSituations.CACAO_TREE,
      TutorialSituations.RUM_TRUFFLE_CANNON,
      TutorialSituations.CREAM,
    ];

    const score = this.props.playerInfos.stats.score;
    if (score > 1000) {
      tutorials.push(TutorialSituations.FACTORY_EXTENSION);
      tutorials.push(TutorialSituations.EASTER_BUNNY);
      tutorials.push(TutorialSituations.XMAS_FACTORY);
      tutorials.push(TutorialSituations.HOT_CHOCOLATE_BALLISTA);
      tutorials.push(TutorialSituations.CHOCOLATE_FOUNTAIN);
      tutorials.push(TutorialSituations.FRUIT_CANNON);
      tutorials.push(TutorialSituations.DONUT_FACTORY);
      tutorials.push(TutorialSituations.DONUTS);
    } else if (score > 500) {
      tutorials.push(TutorialSituations.FACTORY_EXTENSION);
      tutorials.push(TutorialSituations.EASTER_BUNNY);
      tutorials.push(TutorialSituations.XMAS_FACTORY);
      tutorials.push(TutorialSituations.HOT_CHOCOLATE_BALLISTA);
      tutorials.push(TutorialSituations.CHOCOLATE_FOUNTAIN);
      tutorials.push(TutorialSituations.FRUIT_CANNON);
    } else if (score > 200) {
      tutorials.push(TutorialSituations.FACTORY_EXTENSION);
      tutorials.push(TutorialSituations.EASTER_BUNNY);
      tutorials.push(TutorialSituations.XMAS_FACTORY);
      tutorials.push(TutorialSituations.HOT_CHOCOLATE_BALLISTA);
    } else if (score > 0) {
      tutorials.push(TutorialSituations.FACTORY_EXTENSION);
    }

    return tutorials;
  };

  // loads a scripted tutorial loop; real matches and debug boards are real-time scenarios
  async loadSituation(situation) {
    if (typeof this.props.game !== "undefined") {
      this.timeouts.forEach((timeoutId) => clearTimeout(timeoutId));
      this.scene.clear();
      await this.props.finishGame({
        issuer: this.props.game.players[multiplayer.localPlayerIndex].id,
      });
      await this.props.resetUi();
    }

    await this.props.resumeGame(situation.gameplay);
    await this.props.loadUiState(situation.ui);
    this.setState({ situation: undefined }, () => {
      this.scene.startGame(this.props.game, false);
    });
  }

  componentDidUpdate(prevProps) {
    if (!prevProps.assetsReady && this.props.assetsReady) {
      const debugScenario = debugScenarios[this.state.situation];
      if (typeof debugScenario !== "undefined") {
        this.setState({ situation: undefined });
        this.startRealtimeMatch(undefined, debugScenario);
      }
    }

    // a real-time match renders its boards as soon as the fields are assigned
    if (
      typeof this.props.matchView !== "undefined" &&
      typeof this.scene !== "undefined" &&
      this.scene.playerGameField === null &&
      this.props.matchView.phase !== engine.MatchPhase.FIELD_CHOICE
    ) {
      this.scene.startGame(this.props.matchView);
    }

    let gameStopped =
      typeof this.props.game !== "undefined"
        ? !this.props.game.isRunning
        : false;
    if (
      typeof this.props.game !== "undefined" &&
      typeof prevProps.game !== "undefined"
    ) {
      if (prevProps.game.isRunning && !this.props.game.isRunning) {
        gameStopped = true;
        let timeoutId = setTimeout(() => this.endGame(), 2000);
        this.timeouts.push(timeoutId);
      }
    }

    if (typeof this.scene !== "undefined") {
      if (typeof this.scene.playerGameField !== "undefined") {
        if (
          this.props.selectedBuilding === EntityType.FRUIT_CANNON &&
          prevProps.selectedBuilding !== EntityType.FRUIT_CANNON
        ) {
          this.scene.highlightCannons();
        } else if (
          this.props.selectedBuilding !== EntityType.FRUIT_CANNON &&
          prevProps.selectedBuilding === EntityType.FRUIT_CANNON
        ) {
          this.scene.highlightCannons(false);
        }
      }
    }

    if (!gameStopped) {
      if (
        this.props.game !== undefined &&
        (this.props.game.state === GameStateTypes.BUILD_PHASE ||
          this.props.game.state === GameStateTypes.ATTACK_PHASE)
      ) {
        const winners = Rules.determineWinner(this.props.game);
        if (typeof winners !== "undefined") {
          prevProps.endGame({
            winners: winners,
            issuer: this.props.game.players[multiplayer.localPlayerIndex].id,
          });
        }
      }

      if (
        prevProps.selectedBuilding === EntityType.FRUIT_CANNON &&
        typeof this.scene !== "undefined" &&
        typeof this.scene.playerGameField !== "undefined" &&
        typeof this.props.game !== "undefined" &&
        (this.props.game.state !== GameStateTypes.BUILD_PHASE ||
          !multiplayer.isLocalPlayer(this.props.game.currentPlayerIndex) ||
          this.props.game.players[multiplayer.localPlayerIndex].buildings ===
            0 ||
          this.props.selectedBuilding !== EntityType.FRUIT_CANNON)
      ) {
        this.scene.highlightCannons(false);
      }

      if (!prevProps.donutHighlighting && this.props.donutHighlighting) {
        this.scene.highlightDonuts();
      }

      if (prevProps.donutHighlighting && !this.props.donutHighlighting) {
        this.scene.highlightDonuts(false);
      }

      if (
        this.props.donutHighlighting &&
        (multiplayer.isLocalPlayer(prevProps.game.currentPlayerIndex) !==
          multiplayer.isLocalPlayer(this.props.game.currentPlayerIndex) ||
          (prevProps.game.state === GameStateTypes.BUILD_PHASE &&
            this.props.game.state === GameStateTypes.ATTACK_PHASE))
      ) {
        this.props.toggleDonutHighlighting(false);
      }
    }
  }

  prepareNewGame = (resumeGame) => {
    const isElectronApp =
      navigator.userAgent.toLowerCase().indexOf(" electron/") > -1;
    const isAndroidDevice = /Android/i.test(navigator.userAgent);
    const isiOS = /^(iPhone|iPad|iPod)/.test(navigator.platform);
    const isFullscreen =
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement;

    if (!isFullscreen && !isiOS && !isElectronApp) {
      if (typeof document.documentElement.requestFullscreen === "function") {
        document.documentElement
          .requestFullscreen()
          .then(() => {
            if (isAndroidDevice) {
              window.screen.orientation
                .lock("landscape")
                .catch((error) =>
                  logger.info("Unable to lock orientation to landscape")
                );
            }
          })
          .catch((error) => {
            logger.warn(error.name + ": " + error.message);
          });
      }
    }

    if (
      !this.props.playerInfos.stats.tutorialFinished &&
      !this.props.playerInfos.stats.tutorialSkipped
    ) {
      this.startTutorial();
    } else {
      Jukebox.startMusic(Jukebox.SONGS.MAIN_THEME);
      Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);

      if (resumeGame) {
        OfflineStore.getRealtimeMatch().then((saved) => {
          this.startRealtimeMatch(saved);
        });
        return;
      }
      this.props.gameResumeable(false);
      OfflineStore.clearRealtimeMatch();
      // new players start with a prepared board
      this.startRealtimeMatch(
        undefined,
        this.props.playerInfos.stats.score <= 100 ? scenarios.firstGame : undefined
      );
    }
  };

  // keeps the live connection while the app is visible: invites arrive, and a running online
  // match (reload, other device) is resumed
  connectLive() {
    liveLobby.init({
      dispatch: matchSession.dispatch,
      onMatch: (message) => this.startOnlineMatch(message),
    });
    liveLobby.onMatchGone = () => {
      if (matchSession.host && matchSession.host.online) {
        this.endGame();
      }
    };
    const enter = () =>
      account
        .token()
        .then(() => liveLobby.enter())
        .then(() => {
          if (typeof this.inviteId !== "undefined") {
            liveLobby.acceptInvite(this.inviteId);
            this.inviteId = undefined;
          }
        })
        .catch((error) => logger.info("live service not reachable", error));
    document.addEventListener("visibilitychange", () => {
      const inOnlineMatch = matchSession.host && matchSession.host.online;
      if (document.visibilityState === "hidden" && !inOnlineMatch) {
        liveLobby.leave();
      } else if (document.visibilityState === "visible") {
        enter();
      }
    });
    enter();
  }

  // plays an online match hosted by the server (from the queue, an invite or a resume)
  startOnlineMatch = ({ matchId, playerIndex, epoch }) => {
    if (typeof matchSession.host !== "undefined") {
      matchSession.host.persist(true);
      matchSession.host.stop();
    }
    if (this.props.tutorial) {
      this.props.stopTutorial();
    }
    const host = new RemoteMatchHost({
      dispatch: matchSession.dispatch,
      connection: liveConnection,
      matchId,
      playerIndex,
      epoch,
      onEnded: (result) => {
        const timeoutId = setTimeout(() => this.showRealtimeOverview(result), 2000);
        this.timeouts.push(timeoutId);
      },
    });
    matchSession.host = host;
    window.__battlechoc = {
      host,
      engine,
      live: liveConnection,
      view: () => this.props.matchView,
    };
    this.props.resetUi();
    this.props.deselectBuildings();
    this.props.deselectAttack();
    Jukebox.startMusic(Jukebox.SONGS.MAIN_THEME);
  };

  // starts (or resumes) a real-time single player match hosted on this device
  startRealtimeMatch = (saved, scenario) => {
    const stats = this.props.playerInfos.stats;
    if (typeof matchSession.host !== "undefined") {
      matchSession.host.stop();
    }
    const host = new LocalMatchHost({
      dispatch: matchSession.dispatch,
      clock: this.testClock ? new ManualClock() : new MatchClock(),
      save: (data) =>
        typeof data === "undefined"
          ? OfflineStore.clearRealtimeMatch()
          : OfflineStore.saveRealtimeMatch(data),
      onEnded: (result) => {
        const timeoutId = setTimeout(() => this.showRealtimeOverview(result), 2000);
        this.timeouts.push(timeoutId);
      },
    });
    matchSession.host = host;
    window.__battlechoc = { host, engine };
    this.props.resetUi();
    this.props.deselectBuildings();
    this.props.deselectAttack();

    if (typeof saved !== "undefined") {
      try {
        host.restore(saved);
        return;
      } catch (error) {
        logger.warn("could not resume the saved match", error);
      }
    }
    const boardSize =
      typeof scenario !== "undefined"
        ? scenario.boardSize
        : engine.boardSizeForScore(stats.score);
    const seed = `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
    // below a score of 800 the easy Tom Toffee, afterwards Gustav Ganache with a handicap by score
    const opponent = engine.aiOpponentForScore(stats.score, {
      forceEasy: typeof scenario !== "undefined" && scenario.opponent === "TomToffee",
    });
    host.startNew({
      players: [
        {
          id: this.props.playerInfos.uid || "local-player",
          name: "Carolin Cacao",
          type: PlayerType.HUMAN,
          level: stats.level,
        },
        {
          id: opponent.id,
          name: opponent.name,
          type: opponent.type,
          level: stats.level,
        },
      ],
      boardSize,
      seed,
      agents: [
        { ...opponent.agent, playerIndex: 1, seed: `${seed}-ai`, reactionTimeMs: 1000 },
      ],
      scenario: typeof scenario !== "undefined" ? scenario.scenario : undefined,
    });
  };

  showRealtimeOverview(result) {
    Jukebox.stopMusic(true);
    this.props.showOverview();
    if (result.online) {
      // the server credited the match already
      multiplayer.fetchPlayerStats();
      return;
    }
    this.props.gameResumeable(false);
    multiplayer.pushGameStats([
      {
        ...result.statistics,
        winners: result.winners.map((winner) => ({
          id: winner.id,
          name: winner.name,
          type: winner.type,
          idx: winner.idx,
        })),
        awards: result.awards,
        id: uuidv4(),
      },
    ]);
  }

  endGame(coins) {
    if (!this.props.tutorial) {
      Jukebox.stopMusic(true);
      setTimeout(() => {
        const host = matchSession.host;
        if (typeof host !== "undefined") {
          if (host.online) {
            // leaving a running online match gives it up; the server keeps finished ones
            if (this.props.matchView && this.props.matchView.phase !== engine.MatchPhase.ENDED) {
              host.surrender().catch((error) => logger.info("surrender failed", error));
            }
            liveLobby.matchLeft();
          }
          host.persist(true);
          host.stop();
          matchSession.host = undefined;
          matchSession.dispatch(matchCleared());
          OfflineStore.hasGameToResume().then((resumeable) =>
            this.props.gameResumeable(resumeable)
          );
          this.props.resetUi();
          multiplayer.fetchPlayerStats();

          if (/Android/i.test(navigator.userAgent) && window.screen.orientation) {
            window.screen.orientation.unlock();
          }

          this.scene.clear();

          const score = this.props.playerInfos.stats.score;
          if (typeof coins !== "undefined" && coins > 0) {
            let loops = [];
            let notificationOnLoopsEnd = undefined;
            if (score - coins === 0) {
              loops.push(TutorialSituations.FACTORY_EXTENSION);
              loops.push(
                TutorialSituations.EASTER_BUNNY,
                TutorialSituations.XMAS_FACTORY,
                TutorialSituations.HOT_CHOCOLATE_BALLISTA
              );
              loops.push(
                TutorialSituations.CHOCOLATE_FOUNTAIN,
                TutorialSituations.FRUIT_CANNON
              );
              loops.push(
                TutorialSituations.DONUT_FACTORY,
                TutorialSituations.DONUTS
              );
              this.props.showQuickMessage({
                text: t(tr.UNLOCK_CONGRATULATIONS_CHOCLAB),
                variant: "success",
              });
              this.props.showQuickMessage({
                text: t(tr.UNLOCK_CONGRATULATIONS_MULTIPLAYER),
                variant: "success",
              });
              this.props.startTutorial({
                loops: loops,
                notificationOnLoopsEnd: notificationOnLoopsEnd,
              });
            }
          }
        }
      }, 1000);
    }
  }

  async reset() {
    if (typeof this.props.game !== "undefined") {
      this.scene.stopAllAnimations();
      this.scene.clear();
      await this.props.finishGame({
        issuer: this.props.game.players[multiplayer.localPlayerIndex].id,
      });
      await this.props.resetUi();
    }
  }

  setRenderLoop(run) {
    this.scene.setRenderLoop(run);
  }

  closeTutorial = async (startGame) => {
    this.timeouts.forEach((timeoutId) => clearTimeout(timeoutId));

    Jukebox.stopMusic(true);
    console.log("stopping tutorial");
    this.props.stopTutorial();
    await this.reset();

    if (startGame) {
      this.prepareNewGame(false);
    }
  };

  startTutorial() {
    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
    Jukebox.startMusic(Jukebox.SONGS.MAIN_THEME);
    this.props.startTutorial({ loops: this.availableTutorials() });
  }

  render() {
    return (
      <div className="app">
        {this.props.quickMessages.length > 0 ? (
          <div
            style={{
              position: "absolute",
              flexDirection: "column",
              display: "flex",
              alignItems: "center",
              zIndex: 100,
              top: 0,
              left: 0,
              width: "100%",
            }}
          >
            {this.props.quickMessages.map((message) => (
              <QuickMessage
                open={true}
                key={message.id}
                variant={message.variant}
                onClose={() => {
                  this.props.hideQuickMessage(message.id);
                }}
                message={message.text}
                autoHideDuration={message.autoHideDuration}
              />
            ))}
          </div>
        ) : null}
        <Suspense fallback={null}>
          <Scene onRef={(scene) => (this.scene = scene)} />
        </Suspense>
        <Hud
          prepareNewGameCallback={this.prepareNewGame}
          startTutorial={() => this.startTutorial()}
          className={this.props.tutorial ? "tutorial hud" : "hud"}
          endGame={(coins) => this.endGame(coins)}
          challengedPlayer={this.state.player}
          openInfo={this.state.openInfo}
        />
        <IncomingInvite />
        {this.props.tutorial ? (
          <Tutorial
            spawnInfo={(messageType, position, amount, donutType) =>
              this.scene.spawnInfo(messageType, position, amount, donutType)
            }
            setRenderLoop={(run) => this.setRenderLoop(run)}
            reset={async () => await this.reset()}
            detonateAtPosition={this.detonateAtPosition}
            selectBuilding={this.props.selectBuilding}
            tapBuilding={this.props.tapBuilding}
            selectAttack={this.props.selectAttack}
            loadSituation={async (situation) =>
              await this.loadSituation(situation)
            }
            closeTutorial={this.closeTutorial}
          />
        ) : null}
      </div>
    );
  }
}

const mapStateToProps = (state) => ({
  matchView: state.match.view,
  gameplay: state.gameplay,
  game: state.gameplay.game,
  language: state.ui.language,
  selectedBuilding: state.ui.selectedBuilding,
  donutHighlighting: state.ui.donutHighlighting,
  ui: state.ui,
  tutorial: state.ui.tutorial,
  assetsReady: state.ui.assetsReady,
  playerInfos: state.ui.playerInfos,
  quickMessages: state.ui.quickMessages,
});

const mapDispatchToProps = {
  endGame,
  resumeGame,
  finishGame,
  selectAttack,
  gameResumeable,
  loadUiState,
  resetUi,
  showOverview,
  startTutorial,
  stopTutorial,
  updatePlayerStats,
  loadFriendsList,
  setPlayerRank,
  notifyPlayerSignedIn,
  selectBuilding,
  tapBuilding,
  hideQuickMessage,
  showQuickMessage,
  toggleDonutHighlighting,
  showNotification,
  deselectBuildings,
  deselectAttack,
};

const AppContainer = connect(mapStateToProps, mapDispatchToProps)(App);

export default AppContainer;
