import { createAction } from 'redux-starter-kit';

const UiActionTypes = Object.freeze({
    selectBuilding: 'battlechoc/ui/selectBuilding'
});

const selectBuilding = createAction(UiActionTypes.selectBuilding);

export {
    UiActionTypes, selectBuilding
};