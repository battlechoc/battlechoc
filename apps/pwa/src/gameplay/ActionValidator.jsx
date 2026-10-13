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
        const validity =
          (tutorial && action.type === manipulateGameAction) ||
          Object.values(UiActionTypes).includes(action.type) ||
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
