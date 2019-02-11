import { gameplayReducer } from './gameplay/GameplayReducer';
import uiReducer from './ui/UiReducer';

const rootReducer = {
    gameplay: gameplayReducer,
    ui: uiReducer
}

export default rootReducer