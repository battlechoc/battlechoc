import { createReducer } from 'redux-starter-kit';
import * as UiActions from './UiActions';
import { BuildingType } from '../gameplay/GameEntities';

const uiReducer = createReducer({
        selectedBuilding: BuildingType.EMPTY,
        language: 'en'
    }, {
    [UiActions.selectBuilding]: (state, action) => {
        state.selectedBuilding = action.payload;
    },
    [UiActions.changeLanguage]: (state, action) => {
        console.log(action.payload);
        state.language = action.payload;
    }
})

export default uiReducer