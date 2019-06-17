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
    assetsReady: 'battlechoc/ui/assetsReady',
    waitForMultiplayer: 'battlechoc/ui/waitForMultiplayer',
    joinedMultiplayer: 'battlechoc/ui/joinedMultiplayer'
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

export { joinedMultiplayer, waitForMultiplayer, UiActionTypes, changeLanguage, selectBuilding, tapBuilding, selectAttack, deselectAttack, deselectBuildings, gameResumeable, showStatistics, assetsReady };