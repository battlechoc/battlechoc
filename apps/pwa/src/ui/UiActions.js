import { createAction } from 'redux-starter-kit';

const UiActionTypes = Object.freeze({
    selectBuilding: 'battlechoc/ui/selectBuilding',
    changeLanguage: 'battlechoc/ui/changeLanguage'
});

const selectBuilding = createAction(UiActionTypes.selectBuilding);
const changeLanguage = createAction(UiActionTypes.changeLanguage);

export {
    UiActionTypes, changeLanguage, selectBuilding
};