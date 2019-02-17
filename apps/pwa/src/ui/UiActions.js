import { createAction } from 'redux-starter-kit';

const showMessage = createAction('battlechoc/ui/showMessage');
const hideMessage = createAction('battlechoc/ui/hideMessage');
const selectBuilding = createAction('battlechoc/ui/selectBuilding');

export {
    showMessage, hideMessage, selectBuilding
};
