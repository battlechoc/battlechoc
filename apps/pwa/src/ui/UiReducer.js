import { createReducer } from 'redux-starter-kit';
import * as UiActions from './UiActions';
import { BuildingType } from '../gameplay/GameEntities';

const uiReducer = createReducer({
        selectedBuilding: BuildingType.FACTORY,
        language: 'en'
    }, {
    [UiActions.selectBuilding]: (state, action) => {
        state.selectedBuilding = action.payload;
    },
    [UiActions.changeLanguage]: (state, action) => {
        console.log(action.payload);
        state.language = action.payload;
    },
    [UiActions.deselectBuildings]: (state, action) => {
        state.selectedBuilding = BuildingType.EMPTY;
    }
})

export default uiReducer