import { createSlice, createListenerMiddleware, isAnyOf } from "@reduxjs/toolkit";

// The settings the player switches in the game: the tips above the palettes and whether a match
// goes fullscreen. They are kept on the device (IndexedDB "settings"); the storage keys are those
// installed games already have, so they must not change. (Language, sound and the lab intro keep
// their own entries: helper/language.js, ui/misc/Jukebox.jsx, ui/lab/LabIntro.jsx.)
const STORAGE_KEYS = {
  tipsEnabled: "tips",
  autoFullscreen: "autoFullscreen",
};

const initialState = {
  // the building and attack tips above the palette
  tipsEnabled: true,
  // a match goes fullscreen on start
  autoFullscreen: true,
};

const settingsSlice = createSlice({
  name: "battlechoc/settings",
  initialState,
  reducers: {
    tipsEnabledChanged(state, action) {
      state.tipsEnabled = action.payload;
    },
    autoFullscreenChanged(state, action) {
      state.autoFullscreen = action.payload;
    },
    // what the device keeps (only what it has: the rest stays as it is)
    settingsHydrated(state, action) {
      Object.assign(state, action.payload);
    },
  },
});

export const { tipsEnabledChanged, autoFullscreenChanged, settingsHydrated } =
  settingsSlice.actions;
export const settingsReducer = settingsSlice.reducer;

/**
 * Reads the settings from the device's storage (`get(key)` resolves with the stored value). Only
 * a stored `false` switches a setting off, as it always did; anything else keeps the default.
 */
export const hydrateSettings = (storage) => async (dispatch) => {
  const stored = {};
  await Promise.all(
    Object.entries(STORAGE_KEYS).map(async ([name, key]) => {
      try {
        if ((await storage.get(key)) === false) {
          stored[name] = false;
        }
      } catch {
        // a setting that cannot be read keeps its default
      }
    })
  );
  if (Object.keys(stored).length > 0) {
    dispatch(settingsHydrated(stored));
  }
};

/**
 * Keeps every change the player makes on the device (`set(key, value)`): a listener middleware
 * for the store, so the components only dispatch.
 */
export const createSettingsPersistence = (storage, onError = () => {}) => {
  const listener = createListenerMiddleware();
  listener.startListening({
    matcher: isAnyOf(tipsEnabledChanged, autoFullscreenChanged),
    effect: async (action, api) => {
      const settings = api.getState().settings;
      const name = action.type === tipsEnabledChanged.type ? "tipsEnabled" : "autoFullscreen";
      try {
        await storage.set(STORAGE_KEYS[name], settings[name]);
      } catch (error) {
        onError(error);
      }
    },
  });
  return listener.middleware;
};
