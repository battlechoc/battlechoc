// The settings kept on the device (node --test): hydrated from the storage keys installed games
// have ("tips", "autoFullscreen"), and every change written back by the listener.
import { test } from "node:test";
import assert from "node:assert/strict";
import { configureStore } from "@reduxjs/toolkit";
import {
  settingsReducer,
  tipsEnabledChanged,
  autoFullscreenChanged,
  hydrateSettings,
  createSettingsPersistence,
} from "../../src/settingsSlice.js";

const fakeStorage = (entries = {}) => {
  const data = new Map(Object.entries(entries));
  return {
    data,
    writes: [],
    async get(key) {
      return data.get(key);
    },
    async set(key, value) {
      this.writes.push([key, value]);
      data.set(key, value);
    },
  };
};

const storeWith = (storage) =>
  configureStore({
    reducer: { settings: settingsReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().prepend(createSettingsPersistence(storage)),
  });

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

test("both settings are on until the player switches them off", () => {
  assert.deepEqual(settingsReducer(undefined, { type: "init" }), {
    tipsEnabled: true,
    autoFullscreen: true,
  });
});

test("hydrating takes a stored false and leaves everything else at the default", async () => {
  const storage = fakeStorage({ tips: false, autoFullscreen: "yes" });
  const store = storeWith(storage);
  await store.dispatch(hydrateSettings(storage));
  assert.deepEqual(store.getState().settings, {
    tipsEnabled: false,
    autoFullscreen: true,
  });
  // reading writes nothing back
  await settled();
  assert.deepEqual(storage.writes, []);
});

test("nothing stored: the defaults", async () => {
  const storage = fakeStorage();
  const store = storeWith(storage);
  await store.dispatch(hydrateSettings(storage));
  assert.deepEqual(store.getState().settings, {
    tipsEnabled: true,
    autoFullscreen: true,
  });
});

test("a storage that fails keeps the defaults", async () => {
  const storage = {
    get: async () => {
      throw new Error("no database");
    },
  };
  const store = storeWith(fakeStorage());
  await store.dispatch(hydrateSettings(storage));
  assert.deepEqual(store.getState().settings, {
    tipsEnabled: true,
    autoFullscreen: true,
  });
});

test("every change is kept under the storage key installed games have", async () => {
  const storage = fakeStorage();
  const store = storeWith(storage);
  store.dispatch(tipsEnabledChanged(false));
  store.dispatch(autoFullscreenChanged(false));
  store.dispatch(tipsEnabledChanged(true));
  await settled();
  assert.deepEqual(storage.writes, [
    ["tips", false],
    ["autoFullscreen", false],
    ["tips", true],
  ]);
  assert.deepEqual(store.getState().settings, {
    tipsEnabled: true,
    autoFullscreen: false,
  });
});

test("a failed write is reported, the state keeps the change", async () => {
  const errors = [];
  const store = configureStore({
    reducer: { settings: settingsReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().prepend(
        createSettingsPersistence(
          {
            set: async () => {
              throw new Error("quota");
            },
          },
          (error) => errors.push(error.message)
        )
      ),
  });
  store.dispatch(tipsEnabledChanged(false));
  await settled();
  assert.deepEqual(errors, ["quota"]);
  assert.equal(store.getState().settings.tipsEnabled, false);
});
