import { createAction } from 'redux-starter-kit';

const UiActionTypes = Object.freeze({
    selectBuilding: 'battlechoc/ui/selectBuilding',
    tapBuilding: 'battlechoc/ui/tapBuilding',
    selectAttack: 'battlechoc/ui/selectAttack',
    changeLanguage: 'battlechoc/ui/changeLanguage',
    deselectBuildings: 'battlechoc/ui/deselectBuildings',
    gameResumeable: 'battlechoc/ui/gameResumeable'
});

const selectBuilding = createAction(UiActionTypes.selectBuilding);
const tapBuilding = createAction(UiActionTypes.tapBuilding);
const selectAttack = createAction(UiActionTypes.selectAttack);
const deselectBuildings = createAction(UiActionTypes.deselectBuildings);
const changeLanguage = createAction(UiActionTypes.changeLanguage);
const gameResumeable = createAction(UiActionTypes.gameResumeable);

export { UiActionTypes, changeLanguage, selectBuilding, tapBuilding, selectAttack, deselectBuildings, gameResumeable };