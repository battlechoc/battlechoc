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
import { multiplayer } from "./Multiplayer";
import { showQuickMessage, injectMultiplayerSession } from "./ui/UiActions";
import { gameplayLogger } from "./gameplay/GamePlayLogger";
import actionValidator from "./gameplay/ActionValidator";
import multiplayerActionRelay from "./gameplay/MultiplayerActionRelay";
import { configureStore } from "@reduxjs/toolkit";
import { ThemeProvider } from "react-jss";

const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(
      actionValidator,
      multiplayerActionRelay,
      gameplayLogger
    ),
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
  },
  breakpoints: {
    desktop: "@media screen and (min-width: 1200px)",
    laptop: "@media screen and (min-width: 992px)",
    tablet: "@media screen and (min-width: 768px)",
    smartphone: "@media screen and (min-width: 576px)",
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

if (typeof window.Android !== "undefined") {
  window.handleBattlechocPushMessage = (payload) => {
    console.log(
      "handleBattlechocPushMessage called " + JSON.stringify(payload)
    );
    multiplayer.handlePushMessage(payload);
  };

  window.enterSessionOnStartUp = (sessionId) => {
    console.log("enterSessionOnStartUp called " + JSON.stringify(sessionId));
    if (typeof sessionId !== "undefined") {
      store.dispatch(injectMultiplayerSession(sessionId));
    }
  };
}
