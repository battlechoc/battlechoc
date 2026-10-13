import { gameplayReducer } from "./gameplay/GameplayReducer";
import uiReducer from "./ui/UiReducer";
import { matchReducer } from "./match/matchSlice";
import { liveReducer } from "./match/liveSlice";

const rootReducer = {
  gameplay: gameplayReducer,
  match: matchReducer,
  live: liveReducer,
  ui: uiReducer,
};

export default rootReducer;
