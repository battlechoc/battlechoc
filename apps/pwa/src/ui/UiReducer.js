import { createReducer } from 'redux-starter-kit';
import * as UiActions from './UiActions';
import { BuildingType } from '../gameplay/GameEntities';

const uiReducer = createReducer({
        selectedBuilding: BuildingType.FACTORY,
        language: window.location.pathname.substr(1,2) === 'de' ? 'de' : 'en'
    }, {
    [UiActions.selectBuilding]: (state, action) => {
        state.selectedBuilding = action.payload;
    },
    [UiActions.changeLanguage]: (state, action) => {
        state.language = action.payload;
    },
    [UiActions.deselectBuildings]: (state, action) => {
        state.selectedBuilding = BuildingType.EMPTY;
    }
})

export default uiReducer