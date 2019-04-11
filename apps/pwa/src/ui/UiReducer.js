import { createReducer } from 'redux-starter-kit';
import * as UiActions from './UiActions';
import { EntityType, AttackType } from '../gameplay/GameEntities';
import OfflineStore from '../OfflineStore';

const uiReducer = createReducer({
    selectedBuilding: EntityType.FACTORY,
    tappedBuilding: EntityType.FACTORY,
    selectedAttack: AttackType.TRUFFLE,
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
        [UiActions.deselectBuildings]: (state, action) => {
            state.selectedBuilding = undefined;
            state.tappedBuilding = undefined;
        },
        [UiActions.gameResumeable]: (state, action) => {
            state.resumeGamePossible = action.payload;
        }
    })

export default uiReducer