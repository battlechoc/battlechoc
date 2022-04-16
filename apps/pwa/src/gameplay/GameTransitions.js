import {
  GameStateTypes,
  playerHasAttacks,
} from "@battlechoc/battlechoc-shared-functions";
import { multiplayer } from "../Multiplayer";

const GameTransitions = Object.freeze({
  PLAYER_HAS_CHOSEN_START: "GameTransitions.PLAYER_HAS_CHOSEN_START",
  PLAYER_INITAL_PLACEMENT: "GameTransitions.PLAYER_INITAL_PLACEMENT",
  PLAYER_FINISHED_INITIAL_PLACEMENT:
    "GameTransitions.PLAYER_FINISHED_INITIAL_PLACEMENT",
  OPPONENT_INITAL_PLACEMENT: "GameTransitions.OPPONENT_INITAL_PLACEMENT",
  PLAYER_BUILD_PHASE: "GameTransitions.PLAYER_BUILD_PHASE",
  PLAYER_ATTACK_PHASE: "GameTransitions.PLAYER_ATTACK_PHASE",
  OPPONENT_BUILD_PHASE: "GameTransitions.OPPONENT_BUILD_PHASE",
  OPPONENT_ATTACK_PHASE: "GameTransitions.OPPONENT_ATTACK_PHASE",
  ATTACKS_DEPLETED: "GameTransitions.ATTACKS_DEPLETED",
  INVALID: "GameTransitions.INVALID",
});

function getGameTransition(currentState, nextState) {
  if (typeof currentState === "undefined" || typeof nextState === "undefined") {
    return;
  }

  if (
    currentState.state === GameStateTypes.CHOOSE_FIELD_OR_START &&
    nextState.state === GameStateTypes.CHOOSE_FIELD &&
    multiplayer.isLocalPlayer(currentState.currentPlayerIndex) === true
  ) {
    return GameTransitions.PLAYER_HAS_CHOSEN_START;
  } else if (
    (currentState.state === GameStateTypes.CHOOSE_FIELD_OR_START &&
      nextState.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT) ||
    (currentState.state === GameStateTypes.CHOOSE_FIELD &&
      nextState.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT)
  ) {
    if (multiplayer.isLocalPlayer(nextState.currentPlayerIndex) === true) {
      return GameTransitions.PLAYER_INITAL_PLACEMENT;
    } else {
      return GameTransitions.OPPONENT_INITAL_PLACEMENT;
    }
  } else if (
    currentState.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT &&
    nextState.state === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT &&
    multiplayer.isLocalPlayer(nextState.currentPlayerIndex) === false
  ) {
    return GameTransitions.PLAYER_FINISHED_INITIAL_PLACEMENT;
  } else if (
    nextState.state === GameStateTypes.BUILD_PHASE &&
    currentState.state !== GameStateTypes.BUILD_PHASE
  ) {
    if (multiplayer.isLocalPlayer(nextState.currentPlayerIndex) === true) {
      return GameTransitions.PLAYER_BUILD_PHASE;
    } else {
      return GameTransitions.OPPONENT_BUILD_PHASE;
    }
  } else if (
    nextState.state === GameStateTypes.BUILD_PHASE &&
    currentState.state === GameStateTypes.BUILD_PHASE &&
    multiplayer.isLocalPlayer(nextState.currentPlayerIndex) === false &&
    multiplayer.isLocalPlayer(currentState.currentPlayerIndex) === true
  ) {
    return GameTransitions.OPPONENT_BUILD_PHASE;
  } else if (
    nextState.state === GameStateTypes.BUILD_PHASE &&
    currentState.state === GameStateTypes.BUILD_PHASE &&
    multiplayer.isLocalPlayer(nextState.currentPlayerIndex) === true &&
    multiplayer.isLocalPlayer(currentState.currentPlayerIndex) === false
  ) {
    return GameTransitions.PLAYER_BUILD_PHASE;
  } else if (
    nextState.state === GameStateTypes.ATTACK_PHASE &&
    currentState.state === GameStateTypes.BUILD_PHASE
  ) {
    if (multiplayer.isLocalPlayer(nextState.currentPlayerIndex) === true) {
      return GameTransitions.PLAYER_ATTACK_PHASE;
    } else {
      return GameTransitions.OPPONENT_ATTACK_PHASE;
    }
  } else if (
    nextState.state === GameStateTypes.ATTACK_PHASE &&
    currentState.state === GameStateTypes.ATTACK_PHASE &&
    nextState.currentPlayerIndex !== currentState.currentPlayerIndex
  ) {
    if (multiplayer.isLocalPlayer(nextState.currentPlayerIndex) === true) {
      return GameTransitions.PLAYER_ATTACK_PHASE;
    } else {
      return GameTransitions.OPPONENT_ATTACK_PHASE;
    }
  } else if (
    nextState.state === GameStateTypes.ATTACK_PHASE &&
    currentState.state === GameStateTypes.ATTACK_PHASE &&
    multiplayer.isLocalPlayer(nextState.currentPlayerIndex) === true &&
    playerHasAttacks(nextState.players[multiplayer.localPlayerIndex]) === false
  ) {
    return GameTransitions.ATTACKS_DEPLETED;
  } else {
    return GameTransitions.INVALID;
  }
}

export { GameTransitions, getGameTransition };
