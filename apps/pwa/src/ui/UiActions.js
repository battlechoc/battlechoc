import { createAction } from 'redux-starter-kit';

const showMessage = createAction('sweasty/ui/showMessage');
const hideMessage = createAction('sweasty/ui/hideMessage');
const selectBuilding = createAction('sweasty/ui/selectBuilding');

export {
    showMessage, hideMessage, selectBuilding
};
