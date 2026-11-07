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

const theme = {
  color: {
    primary: { light: "#90D01B", dark: "#10A67B" },
    secondary: { light: "#3190C3", dark: "#1B4E69" },
    accent: { light: "#FF4E85", dark: "#772549" },
    gold: { light: "#FAD25A", dark: "#AE8D0B" },
    facebook: { light: "#6589F4", dark: "#435DAC" },
    discord: { light: "#5865f2", dark: "#404EED" },
    instagram: { light: "#FE5A93", dark: "#803FBB" },
    brown: { light: "#56321E", dark: "#4D2C1B" },
    warning: { light: "#FAD25A", dark: "#D28304" },
    // the sky behind the menus (the body gradient in index.css)
    sky: { light: "#9DD5E9", dark: "#3DA2CE" },
  },
  // the type scale of src/index.css: every font size is one of these steps (or em of one)
  font: {
    display: "var(--font-display)",
    body: "var(--font-body)",
    size: {
      xs: "var(--fs-xs)",
      sm: "var(--fs-sm)",
      md: "var(--fs-md)",
      lg: "var(--fs-lg)",
      xl: "var(--fs-xl)",
      xxl: "var(--fs-xxl)",
    },
    // the outline of display text, relative to its size
    stroke: "0.04em",
  },
  // the room every control keeps from the screen's edges (safe area included) and from its
  // neighbours, and the size of the round buttons: CSS variables of src/index.css. top, right
  // and left are for the corners, clear of a camera cutout's band; topMiddle for what sits in
  // the middle of the top edge, under the cutout.
  edge: {
    top: "var(--edge-top)",
    topMiddle: "var(--edge-top-middle)",
    right: "var(--edge-right)",
    bottom: "var(--edge-bottom)",
    left: "var(--edge-left)",
    gap: "var(--edge)",
  },
  fab: "var(--fab)",
  // the layers of the screen, from the board up (a component's own parts stack inside its layer)
  layer: {
    // the HUD's corners and the match's bottom bar over the board
    hud: 4,
    // the dialogs' backdrop, and a dialog opened from another one
    dialog: 10,
    stackedDialog: 20,
    // the end screen of a match, and the quick messages at the top
    endScreen: 100,
    messages: 100,
    // a rematch offer over the end screen
    overEndScreen: 110,
    // the way back after a crash, over everything
    recovery: 1000,
  },
  // the widths are repeated in the type scale's media queries in src/index.css: keep them in sync
  breakpoints: {
    desktop: "@media screen and (min-width: 1200px)",
    laptop: "@media screen and (min-width: 992px)",
    tablet: "@media screen and (min-width: 768px)",
    smartphone: "@media screen and (min-width: 576px)",
    // phones held sideways (the type scale shrinks its big steps there)
    shortLandscape:
      "@media screen and (orientation: landscape) and (max-height: 430px)",
    orientation: {
      portrait: "@media screen and (orientation: portrait)",
      landscape: "@media screen and (orientation: landscape)",
      square:
        "@media screen and (min-aspect-ratio: 3/4) and (max-aspect-ratio: 4/3)",
    },
  },
};

createRoot(document.getElementById("root")).render(
  <Provider store={store}>
    <ThemeProvider theme={theme}>
      <App />
    </ThemeProvider>
  </Provider>
);

// A new build is installed (the worker takes over at once, skipWaiting): the player is asked to
// start it (dialogs/UpdateAvailable.jsx), after the match if one is running.
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
