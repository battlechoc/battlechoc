import uiReducer from "./ui/UiReducer";
import { matchReducer } from "./match/matchSlice";
import { liveReducer } from "./match/liveSlice";

const rootReducer = {
  match: matchReducer,
  live: liveReducer,
  ui: uiReducer,
};

export default rootReducer;
