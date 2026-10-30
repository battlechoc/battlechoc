import React from "react";
import PropTypes from "prop-types";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import Dialog from "./Dialog";
import Button from "../controls/Button";

// What a match just unlocked (src/unlocks.js), once each:
// - "buildings" (the first match): every building, and the way to the demos of the buildings;
//   closing it skips them, the settings show them again; it also says how many matches the
//   Choclab and online play still need
// - "online" (the third match): the Choclab and online matches
// Only in the page while open: its button reads like the one in the settings.
const Unlocked = ({ step, gamesLeft, close, showDemos }) => {
  if (!step) {
    return null;
  }
  return (
    <Dialog open close={close} mode="info" title={t(tr.UNLOCK_TITLE)}>
      <div data-testid="unlocked" data-step={step} style={{ textAlign: "center" }}>
        {step === "buildings" ? (
          <>
            <p>{t(tr.UNLOCK_DEMOS_HINT)}</p>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <Button onClick={showDemos}>{t(tr.TUTORIAL_SHOW_BUILDINGS)}</Button>
            </div>
            {gamesLeft > 0 ? (
              <p>
                {gamesLeft === 1
                  ? t(tr.UNLOCK_ONLINE_ONE_GAME)
                  : t(tr.UNLOCK_ONLINE_GAMES, gamesLeft)}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <p>{t(tr.UNLOCK_NEW_FEATURES)}</p>
            <p>{t(tr.UNLOCK_ONLINE_HINT)}</p>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <Button onClick={close}>Ok</Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
};

Unlocked.propTypes = {
  step: PropTypes.oneOf(["buildings", "online"]),
  gamesLeft: PropTypes.number,
  close: PropTypes.func.isRequired,
  showDemos: PropTypes.func.isRequired,
};

export default Unlocked;
