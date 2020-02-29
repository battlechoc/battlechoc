import { createReducer } from 'redux-starter-kit';
import * as UiActions from './UiActions';
import { EmptyPlayerStats, EntityType } from 'battlechoc-shared-functions';
import OfflineStore from '../OfflineStore';
import { ServerRequest } from '../helper/settings';
import logger from '../helper/logger';

const uiReducer = createReducer({
    selectedBuilding: EntityType.FACTORY,
    tappedBuilding: EntityType.FACTORY,
    assetsReady: false,
    tutorialAlreadySeen: false,
    overviewVisible: false,
    tutorial: false,
    friends: [],
    ranking: 'Offline',
    multiplayerSessions: [],
    playerInfos: { stats: EmptyPlayerStats, isSignedIn: false },
    language: window.location.pathname.substr(1, 2) === 'de' ? 'de' : 'en',
    quickMessage: {
        show: false,
        text: '',
        variant: 'warning'
    },
    sessionRefreshActions: 0,
    donutHighlighting: false
}, {
    [UiActions.resetUi]: (state, action) => {
        state.whitelistBuildings = undefined;
        state.whitelistAttacks = undefined;
        state.tappedBuilding = EntityType.FACTORY;
        state.selectedBuilding = EntityType.FACTORY;
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
        ServerRequest('post', '/user/language', { language: action.payload })
        .catch(error => {
            if (!error instanceof ReferenceError) {
                logger.warn(error)
            }
        })
        .finally(() => OfflineStore.settingsStore.set("language", action.payload));
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
    [UiActions.assetsReady]: (state, action) => {
        state.assetsReady = true;
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
        state.ranking = 'Offline';
        OfflineStore.playerStore.set('stats', EmptyPlayerStats);
        OfflineStore.playerStore.set('friends', undefined);
        OfflineStore.playerStore.set('multiplayerSessions', undefined);
        state.resumeGamePossible = false;
        OfflineStore.gamestateStore.clear();
    },
    [UiActions.stopTutorial]: (state, action) => {
        state.tutorial = false;
        OfflineStore.settingsStore.set("tutorialAlreadySeen", true);
    },
    [UiActions.startTutorial]: (state, action) => {
        state.tutorial = true;
        state.loopAnimations = action.payload;
    },
    [UiActions.updatePlayerStats]: (state, action) => {
        Object.assign(state.playerInfos.stats, action.payload);
    },
    [UiActions.updateMultiplayerSessions]: (state, action) => {
        state.multiplayerSessions = action.payload;
        OfflineStore.playerStore.set('multiplayerSessions', action.payload);
    },
    [UiActions.loadFriendsList]: (state, action) => {
        state.friends = action.payload;
        OfflineStore.playerStore.set('friends', action.payload);
    },
    [UiActions.setPlayerRank]: (state, action) => {
        state.ranking = action.payload;
    },
    [UiActions.updateLevel]: (state, action) => {
        state.playerInfos.stats.level = action.payload;
    },
    [UiActions.showQuickMessage]: (state, action) => {
        state.quickMessage.show = true;
        state.quickMessage.text = action.payload.text || '';
        state.quickMessage.variant = action.payload.variant || 'warning';
    },
    [UiActions.hideQuickMessage]: (state, action) => {
        state.quickMessage.show = false;
        state.quickMessage.text = '';
        state.quickMessage.variant = 'warning';
    },
    [UiActions.startSessionRefresh]: (state, action) => {
        state.sessionRefreshActions += 1;
    },
    [UiActions.stopSessionRefresh]: (state, action) => {
        if (state.sessionRefreshActions > 0) {
            state.sessionRefreshActions -= 1;
        }
    },
    [UiActions.toggleDonutHighlighting]: (state, action) => {
        if (typeof action.payload !== 'undefined') {
            state.donutHighlighting = action.payload;
        } else {
            state.donutHighlighting = !state.donutHighlighting;
        }
    }
});

export default uiReducer