import { uiReducer } from "./ui/uiSlice";
import { settingsReducer } from "./settingsSlice";
import { matchReducer } from "./match/matchSlice";
import { liveReducer } from "./match/liveSlice";

const rootReducer = {
  match: matchReducer,
  live: liveReducer,
  ui: uiReducer,
  settings: settingsReducer,
};

export default rootReducer;
