import { createReducer } from 'redux-starter-kit';
import * as UiActions from './UiActions';
import { BuildingType } from '../gameplay/GameEntities';

const uiReducer = createReducer({
        selectedBuilding: BuildingType.CACAOTREE
    }, {
    [UiActions.selectBuilding]: (state, action) => {
        state.selectedBuilding = action.payload;
    },
})

export default uiReducer