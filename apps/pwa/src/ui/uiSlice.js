import { createSlice } from "@reduxjs/toolkit";
import {
  EmptyPlayerStats,
  EntityType,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import { uuid } from "../helper/uuid.js";

// The interface's state: what the player has picked on the board, the first load, the tutorial,
// the player's stats, messages and dialogs. The settings the player can change (tips, auto
// fullscreen) are in src/settingsSlice.js.
const initialState = {
  selectedBuilding: EntityType.FACTORY,
  tappedBuilding: EntityType.FACTORY,
  // the weapon picked for the next shot (WeaponPalette)
  selectedAttack: undefined,
  assetsReady: false,
  // the first start (src/firstLoad.js, AssetLoader): the title screen shows once the fonts are
  // in; the start button fills up with the 3D models (0..100) and offers another try when one
  // fails
  fontsReady: false,
  assetsProgress: 0,
  assetsFailed: false,
  overviewVisible: false,
  // a local match saved on the device can be resumed (Start asks)
  resumeGamePossible: false,
  tutorial: false,
  // the tutorial's loops: [LESSON] or the ids of the building demos (tutorial/ids.js)
  loopAnimations: [],
  ranking: "Offline",
  // uid: the device account's player id, once the account is there
  playerInfos: { stats: EmptyPlayerStats },
  quickMessages: [],
  notification: { title: null, message: null, open: false },
  boardViewToggles: 0,
  boardFocus: { target: "own", seq: 0 },
  deniedAttack: { type: undefined, seq: 0 },
  // the tutorial lesson lets the player act; whitelistBuildings limits the build palette;
  // tutorialPointer is where its hand points: a field { board, row, col }, a weapon button
  // { weapon } or null
  tutorialInteractive: false,
  whitelistBuildings: undefined,
  tutorialPointer: null,
  // the bottom edge of the tutorial's card (px from the top, 0 without a card)
  boardTopInset: 0,
  // the bottom edge of the board preview (px from the top, Scene), null without one: the
  // match's messages go below it
  previewBottom: null,
  // the server answers (src/connectivity.js); without it profile, highscore, Choclab and
  // friends are greyed out
  online: typeof navigator === "undefined" || navigator.onLine !== false,
  // not online although the internet works: the server is down, try again later
  serverDown: false,
  // the player had everything under the old unlock rule and keeps it (src/unlocks.js)
  earlyUnlock: false,
  // { taken, generated }: the device's name belongs to somebody else on the server, the
  // player got a random one (dialogs/NameConflict.jsx)
  nameConflict: null,
  // a new build of the app has been installed by the service worker: the player may start it
  // (dialogs/UpdateAvailable.jsx)
  updateAvailable: false,
};

// the online/offline toasts replace each other
const NETWORK_MESSAGES = ["PWA_ONLINE_MESSAGE", "PWA_OFFLINE_MESSAGE"];

const uiSlice = createSlice({
  // the action types stay "battlechoc/ui/…" as before the slice
  name: "battlechoc/ui",
  initialState,
  reducers: {
    resetUi(state) {
      state.whitelistBuildings = undefined;
      state.tappedBuilding = EntityType.FACTORY;
      state.selectedBuilding = EntityType.FACTORY;
      state.selectedAttack = undefined;
      state.overviewVisible = false;
    },
    toggleBoardView(state) {
      state.boardViewToggles += 1;
    },
    // "opponent" or "own": turns the camera to that board, on every call
    focusBoard(state, action) {
      state.boardFocus = {
        target: action.payload,
        seq: state.boardFocus.seq + 1,
      };
    },
    // an attack that could not be fired right now: its palette button flashes
    attackDenied(state, action) {
      state.deniedAttack = {
        type: action.payload,
        seq: state.deniedAttack.seq + 1,
      };
    },
    selectBuilding(state, action) {
      state.selectedBuilding = action.payload;
    },
    tapBuilding(state, action) {
      state.tappedBuilding = action.payload;
    },
    selectAttack(state, action) {
      state.selectedAttack = action.payload;
    },
    deselectAttack(state) {
      state.selectedAttack = undefined;
    },
    deselectBuildings(state) {
      state.selectedBuilding = undefined;
      state.tappedBuilding = undefined;
    },
    gameResumeable(state, action) {
      state.resumeGamePossible = action.payload;
    },
    fontsArrived(state) {
      state.fontsReady = true;
    },
    // 0..100 while the 3D models load
    assetsProgressed(state, action) {
      state.assetsProgress = action.payload;
    },
    // a model did not arrive (true) or is asked for again (false)
    assetsFailedChanged(state, action) {
      state.assetsFailed = action.payload;
    },
    assetsReady(state) {
      state.assetsProgress = 100;
      state.assetsFailed = false;
      state.assetsReady = true;
    },
    // "online", "offline" or "server-down" (src/connectivity.js)
    connectivityChanged(state, action) {
      state.online = action.payload === "online";
      state.serverDown = action.payload === "server-down";
    },
    earlyUnlockDecided(state, action) {
      state.earlyUnlock = Boolean(action.payload);
    },
    // { taken, generated }, or null once the player has read it
    nameConflictChanged(state, action) {
      state.nameConflict = action.payload;
    },
    updateAvailableChanged(state, action) {
      state.updateAvailable = action.payload;
    },
    previewBottomChanged(state, action) {
      state.previewBottom = action.payload;
    },
    boardTopInsetChanged(state, action) {
      state.boardTopInset = action.payload;
    },
    tutorialPointerChanged(state, action) {
      state.tutorialPointer = action.payload;
    },
    // whether the board takes the player's taps in the tutorial, and which buildings it offers
    tutorialBoardChanged(state, action) {
      state.tutorialInteractive = action.payload.interactive;
      state.whitelistBuildings = action.payload.whitelistBuildings;
    },
    // Sets keys of the state as given. Only the 3D scene still uses it (previewBottom); the
    // named actions above say what changes.
    loadUiState(state, action) {
      Object.assign(state, action.payload);
    },
    showOverview(state) {
      state.overviewVisible = true;
    },
    notifyPlayerSignedIn(state, action) {
      state.playerInfos.uid = action.payload.uid;
    },
    stopTutorial(state) {
      state.tutorial = false;
      state.tutorialInteractive = false;
      state.whitelistBuildings = undefined;
      state.tutorialPointer = null;
    },
    startTutorial(state, action) {
      state.tutorial = true;
      state.loopAnimations = action.payload.loops;
    },
    updatePlayerStats(state, action) {
      Object.assign(state.playerInfos.stats, action.payload);
    },
    setPlayerRank(state, action) {
      state.ranking = action.payload;
    },
    showQuickMessage: {
      reducer(state, action) {
        if (NETWORK_MESSAGES.includes(action.payload.type)) {
          state.quickMessages = state.quickMessages.filter(
            (message) => !NETWORK_MESSAGES.includes(message.type)
          );
        }
        state.quickMessages.push(action.payload);
      },
      // { text, variant, type, autoHideDuration }: the message gets its id here, not in the
      // reducer
      prepare(message) {
        return {
          payload: {
            autoHideDuration:
              typeof message.autoHideDuration === "undefined"
                ? 4000
                : message.autoHideDuration,
            id: uuid(),
            type: message.type,
            text: message.text || "",
            variant: message.variant || "warning",
          },
        };
      },
    },
    hideQuickMessage(state, action) {
      state.quickMessages = state.quickMessages.filter(
        (message) => message.id !== action.payload
      );
    },
    showNotification(state, action) {
      const { title, message } = action.payload;
      state.notification = { title, message, open: true };
    },
    hideNotification(state) {
      state.notification = { title: null, message: null, open: false };
    },
  },
});

export const {
  resetUi,
  toggleBoardView,
  focusBoard,
  attackDenied,
  selectBuilding,
  tapBuilding,
  selectAttack,
  deselectAttack,
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
  loadUiState,
  showOverview,
  notifyPlayerSignedIn,
  stopTutorial,
  startTutorial,
  updatePlayerStats,
  setPlayerRank,
  showQuickMessage,
  hideQuickMessage,
  showNotification,
  hideNotification,
} = uiSlice.actions;

export const uiReducer = uiSlice.reducer;

// a tap on what needs the server while it does not answer: no internet, or the server is down
// (then the player can only try later); replaces the online/offline toasts
export const showOfflineMessage = () => (dispatch, getState) =>
  dispatch(
    showQuickMessage({
      text: getState().ui.serverDown
        ? t(tr.SERVER_UNREACHABLE)
        : t(tr.OFFLINE_ONLY),
      variant: "info",
      type: "PWA_OFFLINE_MESSAGE",
    })
  );
