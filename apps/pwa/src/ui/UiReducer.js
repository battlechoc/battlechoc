import { createReducer } from 'redux-starter-kit';
import * as UiActions from './UiActions';
import { EntityType } from '../gameplay/GameEntities';
import OfflineStore from '../OfflineStore';
import { EmptyPlayerStats } from '../Multiplayer';

const uiReducer = createReducer({
    selectedBuilding: EntityType.FACTORY,
    tappedBuilding: EntityType.FACTORY,
    statistics: false,
    assetsReady: false,
    tutorialAlreadySeen: false,
    overviewVisible: false,
    tutorial: false,
    playerInfos: { stats: EmptyPlayerStats, isSignedIn: false },
    language: window.location.pathname.substr(1, 2) === 'de' ? 'de' : 'en'
}, {
        [UiActions.resetUi]: (state, action) => {
            state.whitelistBuildings = undefined;
            state.whitelistAttacks = undefined;
            state.tappedBuilding = EntityType.FACTORY;
            state.selectedBuilding = EntityType.FACTORY;
            state.multiplayerWaiting = undefined;
            state.selectedAttack = undefined;
            state.overviewVisible = false;
        },
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
        },
        [UiActions.waitForMultiplayer]: (state, action) => {
            state.multiplayerWaiting = true;
        },
        [UiActions.joinedMultiplayer]: (state, action) => {
            state.multiplayerWaiting = undefined;
        },
        [UiActions.loadUiState]: (state, action) => {
            for (let property in action.payload) {
                state[property] = action.payload[property];
            }
        },
        [UiActions.showOverview]: (state, action) => {
            state.overviewVisible = true;
        },
        [UiActions.notifyPlayerSignedIn]: (state, action) => {
            state.playerInfos.isSignedIn = true;
            state.playerInfos.isAnonymous = action.payload.isAnonymous;
            state.playerInfos.email = action.payload.email;
            state.playerInfos.uid = action.payload.uid;
            state.playerInfos.name = action.payload.name;
        },
        [UiActions.notifyPlayerSignedOut]: (state, action) => {
            state.playerInfos.isSignedIn = false;
            state.playerInfos.isAnonymous = true;
            state.playerInfos.email = undefined;
            state.playerInfos.name = undefined;
            state.playerInfos.uid = undefined;
            state.playerInfos.stats = EmptyPlayerStats;
        },
        [UiActions.stopTutorial]: (state, action) => {
            state.tutorial = false;
            OfflineStore.settingsStore.set("tutorialAlreadySeen", true);
        },
        [UiActions.startTutorial]: (state, action) => {
            state.tutorial = true;
        },
        [UiActions.updatePlayerStats]: (state, action) => {
            state.playerInfos.stats = action.payload;
        }
    }
);

export default uiReducer