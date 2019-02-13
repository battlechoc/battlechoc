import { createReducer } from 'redux-starter-kit';
import * as UiActions from './UiActions';
import { BuildingType } from '../gameplay/GameEntities';

const uiReducer = createReducer({
        screen: 'START_SCREEN',
        messageAnimation: false,
        selectedBuilding: BuildingType.CACAOTREE
    }, {
    [UiActions.showMessage]: (state, action) => {
        state.message = action.payload;
        state.messageAnimation = true;
    },
    [UiActions.hideMessage]: (state, action) => {
        state.message = undefined;
        state.messageAnimation = false;
    },
    [UiActions.selectBuilding]: (state, action) => {
        state.selectedBuilding = action.payload;
    },
})

export default uiReducer