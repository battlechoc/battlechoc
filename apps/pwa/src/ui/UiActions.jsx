import { createAction } from "@reduxjs/toolkit";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";

const UiActionTypes = Object.freeze({
  selectBuilding: "battlechoc/ui/selectBuilding",
  tapBuilding: "battlechoc/ui/tapBuilding",
  selectAttack: "battlechoc/ui/selectAttack",
  deselectAttack: "battlechoc/ui/deselectAttack",
  deselectBuildings: "battlechoc/ui/deselectBuildings",
  gameResumeable: "battlechoc/ui/gameResumeable",
  showOverview: "battlechoc/ui/showOverview",
  assetsReady: "battlechoc/ui/assetsReady",
  loadUiState: "battlechoc/ui/loadUiState",
  resetUi: "battlechoc/ui/resetUi",
  notifyPlayerSignedIn: "battlechoc/ui/notifyPlayerSignedIn",
  startTutorial: "battlechoc/ui/startTutorial",
  stopTutorial: "battlechoc/ui/stopTutorial",
  updatePlayerStats: "battlechoc/ui/updatePlayerStats",
  loadFriendsList: "battlechoc/ui/loadFriendsList",
  setPlayerRank: "battlechoc/ui/setPlayerRank",
  showQuickMessage: "battlechoc/ui/showQuickMessage",
  hideQuickMessage: "battlechoc/ui/hideQuickMessage",
  showNotification: "battlechoc/ui/showNotification",
  hideNotification: "battlechoc/ui/hideNotification",
  toggleBoardView: "battlechoc/ui/toggleBoardView",
  focusBoard: "battlechoc/ui/focusBoard",
  attackDenied: "battlechoc/ui/attackDenied",
});

const selectBuilding = createAction(UiActionTypes.selectBuilding);
const tapBuilding = createAction(UiActionTypes.tapBuilding);
const selectAttack = createAction(UiActionTypes.selectAttack);
const deselectAttack = createAction(UiActionTypes.deselectAttack);
const deselectBuildings = createAction(UiActionTypes.deselectBuildings);
const gameResumeable = createAction(UiActionTypes.gameResumeable);
const assetsReady = createAction(UiActionTypes.assetsReady);
const loadUiState = createAction(UiActionTypes.loadUiState);
const resetUi = createAction(UiActionTypes.resetUi);
const showOverview = createAction(UiActionTypes.showOverview);
const notifyPlayerSignedIn = createAction(UiActionTypes.notifyPlayerSignedIn);
const startTutorial = createAction(UiActionTypes.startTutorial);
const stopTutorial = createAction(UiActionTypes.stopTutorial);
const updatePlayerStats = createAction(UiActionTypes.updatePlayerStats);
const loadFriendsList = createAction(UiActionTypes.loadFriendsList);
const setPlayerRank = createAction(UiActionTypes.setPlayerRank);
const showQuickMessage = createAction(UiActionTypes.showQuickMessage);
const hideQuickMessage = createAction(UiActionTypes.hideQuickMessage);
const showNotification = createAction(UiActionTypes.showNotification);
const toggleBoardView = createAction(UiActionTypes.toggleBoardView);
// "opponent" or "own": turns the camera to that board, on every call
const focusBoard = createAction(UiActionTypes.focusBoard);
// an attack that could not be fired right now: its palette button flashes
const attackDenied = createAction(UiActionTypes.attackDenied);
const hideNotification = createAction(UiActionTypes.hideNotification);
// a tap on what needs the server while it does not answer; replaces the online/offline toasts
const showOfflineMessage = () =>
  showQuickMessage({
    text: t(tr.OFFLINE_ONLY),
    variant: "info",
    type: "PWA_OFFLINE_MESSAGE",
  });

export {
  toggleBoardView,
  focusBoard,
  attackDenied,
  showNotification,
  hideNotification,
  showQuickMessage,
  showOfflineMessage,
  hideQuickMessage,
  setPlayerRank,
  loadFriendsList,
  startTutorial,
  stopTutorial,
  showOverview,
  resetUi,
  loadUiState,
  UiActionTypes,
  selectBuilding,
  tapBuilding,
  selectAttack,
  deselectAttack,
  deselectBuildings,
  gameResumeable,
  assetsReady,
  notifyPlayerSignedIn,
  updatePlayerStats,
};
