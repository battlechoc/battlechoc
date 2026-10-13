import { createSlice } from "@reduxjs/toolkit";

// Real-time match state as seen by the local player. The full engine state lives in the
// match host; Redux only holds the player's view, the newest events (for animations) and
// host flags.
const initialState = {
  view: undefined,
  events: [],
  paused: false,
  awards: undefined,
  // online: hosted by the server (no pause); pending: sent actions not yet confirmed
  online: false,
  pending: 0,
  result: undefined,
};

const matchSlice = createSlice({
  name: "battlechoc/match",
  initialState,
  reducers: {
    matchUpdated(state, action) {
      state.view = action.payload.view;
      state.events = action.payload.events;
    },
    matchPaused(state, action) {
      state.paused = action.payload;
    },
    matchAwarded(state, action) {
      state.awards = action.payload;
    },
    matchCleared() {
      return initialState;
    },
    matchHosted(state, action) {
      state.online = action.payload.online;
    },
    pendingChanged(state, action) {
      state.pending = action.payload;
    },
    matchResultReceived(state, action) {
      state.result = action.payload;
    },
  },
});

export const {
  matchUpdated,
  matchPaused,
  matchAwarded,
  matchCleared,
  matchHosted,
  pendingChanged,
  matchResultReceived,
} = matchSlice.actions;
export const matchReducer = matchSlice.reducer;

// the match view the scene and the HUD render (matches, the tutorial lesson and demos)
export const selectActiveGame = (state) => state.match.view;

export const selectIsRealtime = (state) =>
  typeof state.match.view !== "undefined";
