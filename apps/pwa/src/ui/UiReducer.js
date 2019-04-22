import { createReducer } from 'redux-starter-kit';
import * as UiActions from './UiActions';
import { EntityType } from '../gameplay/GameEntities';
import OfflineStore from '../OfflineStore';

const uiReducer = createReducer({
        selectedBuilding: EntityType.FACTORY,
        tappedBuilding: EntityType.FACTORY,
        statistics: false,
        assetsReady: false,
        language: window.location.pathname.substr(1, 2) === 'de' ? 'de' : 'en'
    }, {
        [UiActions.selectBuilding]: (state, action) => {
            state.selectedBuilding = action.payload;
        },
        [UiActions.tapBuilding]: (state, action) => {
            state.tappedBuilding = action.payload;
        },
        [UiActions.selectAttack]: (state, action) => {
            state.selectedAttack = action.payload;
        },
        [UiActions.changeLanguage]: (state, action) => {
            state.language = action.payload;
            OfflineStore.settingsStore.set("language", action.payload);
        },
        [UiActions.deselectAttack]: (state, action) => {
            state.selectedAttack = undefined;
        },
        [UiActions.deselectBuildings]: (state, action) => {
            state.selectedBuilding = undefined;
            state.tappedBuilding = undefined;
        },
        [UiActions.gameResumeable]: (state, action) => {
            state.resumeGamePossible = action.payload;
        },
        [UiActions.showStatistics]: (state, action) => {
            state.statistics = action.payload;
        },
        [UiActions.assetsReady]: (state, action) => {
            state.assetsReady = true;
        }
});

export default uiReducer