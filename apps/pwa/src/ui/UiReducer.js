import { createReducer } from 'redux-starter-kit';
import * as UiActions from './UiActions';

const uiReducer = createReducer({
        screen: 'START_SCREEN',
        messageAnimation: false
    }, {
    [UiActions.viewSelectScreen]: (state, action) => {
        state.screen = 'CHOOSE_START_OR_FIELD'
    },
    [UiActions.viewIngameScreen]: (state, action) => {
        state.screen = 'GAME_RUNNING'
    },
    [UiActions.showMessage]: (state, action) => {
        state.message = action.payload;
        state.messageAnimation = true;
    },
    [UiActions.hideMessage]: (state, action) => {
        state.message = undefined;
        state.messageAnimation = false;
    }
})

export default uiReducer