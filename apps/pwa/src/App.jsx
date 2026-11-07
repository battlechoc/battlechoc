import React, { Component, Suspense } from "react";
import { connect } from "react-redux";
import "./App.css";
import { Jukebox } from "./ui/misc";
import OfflineStore from "./OfflineStore";
import { multiplayer } from "./Multiplayer";
import { EmptyPlayerStats, engine, unlocks } from "@battlechoc/battlechoc-shared-functions";
import { LocalMatchHost, matchSession } from "./match/LocalMatchHost";
import { RemoteMatchHost } from "./match/RemoteMatchHost";
import { liveConnection } from "./match/liveConnection";
import { liveLobby } from "./match/liveLobby";
import { createMatchController } from "./match/matchController";
import { account } from "./account";
import { MatchClock, ManualClock } from "./match/clock";
import { hideQuickMessage } from "./ui/uiSlice";
import { debugScenarios } from "./situations/scenarios";
import { exposeForTests } from "./testHooks";
import Hud from "./ui/Hud";
import ErrorBoundary from "./ui/ErrorBoundary";
import { uuid } from "./helper/uuid";
import { enterMatchFullscreen, releaseOrientation } from "./helper/fullscreen";
import { boot, readLaunchAddress } from "./boot";
// loaded after the title screen (src/ui/onDemand.js)
import {
  IncomingInvite,
  ChallengeCard,
  Matchmaking,
  Unlocked,
  NameConflict,
  UpdateAvailable,
  Tutorial,
} from "./ui/onDemand";
import { challengeViewed } from "./match/liveSlice";
import { takeNewUnlock } from "./unlocks";
import QuickMessage from "./ui/dialogs/QuickMessage";
import logger from "./helper/logger";
const Scene = React.lazy(() => import("./3d/Scene"));

// The app's frame: the 3D scene, the HUD and the dialogs over it. What starts and ends a match
// is match/matchController.js, the start of the game boot.js.
class App extends Component {
  constructor(props) {
    super(props);
    // read before the address is reset to the origin
    const launch = readLaunchAddress();
    this.testClock = launch.testClock;
    this.challengeCode = launch.challengeCode;
    this.state = {
      player: launch.player,
      situation: launch.situation,
      matchmaking: false,
      // what the last match unlocked (dialogs/Unlocked.jsx)
      unlocked: false,
    };
    this.match = createMatchController({
      dispatch: matchSession.dispatch,
      getState: matchSession.getState,
      session: matchSession,
      createLocalHost: (options) => new LocalMatchHost(options),
      createRemoteHost: (options) => new RemoteMatchHost(options),
      createClock: () => (this.testClock ? new ManualClock() : new MatchClock()),
      liveLobby,
      liveConnection,
      account,
      savedMatch: {
        get: () => OfflineStore.getRealtimeMatch(),
        save: (data) => OfflineStore.saveRealtimeMatch(data),
        clear: () => OfflineStore.clearRealtimeMatch(),
        exists: () => OfflineStore.hasGameToResume(),
      },
      jukebox: Jukebox,
      multiplayer,
      takeNewUnlock,
      scene: () => this.scene,
      // the settings can turn it off
      requestFullscreen: () => {
        if (matchSession.getState().settings.autoFullscreen) {
          enterMatchFullscreen();
        }
      },
      isOnline: () => navigator.onLine,
      onMatchmaking: (open) => this.setState({ matchmaking: open }),
      onUnlock: (unlock) => this.setState({ unlocked: unlock }),
      expose: exposeForTests,
      releaseOrientation,
      uuid,
      logger,
    });
  }

  componentDidMount() {
    boot({
      dispatch: matchSession.dispatch,
      challengeCode: this.challengeCode,
      connectLive: () => this.match.keepLiveConnection(document),
      onLanguage: () => this.forceUpdate(),
    });
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
      // the 3D models are in: now the music and the match sounds may take the connection
      Jukebox.loadDeferred();
      const debugScenario = debugScenarios[this.state.situation];
      if (typeof debugScenario !== "undefined") {
        this.setState({ situation: undefined });
        this.match.startLocalMatch(undefined, debugScenario);
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

  render() {
    const match = this.match;
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
        {/* the 3D scene cannot be set up a second time in the same page: after its crash the
            way back reloads */}
        <ErrorBoundary
          name="scene"
          onRecover={() => {
            match.recover();
            window.location.reload();
          }}
        >
          <Suspense fallback={null}>
            <Scene onRef={(scene) => (this.scene = scene)} />
          </Suspense>
        </ErrorBoundary>
        <ErrorBoundary name="hud" onRecover={match.recover}>
          <Hud
            prepareNewGameCallback={(resume) => match.startLocal(resume)}
            startGameCallback={match.startGame}
            startTutorial={match.playLesson}
            showBuildingDemos={match.showBuildingDemos}
            className={this.props.tutorial ? "tutorial hud" : "hud"}
            endGame={match.endGame}
            challengedPlayer={this.state.player}
          />
          <Suspense fallback={null}>
            <IncomingInvite />
            <ChallengeCard
              learn={() => {
                multiplayer.tutorialStarted();
                match.playLesson();
              }}
              startMatch={match.startGame}
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
                match.showBuildingDemos();
              }}
            />
            <Matchmaking
              open={this.state.matchmaking}
              cancel={match.cancelMatchmaking}
              playAiNow={match.playAiNow}
            />
          </Suspense>
          {this.props.tutorial ? (
            <Suspense fallback={null}>
              <Tutorial
                closeTutorial={match.closeTutorial}
                clearScene={() => this.scene && this.scene.clear()}
                testClock={this.testClock}
              />
            </Suspense>
          ) : null}
        </ErrorBoundary>
      </div>
    );
  }
}

// (not the whole of state.ui: it changes up to twenty times a second while the models load, and
// App never read it; every change re-rendered the app)
const mapStateToProps = (state) => ({
  matchView: state.match.view,
  tutorial: state.ui.tutorial,
  assetsReady: state.ui.assetsReady,
  playerInfos: state.ui.playerInfos,
  quickMessages: state.ui.quickMessages,
  earlyUnlock: state.ui.earlyUnlock,
  challengeView: state.live.challengeView,
});

const mapDispatchToProps = {
  hideQuickMessage,
  challengeViewed,
};

const AppContainer = connect(mapStateToProps, mapDispatchToProps)(App);

export default AppContainer;
