import { createAction } from 'redux-starter-kit';

const UiActionTypes = Object.freeze({
    selectBuilding: 'battlechoc/ui/selectBuilding',
    tapBuilding: 'battlechoc/ui/tapBuilding',
    selectAttack: 'battlechoc/ui/selectAttack',
    deselectAttack: 'battlechoc/ui/deselectAttack',
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
    loadFriendsList: 'battlechoc/ui/loadFriendsList',
    setPlayerRank: 'battlechoc/ui/setPlayerRank',
    updateLevel: 'battlechoc/ui/updateLevel',
    showQuickMessage: 'battlechoc/ui/showQuickMessage',
    hideQuickMessage: 'battlechoc/ui/hideQuickMessage',
    startSessionRefresh: 'battlechoc/ui/startSessionRefresh',
    stopSessionRefresh: 'battlechoc/ui/stopSessionRefresh',
    toggleDonutHighlighting: 'battlechoc/ui/toggleDonutHighlighting',
    showNotification: 'battlechoc/ui/showNotification',
    hideNotification: 'battlechoc/ui/hideNotification',
    lockHudUi: 'battlechoc/ui/lockHudUi',
    unlockHudUi: 'battlechoc/ui/unlockHudUi',
    injectMultiplayerSession: 'battlechoc/ui/injectMultiplayerSession'
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
const notifyPlayerSignedOut = createAction(UiActionTypes.notifyPlayerSignedOut);
const notifyPlayerSignedIn = createAction(UiActionTypes.notifyPlayerSignedIn);
const startTutorial = createAction(UiActionTypes.startTutorial);
const stopTutorial = createAction(UiActionTypes.stopTutorial);
const updatePlayerStats = createAction(UiActionTypes.updatePlayerStats);
const updateMultiplayerSessions = createAction(UiActionTypes.updateMultiplayerSessions);
const loadFriendsList = createAction(UiActionTypes.loadFriendsList);
const setPlayerRank = createAction(UiActionTypes.setPlayerRank);
const updateLevel = createAction(UiActionTypes.updateLevel);
const showQuickMessage = createAction(UiActionTypes.showQuickMessage);
const hideQuickMessage = createAction(UiActionTypes.hideQuickMessage);
const startSessionRefresh = createAction(UiActionTypes.startSessionRefresh);
const stopSessionRefresh = createAction(UiActionTypes.stopSessionRefresh);
const toggleDonutHighlighting = createAction(UiActionTypes.toggleDonutHighlighting);
const showNotification = createAction(UiActionTypes.showNotification);
const hideNotification = createAction(UiActionTypes.hideNotification);
const injectMultiplayerSession = createAction(UiActionTypes.injectMultiplayerSession);

export { showNotification, hideNotification, toggleDonutHighlighting, stopSessionRefresh, startSessionRefresh, showQuickMessage, hideQuickMessage, updateLevel, setPlayerRank, loadFriendsList, updateMultiplayerSessions, startTutorial, stopTutorial, showOverview, resetUi, loadUiState, UiActionTypes, selectBuilding, tapBuilding, selectAttack, deselectAttack, deselectBuildings, gameResumeable, assetsReady, notifyPlayerSignedOut, notifyPlayerSignedIn, updatePlayerStats, injectMultiplayerSession };