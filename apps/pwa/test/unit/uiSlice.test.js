// The interface's state (node --test): every key has its start value, the named actions set what
// they say, quick messages get their id in the action, the online/offline toasts replace each
// other.
import { test } from "node:test";
import assert from "node:assert/strict";
import { configureStore } from "@reduxjs/toolkit";
import {
  EntityType,
  EmptyPlayerStats,
} from "@battlechoc/battlechoc-shared-functions";
import {
  uiReducer,
  resetUi,
  selectBuilding,
  selectAttack,
  deselectBuildings,
  gameResumeable,
  fontsArrived,
  assetsProgressed,
  assetsFailedChanged,
  assetsReady,
  connectivityChanged,
  earlyUnlockDecided,
  nameConflictChanged,
  updateAvailableChanged,
  previewBottomChanged,
  boardTopInsetChanged,
  tutorialPointerChanged,
  tutorialBoardChanged,
  startTutorial,
  stopTutorial,
  notifyPlayerSignedIn,
  updatePlayerStats,
  focusBoard,
  attackDenied,
  showQuickMessage,
  hideQuickMessage,
  showNotification,
  hideNotification,
  showOfflineMessage,
} from "../../src/ui/uiSlice.js";

const initial = uiReducer(undefined, { type: "init" });
const apply = (...actions) => actions.reduce(uiReducer, initial);

test("the action types stay those of the old ui reducer", () => {
  assert.equal(selectBuilding.type, "battlechoc/ui/selectBuilding");
  assert.equal(showQuickMessage.type, "battlechoc/ui/showQuickMessage");
});

test("every key the actions set is in the start state", () => {
  for (const key of [
    "selectedAttack",
    "resumeGamePossible",
    "loopAnimations",
    "fontsReady",
    "assetsProgress",
    "assetsFailed",
    "previewBottom",
    "boardTopInset",
    "tutorialPointer",
    "whitelistBuildings",
    "nameConflict",
    "updateAvailable",
    "earlyUnlock",
    "online",
    "serverDown",
  ]) {
    assert.ok(key in initial, key);
  }
  assert.equal(initial.selectedBuilding, EntityType.FACTORY);
  assert.equal(initial.resumeGamePossible, false);
  assert.deepEqual(initial.loopAnimations, []);
  assert.deepEqual(initial.playerInfos, { stats: EmptyPlayerStats });
  // the settings are a slice of their own
  assert.equal("tipsEnabled" in initial, false);
  assert.equal("autoFullscreen" in initial, false);
});

test("the first load: fonts, progress, a failure and the end", () => {
  let state = apply(
    fontsArrived(),
    assetsProgressed(40),
    assetsFailedChanged(true)
  );
  assert.deepEqual(
    {
      fontsReady: state.fontsReady,
      assetsProgress: state.assetsProgress,
      assetsFailed: state.assetsFailed,
    },
    { fontsReady: true, assetsProgress: 40, assetsFailed: true }
  );
  state = uiReducer(state, assetsReady());
  assert.deepEqual(
    {
      assetsReady: state.assetsReady,
      assetsProgress: state.assetsProgress,
      assetsFailed: state.assetsFailed,
    },
    { assetsReady: true, assetsProgress: 100, assetsFailed: false }
  );
});

test("connectivity: online, offline and a server that is down", () => {
  assert.deepEqual(
    (({ online, serverDown }) => ({ online, serverDown }))(
      apply(connectivityChanged("server-down"))
    ),
    { online: false, serverDown: true }
  );
  assert.deepEqual(
    (({ online, serverDown }) => ({ online, serverDown }))(
      apply(connectivityChanged("offline"))
    ),
    { online: false, serverDown: false }
  );
  assert.deepEqual(
    (({ online, serverDown }) => ({ online, serverDown }))(
      apply(connectivityChanged("offline"), connectivityChanged("online"))
    ),
    { online: true, serverDown: false }
  );
});

test("the named setters", () => {
  const state = apply(
    earlyUnlockDecided(1),
    nameConflictChanged({ taken: "Anna", generated: "Brave Bean" }),
    updateAvailableChanged(true),
    previewBottomChanged(120),
    boardTopInsetChanged(88),
    tutorialPointerChanged({ board: "own", row: 1, col: 2 }),
    tutorialBoardChanged({
      interactive: true,
      whitelistBuildings: [EntityType.CACAOTREE],
    }),
    gameResumeable(true)
  );
  assert.equal(state.earlyUnlock, true);
  assert.deepEqual(state.nameConflict, {
    taken: "Anna",
    generated: "Brave Bean",
  });
  assert.equal(state.updateAvailable, true);
  assert.equal(state.previewBottom, 120);
  assert.equal(state.boardTopInset, 88);
  assert.deepEqual(state.tutorialPointer, { board: "own", row: 1, col: 2 });
  assert.equal(state.tutorialInteractive, true);
  assert.deepEqual(state.whitelistBuildings, [EntityType.CACAOTREE]);
  assert.equal(state.resumeGamePossible, true);
  assert.equal(uiReducer(state, nameConflictChanged(null)).nameConflict, null);
});

test("the tutorial starts with its loops and leaves the board as it found it", () => {
  let state = apply(startTutorial({ loops: ["LESSON"] }));
  assert.equal(state.tutorial, true);
  assert.deepEqual(state.loopAnimations, ["LESSON"]);
  state = uiReducer(
    state,
    tutorialBoardChanged({ interactive: true, whitelistBuildings: ["x"] })
  );
  state = uiReducer(
    state,
    tutorialPointerChanged({ weapon: "AttackType.TRUFFLE" })
  );
  state = uiReducer(state, stopTutorial());
  assert.deepEqual(
    {
      tutorial: state.tutorial,
      tutorialInteractive: state.tutorialInteractive,
      whitelistBuildings: state.whitelistBuildings,
      tutorialPointer: state.tutorialPointer,
    },
    {
      tutorial: false,
      tutorialInteractive: false,
      whitelistBuildings: undefined,
      tutorialPointer: null,
    }
  );
});

test("resetUi picks the factory again and closes the overview", () => {
  const state = apply(
    deselectBuildings(),
    selectAttack("AttackType.TRUFFLE"),
    resetUi()
  );
  assert.equal(state.selectedBuilding, EntityType.FACTORY);
  assert.equal(state.tappedBuilding, EntityType.FACTORY);
  assert.equal(state.selectedAttack, undefined);
  assert.equal(state.overviewVisible, false);
});

test("the player: uid and stats", () => {
  const state = apply(
    notifyPlayerSignedIn({ uid: "p-1" }),
    updatePlayerStats({ score: 70 })
  );
  assert.equal(state.playerInfos.uid, "p-1");
  assert.equal(state.playerInfos.stats.score, 70);
  assert.equal(state.playerInfos.stats.username, EmptyPlayerStats.username);
});

test("focus and denied attacks count up on every call", () => {
  const state = apply(
    focusBoard("opponent"),
    focusBoard("opponent"),
    attackDenied("AttackType.FRUIT")
  );
  assert.deepEqual(state.boardFocus, { target: "opponent", seq: 2 });
  assert.deepEqual(state.deniedAttack, { type: "AttackType.FRUIT", seq: 1 });
});

test("a quick message gets its id and defaults in the action, not in the reducer", () => {
  const action = showQuickMessage({ text: "Hello" });
  assert.equal(typeof action.payload.id, "string");
  assert.equal(action.payload.autoHideDuration, 4000);
  assert.equal(action.payload.variant, "warning");
  // the same action gives the same state every time
  assert.deepEqual(uiReducer(initial, action), uiReducer(initial, action));
  const state = uiReducer(initial, action);
  assert.deepEqual(state.quickMessages, [action.payload]);
  assert.deepEqual(
    uiReducer(state, hideQuickMessage(action.payload.id)).quickMessages,
    []
  );
  assert.equal(
    showQuickMessage({ text: "x", autoHideDuration: null }).payload
      .autoHideDuration,
    null
  );
});

test("the online and offline toasts replace each other", () => {
  const state = apply(
    showQuickMessage({ text: "a", type: "PWA_OFFLINE_MESSAGE" }),
    showQuickMessage({ text: "b" }),
    showQuickMessage({ text: "c", type: "PWA_ONLINE_MESSAGE" })
  );
  assert.deepEqual(
    state.quickMessages.map((message) => message.text),
    ["b", "c"]
  );
});

test("notifications open and close", () => {
  const state = apply(showNotification({ title: "T", message: "M" }));
  assert.deepEqual(state.notification, {
    title: "T",
    message: "M",
    open: true,
  });
  assert.deepEqual(uiReducer(state, hideNotification()).notification, {
    title: null,
    message: null,
    open: false,
  });
});

test("the offline message says whether the server is down", () => {
  const store = configureStore({ reducer: { ui: uiReducer } });
  store.dispatch(connectivityChanged("server-down"));
  store.dispatch(showOfflineMessage());
  store.dispatch(connectivityChanged("offline"));
  store.dispatch(showOfflineMessage());
  const messages = store.getState().ui.quickMessages;
  // the second replaces the first
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "PWA_OFFLINE_MESSAGE");
  assert.equal(messages[0].variant, "info");
});
