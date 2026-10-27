import React from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import "./index.css";
import App from "./App";
import * as serviceWorker from "./serviceWorker";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import rootReducer from "./RootReducer";
import { matchSession } from "./match/LocalMatchHost";
import { multiplayer } from "./Multiplayer";
import { showQuickMessage, loadUiState } from "./ui/UiActions";
import { connectivity } from "./connectivity";
import promiseDispatch from "./helper/promiseDispatch";
import { configureStore } from "@reduxjs/toolkit";
import { ThemeProvider } from "react-jss";

const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(promiseDispatch),
});
matchSession.dispatch = store.dispatch;

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

let config = {
  onUpdate: () => {
    store.dispatch(
      showQuickMessage({
        text: t(tr.PWA_UPDATE_AVAILABLE),
        variant: "info",
      })
    );
  },
};

serviceWorker.register(config);

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

// state.ui.online: whether the server answers (the toasts above follow the browser's network)
connectivity.onChange((online) => store.dispatch(loadUiState({ online })));
connectivity.start();

// push messages forwarded by the service worker while the app is open
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data && event.data.type === "battlechoc-push") {
      multiplayer.handlePushMessage(event.data.payload);
    }
  });
}
