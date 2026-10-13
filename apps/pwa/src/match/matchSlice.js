import { createSlice } from "@reduxjs/toolkit";

// Real-time match state as seen by the local player. The full engine state lives in the
// match host; Redux only holds the player's view, the newest events (for animations) and
// host flags.
const initialState = {
  view: undefined,
  events: [],
  paused: false,
  awards: undefined,
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
  },
});

export const { matchUpdated, matchPaused, matchAwarded, matchCleared } =
  matchSlice.actions;
export const matchReducer = matchSlice.reducer;

// the game the scene and HUD render: a real-time match view, or the turn-based state that
// the tutorial and the debug situations still use
export const selectActiveGame = (state) =>
  typeof state.match.view !== "undefined"
    ? state.match.view
    : state.gameplay.game;

export const selectIsRealtime = (state) =>
  typeof state.match.view !== "undefined";
