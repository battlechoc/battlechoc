import {
  engine,
  unlocks,
  PlayerType,
} from "@battlechoc/battlechoc-shared-functions";
import { matchCleared } from "./matchSlice.js";
import {
  resetUi,
  deselectBuildings,
  deselectAttack,
  showOverview,
  gameResumeable,
  startTutorial,
  stopTutorial,
} from "../ui/uiSlice.js";
import { LESSON, allDemos } from "../tutorial/ids.js";

// Start: the time limits to reach the live service before the local AI plays instead
export const ACCOUNT_TIMEOUT_MS = 10000;
export const LIVE_TIMEOUT_MS = 3000;
// after queue.ai: the time until the server's match message, else the local AI plays
export const SERVER_MATCH_TIMEOUT_MS = 6000;
// the end screen follows the last hit after a moment
export const OVERVIEW_DELAY_MS = 2000;
// leaving: the music fades before the board goes
export const LEAVE_DELAY_MS = 1000;
// a friend's challenge card that asks the server again after a reconnect
export const REOPENED_CHALLENGES = [
  "connecting",
  "unreachable",
  "open",
  "waiting-for-challenger",
];

const noop = () => {};

/**
 * The life of a match, from Start to the title screen: which match starts (the tutorial, the
 * server's, the local AI's), its host, the end screen and the teardown. A plain module: the store,
 * the hosts and the services come in as `deps`, so the tests can hand in fakes.
 *
 * deps:
 * - dispatch, getState: the store
 * - session: { host } the running host is kept in (matchSession: the HUD submits through it)
 * - createLocalHost(options), createRemoteHost(options): LocalMatchHost, RemoteMatchHost
 * - createClock(): the clock of a local match
 * - liveLobby, liveConnection, account: the live service (match/liveLobby.js, liveConnection.js,
 *   api account)
 * - savedMatch: { get, save, clear, exists } the local match kept for Resume (IndexedDB)
 * - jukebox: music and sounds
 * - multiplayer: { fetchPlayerStats, pushGameStats } the player's stats
 * - takeNewUnlock(stats): what a match has just unlocked (src/unlocks.js)
 * - scene(): the 3D scene, once it is there
 * - requestFullscreen(): fullscreen for a match (needs the player's click: called synchronously)
 * - isOnline(): whether the browser has a network
 * - onMatchmaking(open), onUnlock(unlock): the Matchmaking and Unlocked dialogs (App's state)
 * - expose(hooks): window.__battlechoc for the e2e tests
 * - releaseOrientation(): undoes the landscape lock of a match
 * - uuid(), logger
 */
export const createMatchController = (deps) => {
  const {
    dispatch,
    getState,
    session,
    createLocalHost,
    createRemoteHost,
    createClock,
    liveLobby,
    liveConnection,
    account,
    savedMatch,
    jukebox,
    multiplayer,
    takeNewUnlock,
    scene = () => undefined,
    requestFullscreen = noop,
    isOnline = () => true,
    onMatchmaking = noop,
    onUnlock = noop,
    expose = noop,
    releaseOrientation = noop,
    uuid,
    logger,
  } = deps;

  // each Start counts up; a late answer of an earlier Start is ignored
  let attempt = 0;
  // the timers of the match (the end screen, the fallback to the local AI): the tutorial's end
  // stops what is still pending
  const timers = new Set();
  const later = (fn, ms) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  };
  const clearTimers = () => {
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
  };

  const stats = () => getState().ui.playerInfos.stats;
  const isNewPlayer = () =>
    !stats().tutorialFinished && !stats().tutorialSkipped;

  // a new match starts on a board without selections
  const freshBoard = () => {
    dispatch(resetUi());
    dispatch(deselectBuildings());
    dispatch(deselectAttack());
  };

  const showRealtimeOverview = (result) => {
    jukebox.stopMusic(true);
    dispatch(showOverview());
    if (result.online) {
      // the server credited the match already
      multiplayer.fetchPlayerStats();
      return;
    }
    dispatch(gameResumeable(false));
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
        id: uuid(),
      },
    ]);
  };

  // the end screen of every match, local or online
  const onEnded = (result) =>
    later(() => showRealtimeOverview(result), OVERVIEW_DELAY_MS);

  // the interactive first lesson
  const playLesson = () => {
    jukebox.playSound(jukebox.SOUNDS.UI_ACCEPT);
    jukebox.startMusic(jukebox.SONGS.MAIN_THEME);
    dispatch(startTutorial({ loops: [LESSON] }));
  };

  // the demos of the buildings unlocked after the first win
  const showBuildingDemos = () => {
    jukebox.playSound(jukebox.SOUNDS.UI_ACCEPT);
    jukebox.startMusic(jukebox.SONGS.MAIN_THEME);
    dispatch(startTutorial({ loops: allDemos }));
  };

  // starts (or resumes) a real-time single player match hosted on this device
  const startLocalMatch = (saved, scenario) => {
    if (typeof session.host !== "undefined") {
      session.host.stop();
    }
    const host = createLocalHost({
      dispatch,
      clock: createClock(),
      save: (data) =>
        typeof data === "undefined"
          ? savedMatch.clear()
          : savedMatch.save(data),
      onEnded,
    });
    session.host = host;
    expose({ host, engine });
    freshBoard();

    if (typeof saved !== "undefined") {
      try {
        host.restore(saved);
        return host;
      } catch (error) {
        logger.warn("could not resume the saved match", error);
      }
    }
    const { playerInfos } = getState().ui;
    const seed = `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
    // the same setup as the server AI: board and opponent by the player's AI ladder (Tom Toffee,
    // then Gustav Ganache stronger step by step), the prepared first game for the very first match
    // unless a scenario is given, no hurry for field choice and placement
    const {
      boardSize,
      opponent,
      balance,
      scenario: prepared,
    } = engine.aiLadderSetup(engine.aiLadderOf(playerInfos.stats), {
      scenario,
    });
    host.startNew({
      balance,
      players: [
        {
          id: playerInfos.uid || "local-player",
          name: "Carolin Cacao",
          type: PlayerType.HUMAN,
          // the equipment from the lab (AI opponents play without)
          loadout: playerInfos.stats.loadout,
        },
        { id: opponent.id, name: opponent.name, type: opponent.type },
      ],
      boardSize,
      seed,
      agents: [
        {
          ...opponent.agent,
          playerIndex: 1,
          seed: `${seed}-ai`,
          reactionTimeMs: 1000,
        },
      ],
      scenario: prepared,
    });
    return host;
  };

  // the tutorial, Resume of a saved local match, or a new match against the local AI (offline)
  const startLocal = (resume, { fullscreen = true } = {}) => {
    if (fullscreen) {
      requestFullscreen();
    }
    if (isNewPlayer()) {
      playLesson();
      return;
    }
    jukebox.startMusic(jukebox.SONGS.MAIN_THEME);
    jukebox.playSound(jukebox.SOUNDS.UI_ACCEPT);
    if (resume) {
      return savedMatch.get().then((saved) => {
        startLocalMatch(saved);
      });
    }
    dispatch(gameResumeable(false));
    savedMatch.clear();
    // the opponent and board come from the AI ladder; the very first match is a prepared board
    startLocalMatch();
    return undefined;
  };

  // resolves true once the live service welcomed us. The account token comes first with its own
  // time limit (the first start registers the device account), so only the WebSocket races the
  // 3 s; an open connection answers at once.
  const reachLiveService = () => {
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
  };

  // Start: every match runs on the server when it is reachable, so it is verified and gives
  // ingredients. Players up to 100 XP play the server AI right away (the prepared first game,
  // chosen by the server from the XP in its database); everyone else joins the queue (a human,
  // or the server AI after a while). New players get the tutorial; without the server the local
  // AI plays.
  const startGame = () => {
    if (isNewPlayer() || !isOnline()) {
      return startLocal(false);
    }
    requestFullscreen();
    const current = stats();
    // the prepared first match, and every match until online play is unlocked, is against the AI
    const againstAi =
      engine.aiLadderOf(current).games === 0 ||
      !unlocks(current, { early: getState().ui.earlyUnlock }).online;
    const mine = ++attempt;
    const stillMine = () => mine === attempt;
    const playLocally = () => {
      if (stillMine()) {
        attempt++;
        startLocal(false, { fullscreen: false });
      }
    };
    return reachLiveService().then((connected) => {
      if (!stillMine()) {
        return;
      }
      if (!connected) {
        playLocally();
      } else if (againstAi) {
        liveLobby
          .playAiNow()
          .catch((error) => logger.info("AI match failed", error));
        // the match message normally follows at once; without it the local AI plays
        later(playLocally, SERVER_MATCH_TIMEOUT_MS);
      } else {
        onMatchmaking(true);
        liveLobby
          .joinQueue()
          .catch((error) => logger.info("queue failed", error));
      }
    });
  };

  const cancelMatchmaking = () => {
    attempt++;
    onMatchmaking(false);
    liveLobby
      .leaveQueue()
      .catch((error) => logger.info("leaving the queue failed", error));
  };

  const playAiNow = () =>
    liveLobby
      .playAiNow()
      .catch((error) => logger.info("AI match failed", error));

  // plays an online match hosted by the server (from the queue, an invite or a resume)
  const startOnlineMatch = ({ matchId, playerIndex, epoch, kind }) => {
    attempt++;
    onMatchmaking(false);
    if (typeof session.host !== "undefined") {
      session.host.persist(true);
      session.host.stop();
      // a rematch from the end screen: the finished board goes before the new one comes
      const view = getState().match.view;
      if (view && view.phase === engine.MatchPhase.ENDED) {
        dispatch(matchCleared());
        if (typeof scene() !== "undefined") {
          scene().clear();
        }
      }
    }
    if (getState().ui.tutorial) {
      dispatch(stopTutorial());
    }
    const host = createRemoteHost({
      dispatch,
      connection: liveConnection,
      matchId,
      playerIndex,
      epoch,
      kind,
      onEnded,
    });
    session.host = host;
    expose({
      host,
      engine,
      live: liveConnection,
      view: () => getState().match.view,
    });
    freshBoard();
    jukebox.startMusic(jukebox.SONGS.MAIN_THEME);
    return host;
  };

  // the match is over or left: its host goes, the title screen comes back
  const closeMatch = () => {
    const host = session.host;
    if (typeof host === "undefined") {
      return;
    }
    if (host.online) {
      // leaving a running online match gives it up; the server keeps finished ones
      const view = getState().match.view;
      if (view && view.phase !== engine.MatchPhase.ENDED) {
        host
          .surrender()
          .catch((error) => logger.info("surrender failed", error));
      }
      liveLobby.matchLeft();
    }
    host.persist(true);
    host.stop();
    session.host = undefined;
    dispatch(matchCleared());
    savedMatch
      .exists()
      .then((resumeable) => dispatch(gameResumeable(resumeable)));
    dispatch(resetUi());
    // the match may have unlocked something (buildings after each of the first three, the
    // Choclab and online play after the fourth): one dialog says what
    multiplayer
      .fetchPlayerStats()
      .then((stats) => takeNewUnlock(stats))
      .then((unlock) => {
        if (unlock) {
          onUnlock(unlock);
        }
      })
      .catch((error) => logger.warn("could not check the unlocks", error));
    releaseOrientation();
    if (typeof scene() !== "undefined") {
      scene().clear();
    }
  };

  // back to the title screen from a match (the tutorial ends through closeTutorial)
  const endGame = () => {
    if (getState().ui.tutorial) {
      return;
    }
    jukebox.stopMusic(true);
    later(closeMatch, LEAVE_DELAY_MS);
  };

  const closeTutorial = (thenStartGame) => {
    clearTimers();
    jukebox.stopMusic(true);
    dispatch(stopTutorial());
    dispatch(resetUi());
    if (thenStartGame) {
      startGame();
    }
  };

  // the way back after a crash of the interface (ui/ErrorBoundary.jsx): what ran is stopped, the
  // title screen comes back. A local match is kept for Resume, an online one is given up.
  const recover = () => {
    jukebox.stopMusic(true);
    attempt++;
    onMatchmaking(false);
    if (getState().ui.tutorial) {
      dispatch(stopTutorial());
    }
    try {
      closeMatch();
    } catch (error) {
      logger.error("could not close the match", String(error));
      session.host = undefined;
      dispatch(matchCleared());
    }
    dispatch(resetUi());
  };

  // Keeps the live connection while the app is visible: invites arrive, and a running online
  // match (reload, other device) is resumed. `page` is the document (visibilityState and its
  // visibilitychange event).
  const keepLiveConnection = (page) => {
    liveLobby.init({
      dispatch,
      getState,
      onMatch: (message) => startOnlineMatch(message),
    });
    liveLobby.onMatchGone = () => {
      if (session.host && session.host.online) {
        endGame();
      }
    };
    const enter = () =>
      account
        .token()
        .then(() => liveLobby.enter())
        .then(() => {
          // a friend's challenge card asks the server (again, after a reconnect)
          const view = getState().live.challengeView;
          if (view && REOPENED_CHALLENGES.includes(view.state)) {
            liveLobby.openChallenge(view.code);
          }
        })
        .catch((error) => logger.info("live service not reachable", error));
    page.addEventListener("visibilitychange", () => {
      const inOnlineMatch = session.host && session.host.online;
      if (page.visibilityState === "hidden" && !inOnlineMatch) {
        liveLobby.leave();
      } else if (page.visibilityState === "visible") {
        enter();
      }
    });
    return enter();
  };

  return {
    startGame,
    startLocal,
    startLocalMatch,
    startOnlineMatch,
    reachLiveService,
    cancelMatchmaking,
    playAiNow,
    endGame,
    closeMatch,
    closeTutorial,
    recover,
    playLesson,
    showBuildingDemos,
    keepLiveConnection,
    // how many Starts there were (each makes the answers of the earlier ones late)
    get attempt() {
      return attempt;
    },
    get pendingTimers() {
      return timers.size;
    },
  };
};
