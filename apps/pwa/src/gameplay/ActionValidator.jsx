import {
  Rules,
  BattlechocError,
} from "@battlechoc/battlechoc-shared-functions";
import { manipulateGameAction } from "./GameActions";
import { UiActionTypes } from "../ui/UiActions";

function actionValidatorMiddleware() {
  return ({ getState }) =>
    (next) =>
    (action) => {
      return new Promise((resolve, reject) => {
        const state = getState();
        const game = state.gameplay.game;
        const tutorial = state.ui.tutorial;
        // only the turn-based actions (tutorial, debug situations) are validated here;
        // real-time match actions are validated by the match host
        const validity =
          (tutorial && action.type === manipulateGameAction) ||
          Object.values(UiActionTypes).includes(action.type) ||
          !action.type.startsWith("battlechoc/gameplay/") ||
          Rules.isActionValid(game, action);

        if (validity instanceof BattlechocError) {
          reject(validity);
        } else {
          resolve(next(action));
        }
      });
    };
}

const actionValidator = actionValidatorMiddleware();
export default actionValidator;
