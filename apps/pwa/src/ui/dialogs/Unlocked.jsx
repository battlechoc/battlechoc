import React from "react";
import PropTypes from "prop-types";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import Dialog from "./Dialog";
import Button from "../controls/Button";

// After the first win: what it unlocked, before the demos of the buildings (a toast said it
// before, under which the demos' card started). Closing it skips the demos; the settings show
// them again. Only in the page while open: its button reads like the one in the settings.
const Unlocked = ({ open, close, showDemos }) =>
  open ? (
    <Dialog open close={close} mode="info" title={t(tr.UNLOCK_TITLE)}>
      <div data-testid="unlocked" style={{ textAlign: "center" }}>
        <p>{t(tr.UNLOCK_NEW_FEATURES)}</p>
        <p>{t(tr.UNLOCK_DEMOS_HINT)}</p>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Button onClick={showDemos}>{t(tr.TUTORIAL_SHOW_BUILDINGS)}</Button>
        </div>
      </div>
    </Dialog>
  ) : null;

Unlocked.propTypes = {
  open: PropTypes.bool.isRequired,
  close: PropTypes.func.isRequired,
  showDemos: PropTypes.func.isRequired,
};

export default Unlocked;
