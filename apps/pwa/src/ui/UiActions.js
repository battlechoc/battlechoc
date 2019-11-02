import { createAction } from 'redux-starter-kit';

const UiActionTypes = Object.freeze({
    selectBuilding: 'battlechoc/ui/selectBuilding',
    tapBuilding: 'battlechoc/ui/tapBuilding',
    selectAttack: 'battlechoc/ui/selectAttack',
    deselectAttack: 'battlechoc/ui/deselectAttack',
    changeLanguage: 'battlechoc/ui/changeLanguage',
    deselectBuildings: 'battlechoc/ui/deselectBuildings',
    gameResumeable: 'battlechoc/ui/gameResumeable',
    showOverview: 'battlechoc/ui/showOverview',
    assetsReady: 'battlechoc/ui/assetsReady',
    loadUiState: 'battlechoc/ui/loadUiState',
    resetUi: 'battlechoc/ui/resetUi',
    notifyPlayerSignedOut: 'battlechoc/ui/notifyPlayerSignedOut',
    notifyPlayerSignedIn: 'battlechoc/ui/notifyPlayerSignedIn',
    startTutorial: 'battlechoc/ui/startTutorial',
    stopTutorial: 'battlechoc/ui/stopTutorial',
    updatePlayerStats: 'battlechoc/ui/updatePlayerStats',
    updateMultiplayerSessions: 'battlechoc/ui/updateMultiplayerSessions',
    loadFriendsList: 'battlechoc/ui/loadFriendsList'
});

const selectBuilding = createAction(UiActionTypes.selectBuilding);
const tapBuilding = createAction(UiActionTypes.tapBuilding);
const selectAttack = createAction(UiActionTypes.selectAttack);
const deselectAttack = createAction(UiActionTypes.deselectAttack);
const deselectBuildings = createAction(UiActionTypes.deselectBuildings);
const changeLanguage = createAction(UiActionTypes.changeLanguage);
const gameResumeable = createAction(UiActionTypes.gameResumeable);
const assetsReady = createAction(UiActionTypes.assetsReady);
const loadUiState = createAction(UiActionTypes.loadUiState);
const resetUi = createAction(UiActionTypes.resetUi);
const showOverview = createAction(UiActionTypes.showOverview);
const notifyPlayerSignedOut = createAction(UiActionTypes.notifyPlayerSignedOut);
const notifyPlayerSignedIn = createAction(UiActionTypes.notifyPlayerSignedIn);
const startTutorial = createAction(UiActionTypes.startTutorial);
const stopTutorial = createAction(UiActionTypes.stopTutorial);
const updatePlayerStats = createAction(UiActionTypes.updatePlayerStats);
const updateMultiplayerSessions = createAction(UiActionTypes.updateMultiplayerSessions);
const loadFriendsList = createAction(UiActionTypes.loadFriendsList);

export { loadFriendsList, updateMultiplayerSessions, startTutorial, stopTutorial, showOverview, resetUi, loadUiState, UiActionTypes, changeLanguage, selectBuilding, tapBuilding, selectAttack, deselectAttack, deselectBuildings, gameResumeable, assetsReady, notifyPlayerSignedOut, notifyPlayerSignedIn, updatePlayerStats };