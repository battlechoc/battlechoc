// The life of a match (node --test): which match Start opens, the attempt counter that drops late
// answers, the end screen, the teardown and the recovery, with fake hosts and a fake live service.
import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { configureStore } from "@reduxjs/toolkit";
import { engine } from "@battlechoc/battlechoc-shared-functions";
import {
  uiReducer,
  updatePlayerStats,
  startTutorial as tutorialStarted,
} from "../../src/ui/uiSlice.js";
import { matchReducer, matchUpdated } from "../../src/match/matchSlice.js";
import { liveReducer } from "../../src/match/liveSlice.js";
import { settingsReducer } from "../../src/settingsSlice.js";
import {
  createMatchController,
  SERVER_MATCH_TIMEOUT_MS,
  OVERVIEW_DELAY_MS,
  LEAVE_DELAY_MS,
  ACCOUNT_TIMEOUT_MS,
} from "../../src/match/matchController.js";
import { LESSON, allDemos } from "../../src/tutorial/ids.js";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

// lets pending promise callbacks run
const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
};

class FakeHost {
  constructor(options, online) {
    this.options = options;
    this.online = online;
    this.calls = [];
    this.stopped = false;
  }
  startNew(setup) {
    this.calls.push(["startNew", setup]);
  }
  restore(saved) {
    if (saved === "broken") {
      throw new Error("Unsupported saved match");
    }
    this.calls.push(["restore", saved]);
  }
  persist(force) {
    this.calls.push(["persist", force]);
  }
  stop() {
    this.stopped = true;
  }
  surrender() {
    this.calls.push(["surrender"]);
    return Promise.resolve();
  }
}

const setup = ({ stats = {}, connected = "online", online = true } = {}) => {
  const store = configureStore({
    reducer: {
      ui: uiReducer,
      match: matchReducer,
      live: liveReducer,
      settings: settingsReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(
    updatePlayerStats({
      username: "Tester",
      score: 150,
      tutorialFinished: true,
      ...stats,
    })
  );
  const hosts = [];
  const lobby = {
    sent: [],
    enter: () =>
      connected === "online" ? Promise.resolve() : new Promise(() => {}),
    playAiNow() {
      this.sent.push("playAiNow");
      return Promise.resolve();
    },
    joinQueue() {
      this.sent.push("joinQueue");
      return Promise.resolve();
    },
    leaveQueue() {
      this.sent.push("leaveQueue");
      return Promise.resolve();
    },
    matchLeft() {
      this.sent.push("matchLeft");
    },
    init(options) {
      this.initOptions = options;
    },
    leave() {
      this.sent.push("leave");
    },
    openChallenge(code) {
      this.sent.push(["openChallenge", code]);
    },
  };
  const events = [];
  const saved = { match: undefined };
  const deps = {
    dispatch: store.dispatch,
    getState: store.getState,
    session: { host: undefined },
    createLocalHost: (options) => {
      const host = new FakeHost(options, false);
      hosts.push(host);
      return host;
    },
    createRemoteHost: (options) => {
      const host = new FakeHost(options, true);
      hosts.push(host);
      return host;
    },
    createClock: () => "clock",
    liveLobby: lobby,
    liveConnection: {
      status: connected === "online" ? "online" : "connecting",
    },
    account: {
      token: () =>
        connected === "no-account"
          ? new Promise(() => {})
          : Promise.resolve("token"),
    },
    savedMatch: {
      get: async () => saved.match,
      save: async (data) => {
        saved.match = data;
      },
      clear: async () => {
        saved.match = undefined;
        events.push("cleared");
      },
      exists: async () => typeof saved.match !== "undefined",
    },
    jukebox: {
      SONGS: { MAIN_THEME: "main" },
      SOUNDS: { UI_ACCEPT: "accept" },
      startMusic: () => events.push("music"),
      stopMusic: () => events.push("music stopped"),
      playSound: () => {},
    },
    multiplayer: {
      fetchPlayerStats: async () => {
        events.push("fetchPlayerStats");
        return store.getState().ui.playerInfos.stats;
      },
      pushGameStats: (records) => events.push(["pushGameStats", records]),
    },
    takeNewUnlock: async () => ({ step: "buildings" }),
    scene: () => ({ clear: () => events.push("scene cleared") }),
    requestFullscreen: () => events.push("fullscreen"),
    isOnline: () => online,
    onMatchmaking: (open) => events.push(["matchmaking", open]),
    onUnlock: (unlock) => events.push(["unlock", unlock]),
    expose: () => {},
    releaseOrientation: () => {},
    uuid: () => "id-1",
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };
  const controller = createMatchController(deps);
  return { store, controller, hosts, lobby, events, deps, saved };
};

beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
afterEach(() => mock.timers.reset());

test("a new player's Start opens the lesson", async () => {
  const { controller, store, hosts } = setup({
    stats: { tutorialFinished: false, tutorialSkipped: false },
  });
  await controller.startGame();
  assert.equal(store.getState().ui.tutorial, true);
  assert.deepEqual(store.getState().ui.loopAnimations, [LESSON]);
  assert.equal(hosts.length, 0);
});

test("without a network Start plays the local AI at once", async () => {
  const { controller, hosts, deps, events } = setup({ online: false });
  controller.startGame();
  assert.equal(hosts.length, 1);
  assert.equal(hosts[0].online, false);
  assert.equal(deps.session.host, hosts[0]);
  const [kind, game] = hosts[0].calls[0];
  assert.equal(kind, "startNew");
  assert.equal(game.players[0].name, "Carolin Cacao");
  assert.equal(game.players[0].id, "local-player");
  assert.equal(game.agents[0].playerIndex, 1);
  assert.ok(events.includes("fullscreen"));
  assert.ok(events.includes("cleared"));
});

test("a player still on the AI ladder asks the server's AI; without its match the local AI plays", async () => {
  const { controller, lobby, hosts } = setup();
  await controller.startGame();
  assert.deepEqual(lobby.sent, ["playAiNow"]);
  assert.equal(hosts.length, 0);
  assert.equal(controller.pendingTimers, 1);
  mock.timers.tick(SERVER_MATCH_TIMEOUT_MS);
  assert.equal(hosts.length, 1);
  assert.equal(hosts[0].online, false);
  assert.equal(controller.pendingTimers, 0);
});

test("the server's match makes the fallback to the local AI a late answer", async () => {
  const { controller, hosts, deps, store } = setup();
  await controller.startGame();
  controller.startOnlineMatch({
    matchId: "m1",
    playerIndex: 0,
    epoch: 5,
    kind: "ai",
  });
  assert.equal(hosts.length, 1);
  assert.equal(hosts[0].online, true);
  assert.equal(hosts[0].options.matchId, "m1");
  mock.timers.tick(SERVER_MATCH_TIMEOUT_MS);
  // no local match on top of the online one
  assert.equal(hosts.length, 1);
  assert.equal(deps.session.host, hosts[0]);
  assert.equal(store.getState().ui.selectedBuilding, undefined);
});

test("with online play unlocked Start joins the queue; cancel leaves it", async () => {
  // four finished matches (shared progression.js) on the ladder
  const { controller, lobby, events } = setup({
    stats: { score: 900, winnings: 4, aiLadder: { step: 2, games: 4 } },
  });
  await controller.startGame();
  assert.deepEqual(lobby.sent, ["joinQueue"]);
  assert.deepEqual(
    events.filter((event) => event[0] === "matchmaking"),
    [["matchmaking", true]]
  );
  controller.cancelMatchmaking();
  assert.deepEqual(lobby.sent, ["joinQueue", "leaveQueue"]);
  assert.deepEqual(events.filter((event) => event[0] === "matchmaking").pop(), [
    "matchmaking",
    false,
  ]);
});

test("a Start cancelled before the live service answers starts nothing", async () => {
  const entered = deferred();
  const { controller, lobby, hosts } = setup();
  lobby.enter = () => entered.promise;
  const start = controller.startGame();
  controller.cancelMatchmaking();
  entered.resolve();
  await start;
  assert.deepEqual(lobby.sent, ["leaveQueue"]);
  assert.equal(hosts.length, 0);
});

test("without an account in time the local AI plays", async () => {
  const { controller, hosts } = setup({ connected: "no-account" });
  const start = controller.startGame();
  mock.timers.tick(ACCOUNT_TIMEOUT_MS);
  await start;
  assert.equal(hosts.length, 1);
  assert.equal(hosts[0].online, false);
});

test("Resume restores the saved match; a broken one starts a new match", async () => {
  const { controller, hosts, saved } = setup();
  saved.match = "a saved match";
  await controller.startLocal(true);
  assert.deepEqual(hosts[0].calls, [["restore", "a saved match"]]);
  saved.match = "broken";
  await controller.startLocal(true);
  assert.equal(hosts[0].stopped, true);
  assert.equal(hosts[1].calls[0][0], "startNew");
});

test("the end screen follows a local match after a moment and keeps its record", async () => {
  const { controller, hosts, store, events } = setup({ online: false });
  controller.startGame();
  hosts[0].options.onEnded({
    online: false,
    statistics: { builtEntities: 3 },
    winners: [
      {
        id: "local-player",
        name: "Carolin Cacao",
        type: "PlayerType.HUMAN",
        idx: 0,
        extra: true,
      },
    ],
    awards: [{ key: "WINNER" }],
  });
  assert.equal(store.getState().ui.overviewVisible, false);
  mock.timers.tick(OVERVIEW_DELAY_MS);
  assert.equal(store.getState().ui.overviewVisible, true);
  const [, records] = events.find((event) => event[0] === "pushGameStats");
  assert.deepEqual(records, [
    {
      builtEntities: 3,
      winners: [
        {
          id: "local-player",
          name: "Carolin Cacao",
          type: "PlayerType.HUMAN",
          idx: 0,
        },
      ],
      awards: [{ key: "WINNER" }],
      id: "id-1",
    },
  ]);
});

test("an online match's end screen reloads the stats the server credited", async () => {
  const { controller, events } = setup();
  const host = controller.startOnlineMatch({
    matchId: "m1",
    playerIndex: 0,
    epoch: 1,
  });
  host.options.onEnded({ online: true });
  mock.timers.tick(OVERVIEW_DELAY_MS);
  assert.ok(events.includes("fetchPlayerStats"));
  assert.equal(
    events.some((event) => event[0] === "pushGameStats"),
    false
  );
});

test("leaving an online match gives it up, after the music faded", async () => {
  const { controller, store, lobby, deps, events } = setup();
  const host = controller.startOnlineMatch({
    matchId: "m1",
    playerIndex: 0,
    epoch: 1,
  });
  store.dispatch(
    matchUpdated({ view: { phase: engine.MatchPhase.RUNNING }, events: [] })
  );
  controller.endGame();
  assert.equal(host.stopped, false);
  mock.timers.tick(LEAVE_DELAY_MS);
  assert.deepEqual(
    host.calls.map(([name]) => name),
    ["surrender", "persist"]
  );
  assert.equal(host.stopped, true);
  assert.equal(deps.session.host, undefined);
  assert.equal(store.getState().match.view, undefined);
  assert.ok(lobby.sent.includes("matchLeft"));
  assert.ok(events.includes("scene cleared"));
  await flush();
  assert.deepEqual(
    events.filter((event) => event[0] === "unlock"),
    [["unlock", { step: "buildings" }]]
  );
});

test("a finished online match is not given up", () => {
  const { controller, store } = setup();
  const host = controller.startOnlineMatch({
    matchId: "m1",
    playerIndex: 0,
    epoch: 1,
  });
  store.dispatch(
    matchUpdated({ view: { phase: engine.MatchPhase.ENDED }, events: [] })
  );
  controller.endGame();
  mock.timers.tick(LEAVE_DELAY_MS);
  assert.deepEqual(
    host.calls.map(([name]) => name),
    ["persist"]
  );
});

test("a rematch from the end screen clears the finished board first", () => {
  const { controller, store, events } = setup();
  const first = controller.startOnlineMatch({
    matchId: "m1",
    playerIndex: 0,
    epoch: 1,
  });
  store.dispatch(
    matchUpdated({ view: { phase: engine.MatchPhase.ENDED }, events: [] })
  );
  const second = controller.startOnlineMatch({
    matchId: "m2",
    playerIndex: 1,
    epoch: 2,
    kind: "challenge",
  });
  assert.equal(first.stopped, true);
  assert.equal(store.getState().match.view, undefined);
  assert.ok(events.includes("scene cleared"));
  assert.equal(second.options.kind, "challenge");
});

test("the tutorial's end stops the pending timers", () => {
  const { controller, store, hosts } = setup({ online: false });
  controller.startGame();
  store.dispatch(tutorialStarted({ loops: allDemos }));
  // the end screen of the match is still to come
  hosts[0].options.onEnded({
    online: false,
    statistics: {},
    winners: [],
    awards: [],
  });
  assert.equal(controller.pendingTimers, 1);
  controller.closeTutorial(false);
  assert.equal(controller.pendingTimers, 0);
  assert.equal(store.getState().ui.tutorial, false);
  mock.timers.tick(OVERVIEW_DELAY_MS);
  assert.equal(store.getState().ui.overviewVisible, false);
});

test("the recovery after a crash closes the match at once and ends the tutorial", () => {
  const { controller, store, deps, events } = setup({ online: false });
  controller.startGame();
  const host = deps.session.host;
  store.dispatch(tutorialStarted({ loops: [LESSON] }));
  controller.recover();
  assert.equal(host.stopped, true);
  assert.deepEqual(host.calls.slice(-1), [["persist", true]]);
  assert.equal(deps.session.host, undefined);
  assert.equal(store.getState().ui.tutorial, false);
  assert.deepEqual(events.filter((event) => event[0] === "matchmaking").pop(), [
    "matchmaking",
    false,
  ]);
});

test("the live connection is kept while the page is visible", async () => {
  const { controller, lobby, store } = setup();
  const listeners = {};
  const page = {
    visibilityState: "visible",
    addEventListener: (name, listener) => (listeners[name] = listener),
  };
  store.dispatch({
    type: "battlechoc/live/challengeViewed",
    payload: { code: "K7Q2", state: "connecting" },
  });
  await controller.keepLiveConnection(page);
  assert.equal(typeof lobby.initOptions.onMatch, "function");
  assert.deepEqual(lobby.sent, [["openChallenge", "K7Q2"]]);
  page.visibilityState = "hidden";
  listeners.visibilitychange();
  assert.ok(lobby.sent.includes("leave"));
});
