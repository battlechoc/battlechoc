import { gameplayReducer } from "./gameplay/GameplayReducer";
import uiReducer from "./ui/UiReducer";
import { matchReducer } from "./match/matchSlice";

const rootReducer = {
  gameplay: gameplayReducer,
  match: matchReducer,
  ui: uiReducer,
};

export default rootReducer;
