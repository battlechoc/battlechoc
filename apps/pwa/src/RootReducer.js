import { uiReducer } from "./ui/uiSlice.js";
import { settingsReducer } from "./settingsSlice.js";
import { matchReducer } from "./match/matchSlice.js";
import { liveReducer } from "./match/liveSlice.js";

const rootReducer = {
  match: matchReducer,
  live: liveReducer,
  ui: uiReducer,
  settings: settingsReducer,
};

export default rootReducer;
