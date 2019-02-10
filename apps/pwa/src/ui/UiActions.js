import { createAction } from 'redux-starter-kit';

const showMessage = createAction('sweasty/ui/showMessage');
const hideMessage = createAction('sweasty/ui/hideMessage');
const viewSelectScreen = createAction('sweasty/ui/viewSelectScreen');
const viewIngameScreen = createAction('sweasty/ui/viewIngameScreen');
const selectBuilding = createAction('sweasty/ui/selectBuilding');

export {
    showMessage, hideMessage, viewSelectScreen, viewIngameScreen, selectBuilding
};
