import React from "react";
import { connect } from "react-redux";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import MessageDialog from "./MessageDialog";
import Button from "../controls/Button";
import { updateAvailableChanged } from "../uiSlice";

// The service worker has installed a new build of the app (src/index.jsx, onUpdate). The player
// starts it now (a reload: the new worker already serves the new files) or later (the next
// start of the app has it anyway). Not during a match: the dialog waits for the title screen.
const UpdateAvailable = ({ open, later }) => (
  <MessageDialog
    open={open}
    close={later}
    title={t(tr.PWA_UPDATE_TITLE)}
    text={t(tr.PWA_UPDATE_TEXT)}
    data-testid="update-available"
  >
    <Button onClick={() => window.location.reload()}>{t(tr.PWA_UPDATE_NOW)}</Button>
    <Button color="secondary" onClick={later}>
      {t(tr.PWA_UPDATE_LATER)}
    </Button>
  </MessageDialog>
);

const mapStateToProps = (state) => ({
  open: state.ui.updateAvailable && typeof state.match.view === "undefined",
});

const mapDispatchToProps = (dispatch) => ({
  later: () => dispatch(updateAvailableChanged(false)),
});

export default connect(mapStateToProps, mapDispatchToProps)(UpdateAvailable);
