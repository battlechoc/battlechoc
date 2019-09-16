import { createAction } from 'redux-starter-kit';

const UiActionTypes = Object.freeze({
    selectBuilding: 'battlechoc/ui/selectBuilding',
    tapBuilding: 'battlechoc/ui/tapBuilding',
    selectAttack: 'battlechoc/ui/selectAttack',
    deselectAttack: 'battlechoc/ui/deselectAttack',
    changeLanguage: 'battlechoc/ui/changeLanguage',
    deselectBuildings: 'battlechoc/ui/deselectBuildings',
    gameResumeable: 'battlechoc/ui/gameResumeable',
    showStatistics: 'battlechoc/ui/showStatistics',
    showOverview: 'battlechoc/ui/showOverview',
    assetsReady: 'battlechoc/ui/assetsReady',
    waitForMultiplayer: 'battlechoc/ui/waitForMultiplayer',
    joinedMultiplayer: 'battlechoc/ui/joinedMultiplayer',
    loadUiState: 'battlechoc/ui/loadUiState',
    resetUi: 'battlechoc/ui/resetUi',
    notifyPlayerSignedOut: 'battlechoc/ui/notifyPlayerSignedOut',
    notifyPlayerSignedIn: 'battlechoc/ui/notifyPlayerSignedIn',
    startTutorial: 'battlechoc/ui/startTutorial',
    stopTutorial: 'battlechoc/ui/stopTutorial',
    updatePlayerStats: 'battlechoc/ui/updatePlayerStats'
});

const selectBuilding = createAction(UiActionTypes.selectBuilding);
const tapBuilding = createAction(UiActionTypes.tapBuilding);
const selectAttack = createAction(UiActionTypes.selectAttack);
const deselectAttack = createAction(UiActionTypes.deselectAttack);
const deselectBuildings = createAction(UiActionTypes.deselectBuildings);
const changeLanguage = createAction(UiActionTypes.changeLanguage);
const gameResumeable = createAction(UiActionTypes.gameResumeable);
const showStatistics = createAction(UiActionTypes.showStatistics);
const assetsReady = createAction(UiActionTypes.assetsReady);
const waitForMultiplayer = createAction(UiActionTypes.waitForMultiplayer);
const joinedMultiplayer = createAction(UiActionTypes.joinedMultiplayer);
const loadUiState = createAction(UiActionTypes.loadUiState);
const resetUi = createAction(UiActionTypes.resetUi);
const showOverview = createAction(UiActionTypes.showOverview);
const notifyPlayerSignedOut = createAction(UiActionTypes.notifyPlayerSignedOut);
const notifyPlayerSignedIn = createAction(UiActionTypes.notifyPlayerSignedIn);
const startTutorial = createAction(UiActionTypes.startTutorial);
const stopTutorial = createAction(UiActionTypes.stopTutorial);
const updatePlayerStats = createAction(UiActionTypes.updatePlayerStats);

export { startTutorial, stopTutorial, showOverview, resetUi, loadUiState, joinedMultiplayer, waitForMultiplayer, UiActionTypes, changeLanguage, selectBuilding, tapBuilding, selectAttack, deselectAttack, deselectBuildings, gameResumeable, showStatistics, assetsReady, notifyPlayerSignedOut, notifyPlayerSignedIn, updatePlayerStats };