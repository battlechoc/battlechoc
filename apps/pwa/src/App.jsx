import React, { Component, Suspense } from "react";
import { connect } from "react-redux";
import "./App.css";
import { Jukebox } from "./ui/misc";
import OfflineStore from "./OfflineStore";
import { ServerRequest } from "./helper/settings";
import { multiplayer } from "./Multiplayer";
import {
  PlayerType,
  translate as t,
  translationKeys as tr,
  setCurrentLanguage,
  EmptyPlayerStats,
  live,
  engine,
  unlocks,
  aiSetupScore,
} from "@battlechoc/battlechoc-shared-functions";
import { LocalMatchHost, matchSession } from "./match/LocalMatchHost";
import { RemoteMatchHost } from "./match/RemoteMatchHost";
import { liveConnection } from "./match/liveConnection";
import { liveLobby } from "./match/liveLobby";
import { account } from "./account";
import { MatchClock, ManualClock } from "./match/clock";
import { matchCleared } from "./match/matchSlice";
import {
  hideQuickMessage,
  showQuickMessage,
  startTutorial,
  stopTutorial,
  showOverview,
  resetUi,
  loadUiState,
  gameResumeable,
  updatePlayerStats,
  setPlayerRank,
  notifyPlayerSignedIn,
  showNotification,
  deselectBuildings,
  deselectAttack,
} from "./ui/UiActions";
import { debugScenarios } from "./situations/scenarios";
import { testHooksEnabled, exposeForTests } from "./testHooks";
import Hud from "./ui/Hud";
import { v4 as uuidv4 } from "uuid";
import IncomingInvite from "./ui/dialogs/IncomingInvite";
import ChallengeCard from "./ui/dialogs/ChallengeCard";
import { challengeViewed } from "./match/liveSlice";
import Matchmaking from "./ui/dialogs/Matchmaking";
import Unlocked from "./ui/dialogs/Unlocked";
import NameConflict from "./ui/dialogs/NameConflict";
import UpdateAvailable from "./ui/dialogs/UpdateAvailable";
import { loadUnlockState, takeNewUnlock } from "./unlocks";
import Tutorial from "./tutorial/Tutorial";
import QuickMessage from "./ui/dialogs/QuickMessage";
import logger from "./helper/logger";
import { LESSON } from "./tutorial/lesson";
import { allDemos } from "./tutorial/demos";
const Scene = React.lazy(() => import("./3d/Scene"));

// Start: the time limits to reach the live service before the local AI plays instead
const ACCOUNT_TIMEOUT_MS = 10000;
const LIVE_TIMEOUT_MS = 3000;
// after queue.ai: the time until the server's match message, else the local AI plays
const SERVER_MATCH_TIMEOUT_MS = 6000;
// a friend's challenge card that asks the server again after a reconnect
const REOPENED_CHALLENGES = ["connecting", "unreachable", "open", "waiting-for-challenger"];

class App extends Component {
  constructor(props) {
    super(props);
    // ?testclock replaces the real-time match clock with a manual one (e2e tests, test builds
    // only); read it before the path is reset below
    const query = new URLSearchParams(window.location.search);
    this.testClock = testHooksEnabled && query.has("testclock");
    // a friend's challenge link (battlechoc.com/?challenge=K7Q2-M9XD), or the code an iPhone's
    // home-screen app gets typed in (ChallengeDialog)
    this.challengeCode = live.normalizeChallengeCode(query.get("challenge")) || undefined;
    let path = window.location.pathname;
    // /privacy-policy/ is a page of its own (public/privacy-policy/index.html)
    if (/^(\/[a-zA-Z][a-zA-Z0-9_]{2,15})$/.test(path)) {
      var player = path.slice(1);
    } else if (testHooksEnabled && path.startsWith("/situation/")) {
      var situation = path.replace("/situation/", "").slice(0, 32);
    }

    if (path !== "/" || query.has("challenge")) {
      window.history.pushState({}, null, window.location.origin);
    }

    this.timeouts = [];
    this.state = {
      player: player,
      situation: situation,
      matchmaking: false,
      // the first win unlocked the buildings, the Choclab and online play
      unlocked: false,
    };
    // each Start counts up; a late answer of an earlier Start is ignored
    this.startAttempt = 0;
  }

  componentDidMount() {
    multiplayer.registerCallbacks({
      updatePlayerStats: this.props.updatePlayerStats,
      setPlayerRank: this.props.setPlayerRank,
      notifyPlayerSignedIn: this.props.notifyPlayerSignedIn,
      showQuickMessage: this.props.showQuickMessage,
      showNotification: this.props.showNotification,
      // a name chosen offline was taken meanwhile: the player chooses another (NameConflict)
      nameConflict: (conflict) => this.props.loadUiState({ nameConflict: conflict }),
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

    if (typeof this.challengeCode !== "undefined") {
      // the card shows at once, before the game has loaded; the server's answer fills it in
      // (without one, the card says the server cannot be reached)
      this.props.challengeViewed({ code: this.challengeCode, state: "connecting" });
    }
    this.connectLive();

    OfflineStore.settingsStore.get("tips").then((tips) => {
      if (tips === false) {
        this.props.loadUiState({ tipsEnabled: false });
      }
    });

    OfflineStore.settingsStore.get("autoFullscreen").then((autoFullscreen) => {
      if (autoFullscreen === false) {
        this.props.loadUiState({ autoFullscreen: false });
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

    // what the player has unlocked: decided from the stats on the device (src/unlocks.js)
    multiplayer
      .fetchPlayerStats(this.props.updatePlayerStats)
      .then((stats) => loadUnlockState(stats))
      .then((unlockState) => this.props.loadUiState({ earlyUnlock: Boolean(unlockState.early) }))
      .catch((error) => logger.warn("could not load the unlocks", error));

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

  componentDidUpdate(prevProps) {
    // a challenge opened during a match ("finish your match first") is asked again once it is over
    if (
      typeof prevProps.matchView !== "undefined" &&
      typeof this.props.matchView === "undefined" &&
      this.props.challengeView &&
      this.props.challengeView.state === "busy"
    ) {
      const { code } = this.props.challengeView;
      this.props.challengeViewed({ code, state: "connecting" });
      liveLobby.openChallenge(code).catch((error) => logger.info("could not open the challenge", error));
    }
    // a newcomer who opened a challenge got a name from the server (shown on the card)
    const view = this.props.challengeView;
    const ownName = this.props.playerInfos.stats.username;
    if (
      view &&
      view.name &&
      view !== prevProps.challengeView &&
      (typeof ownName === "undefined" || ownName === EmptyPlayerStats.username)
    ) {
      multiplayer.usernameSynced(view.name).catch((error) => logger.warn("could not keep the name", error));
    }

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
  }

  // fullscreen (landscape on Android) needs the click of the player: call it synchronously.
  // The settings can turn it off.
  requestFullscreen() {
    if (!this.props.autoFullscreen) {
      return;
    }
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
  }

  // the tutorial, Resume of a saved local match, or a new match against the local AI (offline)
  prepareNewGame = (resumeGame, { fullscreen = true } = {}) => {
    if (fullscreen) {
      this.requestFullscreen();
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
      // new players start with a prepared board (engine.aiMatchSetup, by score)
      this.startRealtimeMatch();
    }
  };

  // Start: every match runs on the server when it is reachable, so it is verified and gives
  // ingredients. Players up to 100 XP play the server AI right away (the prepared first game,
  // chosen by the server from the XP in its database); everyone else joins the queue (a human,
  // or the server AI after a while). New players get the tutorial; without the server the local
  // AI plays.
  startGame = () => {
    const stats = this.props.playerInfos.stats;
    const newPlayer = !stats.tutorialFinished && !stats.tutorialSkipped;
    if (newPlayer || !navigator.onLine) {
      this.prepareNewGame(false);
      return;
    }
    this.requestFullscreen();
    // the prepared first match, and every match until online play is unlocked, is against the AI
    const againstAi =
      aiSetupScore(stats, { early: this.props.earlyUnlock }) <= engine.FIRST_GAME_MAX_SCORE ||
      !unlocks(stats, { early: this.props.earlyUnlock }).online;
    const attempt = ++this.startAttempt;
    const current = () => attempt === this.startAttempt;
    const playLocally = () => {
      if (current()) {
        this.startAttempt++;
        this.prepareNewGame(false, { fullscreen: false });
      }
    };
    this.reachLiveService().then((connected) => {
      if (!current()) {
        return;
      }
      if (!connected) {
        playLocally();
      } else if (againstAi) {
        liveLobby.playAiNow().catch((error) => logger.info("AI match failed", error));
        // the match message normally follows at once; without it the local AI plays
        const timeoutId = setTimeout(playLocally, SERVER_MATCH_TIMEOUT_MS);
        this.timeouts.push(timeoutId);
      } else {
        this.setState({ matchmaking: true });
        liveLobby.joinQueue().catch((error) => logger.info("queue failed", error));
      }
    });
  };

  // resolves true once the live service welcomed us. The account token comes first with its own
  // time limit (the first start registers the device account), so only the WebSocket races the
  // 3 s; an open connection answers at once.
  reachLiveService() {
    if (liveConnection.status === "online") {
      return liveLobby.enter().then(
        () => true,
        () => false
      );
    }
    const within = (promise, ms) =>
      Promise.race([
        promise.then(() => true),
        new Promise((resolve) => setTimeout(() => resolve(false), ms)),
      ]).catch(() => false);
    return within(account.token(), ACCOUNT_TIMEOUT_MS).then(
      (ready) => ready && within(liveLobby.enter(), LIVE_TIMEOUT_MS)
    );
  }

  cancelMatchmaking = () => {
    this.startAttempt++;
    this.setState({ matchmaking: false });
    liveLobby.leaveQueue().catch((error) => logger.info("leaving the queue failed", error));
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
          // a friend's challenge card asks the server (again, after a reconnect)
          const view = this.props.challengeView;
          if (view && REOPENED_CHALLENGES.includes(view.state)) {
            liveLobby.openChallenge(view.code);
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
  startOnlineMatch = ({ matchId, playerIndex, epoch, kind }) => {
    this.startAttempt++;
    this.setState({ matchmaking: false });
    if (typeof matchSession.host !== "undefined") {
      matchSession.host.persist(true);
      matchSession.host.stop();
      // a rematch from the end screen: the finished board goes before the new one comes
      if (this.props.matchView && this.props.matchView.phase === engine.MatchPhase.ENDED) {
        matchSession.dispatch(matchCleared());
        if (typeof this.scene !== "undefined") {
          this.scene.clear();
        }
      }
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
      kind,
      onEnded: (result) => {
        const timeoutId = setTimeout(() => this.showRealtimeOverview(result), 2000);
        this.timeouts.push(timeoutId);
      },
    });
    matchSession.host = host;
    exposeForTests({
      host,
      engine,
      live: liveConnection,
      view: () => this.props.matchView,
    });
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
    exposeForTests({ host, engine });
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
    const seed = `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
    // the same setup as the server AI: board and opponent by score (below 800 the easy Tom
    // Toffee, afterwards Gustav Ganache with a handicap), the prepared first game up to a score
    // of 100 unless a scenario is given, no hurry for field choice and placement
    // (XP from challenges does not count before the player's own online unlock: the beginner track)
    const { boardSize, opponent, balance, scenario: prepared } = engine.aiMatchSetup(
      aiSetupScore(stats, { early: this.props.earlyUnlock }),
      { scenario }
    );
    host.startNew({
      balance,
      players: [
        {
          id: this.props.playerInfos.uid || "local-player",
          name: "Carolin Cacao",
          type: PlayerType.HUMAN,
          // the equipment from the lab (AI opponents play without)
          loadout: stats.loadout,
        },
        {
          id: opponent.id,
          name: opponent.name,
          type: opponent.type,
        },
      ],
      boardSize,
      seed,
      agents: [
        { ...opponent.agent, playerIndex: 1, seed: `${seed}-ai`, reactionTimeMs: 1000 },
      ],
      scenario: prepared,
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

  endGame() {
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
          // the match may have unlocked something (buildings after each of the first three, the
          // Choclab and online play after the fourth): one dialog says what
          multiplayer
            .fetchPlayerStats()
            .then((stats) => takeNewUnlock(stats))
            .then((unlock) => {
              if (unlock) {
                this.setState({ unlocked: unlock });
              }
            })
            .catch((error) => logger.warn("could not check the unlocks", error));

          if (/Android/i.test(navigator.userAgent) && window.screen.orientation) {
            window.screen.orientation.unlock();
          }

          this.scene.clear();
        }
      }, 1000);
    }
  }

  closeTutorial = async (startGame) => {
    this.timeouts.forEach((timeoutId) => clearTimeout(timeoutId));

    Jukebox.stopMusic(true);
    this.props.stopTutorial();
    this.props.resetUi();

    if (startGame) {
      this.startGame();
    }
  };

  // the interactive first lesson
  startTutorial() {
    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
    Jukebox.startMusic(Jukebox.SONGS.MAIN_THEME);
    this.props.startTutorial({ loops: [LESSON] });
  }

  // the demos of the buildings unlocked after the first win
  showBuildingDemos() {
    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
    Jukebox.startMusic(Jukebox.SONGS.MAIN_THEME);
    this.props.startTutorial({ loops: allDemos });
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
          startGameCallback={this.startGame}
          startTutorial={() => this.startTutorial()}
          showBuildingDemos={() => this.showBuildingDemos()}
          className={this.props.tutorial ? "tutorial hud" : "hud"}
          endGame={() => this.endGame()}
          challengedPlayer={this.state.player}
        />
        <IncomingInvite />
        <ChallengeCard
          learn={() => {
            multiplayer.tutorialStarted();
            this.startTutorial();
          }}
          startMatch={() => this.startGame()}
        />
        <NameConflict />
        <UpdateAvailable />
        <Unlocked
          unlock={this.state.unlocked || undefined}
          gamesLeft={
            unlocks(this.props.playerInfos.stats, { early: this.props.earlyUnlock }).gamesLeft.online
          }
          close={() => this.setState({ unlocked: false })}
          showDemos={() => {
            this.setState({ unlocked: false });
            this.showBuildingDemos();
          }}
        />
        <Matchmaking
          open={this.state.matchmaking}
          cancel={this.cancelMatchmaking}
          playAiNow={() =>
            liveLobby.playAiNow().catch((error) => logger.info("AI match failed", error))
          }
        />
        {this.props.tutorial ? (
          <Tutorial
            closeTutorial={this.closeTutorial}
            clearScene={() => this.scene && this.scene.clear()}
            testClock={this.testClock}
          />
        ) : null}
      </div>
    );
  }
}

const mapStateToProps = (state) => ({
  matchView: state.match.view,
  language: state.ui.language,
  selectedBuilding: state.ui.selectedBuilding,
  ui: state.ui,
  tutorial: state.ui.tutorial,
  assetsReady: state.ui.assetsReady,
  playerInfos: state.ui.playerInfos,
  quickMessages: state.ui.quickMessages,
  autoFullscreen: state.ui.autoFullscreen,
  earlyUnlock: state.ui.earlyUnlock,
  challengeView: state.live.challengeView,
});

const mapDispatchToProps = {
  loadUiState,
  gameResumeable,
  resetUi,
  showOverview,
  startTutorial,
  stopTutorial,
  updatePlayerStats,
  setPlayerRank,
  notifyPlayerSignedIn,
  hideQuickMessage,
  showQuickMessage,
  showNotification,
  deselectBuildings,
  deselectAttack,
  challengeViewed,
};

const AppContainer = connect(mapStateToProps, mapDispatchToProps)(App);

export default AppContainer;
