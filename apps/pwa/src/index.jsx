import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import "./index.css";
import App from "./App";
import * as serviceWorker from "./registerServiceWorker";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import rootReducer from "./RootReducer";
import { matchSession } from "./match/LocalMatchHost";
import { multiplayer } from "./Multiplayer";
import {
  showQuickMessage,
  fontsArrived,
  updateAvailableChanged,
  connectivityChanged,
} from "./ui/uiSlice";
import { connectivity } from "./api/connectivity";
import { fontsLoaded } from "./firstLoad";
import { warmOnDemand } from "./ui/onDemand";
import promiseDispatch from "./helper/promiseDispatch";
import { configureStore } from "@reduxjs/toolkit";
import { hydrateSettings, createSettingsPersistence } from "./settingsSlice";
import OfflineStore from "./OfflineStore";
import logger from "./helper/logger";
import { ThemeProvider } from "react-jss";
import theme from "./theme";

const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware()
      .prepend(
        createSettingsPersistence(OfflineStore.settingsStore, (error) =>
          logger.warn("could not keep the setting", error)
        )
      )
      .concat(promiseDispatch),
});
matchSession.dispatch = store.dispatch;
matchSession.getState = store.getState;
// the settings kept on the device (tips, auto fullscreen)
store.dispatch(hydrateSettings(OfflineStore.settingsStore));

// the title screen's menu shows once the fonts are in (no jumping labels); it does not wait for
// the 3D engine, which arrives later. Then the chunks of what the player may open next are
// asked for (the lab, the tutorial, the end of a match).
fontsLoaded().then(() => {
  store.dispatch(fontsArrived());
  warmOnDemand();
});

createRoot(document.getElementById("root")).render(
  <Provider store={store}>
    <ThemeProvider theme={theme}>
      <App />
    </ThemeProvider>
  </Provider>
);

// The worker of a new build has taken over (skipWaiting, registerServiceWorker.js): the player is
// asked to start it (dialogs/UpdateAvailable.jsx), after the match if one is running.
let config = {
  onUpdate: () => {
    store.dispatch(updateAvailableChanged(true));
  },
};

// The offline cache downloads the whole game once more (Workbox fetches it past the browser cache):
// it starts only once the 3D models are in, so the first start does not share the connection
const whenAssetsReady = new Promise((resolve) => {
  if (store.getState().ui.assetsReady) {
    resolve();
    return;
  }
  const unsubscribe = store.subscribe(() => {
    if (store.getState().ui.assetsReady) {
      unsubscribe();
      resolve();
    }
  });
});
whenAssetsReady.then(() => serviceWorker.register(config));

window.addEventListener("offline", () => {
  store.dispatch(
    showQuickMessage({
      text: t(tr.PWA_OFFLINE_MODE),
      variant: "info",
      type: "PWA_OFFLINE_MESSAGE",
    })
  );
});

window.addEventListener("online", () => {
  store.dispatch(
    showQuickMessage({
      text: t(tr.PWA_ONLINE_MODE),
      variant: "info",
      type: "PWA_ONLINE_MESSAGE",
    })
  );
});

// state.ui.online: whether the server answers, serverDown: the internet works but the server does
// not (the toasts above follow the browser's network)
connectivity.onChange((status) => {
  store.dispatch(connectivityChanged(status));
  // a name chosen offline is claimed as soon as the server answers
  if (status === "online") {
    multiplayer.syncPendingUsername();
  }
});
connectivity.start();

// push messages forwarded by the service worker while the app is open
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data && event.data.type === "battlechoc-push") {
      multiplayer.handlePushMessage(event.data.payload);
    }
  });
}
