import { createAction } from 'redux-starter-kit';

const UiActionTypes = Object.freeze({
    showMessage: 'battlechoc/ui/showMessage',
    hideMessage: 'battlechoc/ui/hideMessage',
    selectBuilding: 'battlechoc/ui/selectBuilding'
});

const showMessage = createAction(UiActionTypes.showMessage);
const hideMessage = createAction(UiActionTypes.hideMessage);
const selectBuilding = createAction(UiActionTypes.selectBuilding);

export {
    UiActionTypes, showMessage, hideMessage, selectBuilding
};