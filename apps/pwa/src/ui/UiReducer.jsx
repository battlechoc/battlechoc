import { createReducer } from "@reduxjs/toolkit";
import * as UiActions from "./UiActions";
import {
  EmptyPlayerStats,
  EntityType,
} from "@battlechoc/battlechoc-shared-functions";
import OfflineStore from "../OfflineStore";
import { v4 as uuidv4 } from "uuid";

const uiReducer = createReducer(
  {
    selectedBuilding: EntityType.FACTORY,
    tappedBuilding: EntityType.FACTORY,
    assetsReady: false,
    tutorialAlreadySeen: false,
    overviewVisible: false,
    tutorial: false,
    friends: [],
    ranking: "Offline",
    playerInfos: { stats: EmptyPlayerStats, isSignedIn: false },
    language: window.location.pathname.substr(1, 2) === "de" ? "de" : "en",
    quickMessages: [],
    notification: { title: null, message: null, open: false },
    boardViewToggles: 0,
    // the building and attack tips above the palette (settings: "tips")
    tipsEnabled: true,
    boardFocus: { target: "own", seq: 0 },
    deniedAttack: { type: undefined, seq: 0 },
    // the tutorial lesson lets the player act; whitelistBuildings limits the build palette
    tutorialInteractive: false,
    whitelistBuildings: undefined,
    // the bottom edge of the tutorial's card (px from the top, 0 without a card)
    boardTopInset: 0,
  },
  (builder) =>
    builder
      .addCase(UiActions.resetUi, (state, action) => {
        state.whitelistBuildings = undefined;
        state.tappedBuilding = EntityType.FACTORY;
        state.selectedBuilding = EntityType.FACTORY;
        state.selectedAttack = undefined;
        state.overviewVisible = false;
      })
      .addCase(UiActions.toggleBoardView, (state) => {
        state.boardViewToggles += 1;
      })
      .addCase(UiActions.focusBoard, (state, action) => {
        state.boardFocus = { target: action.payload, seq: state.boardFocus.seq + 1 };
      })
      .addCase(UiActions.attackDenied, (state, action) => {
        state.deniedAttack = { type: action.payload, seq: state.deniedAttack.seq + 1 };
      })
      .addCase(UiActions.selectBuilding, (state, action) => {
        state.selectedBuilding = action.payload;
      })
      .addCase(UiActions.tapBuilding, (state, action) => {
        state.tappedBuilding = action.payload;
      })
      .addCase(UiActions.selectAttack, (state, action) => {
        state.selectedAttack = action.payload;
      })
      .addCase(UiActions.deselectAttack, (state, action) => {
        state.selectedAttack = undefined;
      })
      .addCase(UiActions.deselectBuildings, (state, action) => {
        state.selectedBuilding = undefined;
        state.tappedBuilding = undefined;
      })
      .addCase(UiActions.gameResumeable, (state, action) => {
        state.resumeGamePossible = action.payload;
      })
      .addCase(UiActions.assetsReady, (state, action) => {
        state.assetsReady = true;
      })
      .addCase(UiActions.loadUiState, (state, action) => {
        for (let property in action.payload) {
          state[property] = action.payload[property];
        }
      })
      .addCase(UiActions.showOverview, (state, action) => {
        state.overviewVisible = true;
      })
      .addCase(UiActions.notifyPlayerSignedIn, (state, action) => {
        state.playerInfos.isSignedIn = true;
        state.playerInfos.isAnonymous = action.payload.isAnonymous;
        state.playerInfos.email = action.payload.email;
        state.playerInfos.uid = action.payload.uid;
        state.playerInfos.name = action.payload.name;
      })
      .addCase(UiActions.stopTutorial, (state, action) => {
        state.tutorial = false;
        state.tutorialInteractive = false;
        state.whitelistBuildings = undefined;
        state.notificationOnLoopsEnd = null;
        OfflineStore.settingsStore.set("tutorialAlreadySeen", true);
      })
      .addCase(UiActions.startTutorial, (state, action) => {
        state.tutorial = true;
        state.loopAnimations = action.payload.loops;
        state.notificationOnLoopsEnd =
          action.payload.notificationOnLoopsEnd || null;
      })
      .addCase(UiActions.updatePlayerStats, (state, action) => {
        Object.assign(state.playerInfos.stats, action.payload);
      })
      .addCase(UiActions.loadFriendsList, (state, action) => {
        state.friends = action.payload;
        OfflineStore.playerStore.set("friends", action.payload);
      })
      .addCase(UiActions.setPlayerRank, (state, action) => {
        state.ranking = action.payload;
      })
      .addCase(UiActions.showQuickMessage, (state, action) => {
        if (
          action.payload.type === "PWA_ONLINE_MESSAGE" ||
          action.payload.type === "PWA_OFFLINE_MESSAGE"
        ) {
          state.quickMessages = state.quickMessages.filter(
            (message) =>
              message.type !== "PWA_ONLINE_MESSAGE" &&
              message.type !== "PWA_OFFLINE_MESSAGE"
          );
        }
        state.quickMessages.push({
          autoHideDuration:
            typeof action.payload.autoHideDuration === "undefined"
              ? 4000
              : action.payload.autoHideDuration,
          id: uuidv4(),
          text: action.payload.text || "",
          variant: action.payload.variant || "warning",
        });
      })
      .addCase(UiActions.hideQuickMessage, (state, action) => {
        state.quickMessages = state.quickMessages.filter(
          (message) => message.id !== action.payload
        );
      })
      .addCase(UiActions.showNotification, (state, action) => {
        const { title, message } = action.payload;
        state.notification = {
          title: title,
          message: message,
          open: true,
        };
      })
      .addCase(UiActions.hideNotification, (state) => {
        state.notification = { title: null, message: null, open: false };
      })

);

export default uiReducer;
