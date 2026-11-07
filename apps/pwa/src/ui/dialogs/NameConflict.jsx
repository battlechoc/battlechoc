import React from "react";
import { connect } from "react-redux";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import MessageDialog from "./MessageDialog";
import Button from "../controls/Button";
import { nameConflictChanged } from "../uiSlice";

// The name kept on this device belongs to somebody else on the server
// (Multiplayer.replaceTakenName): the player got a random one instead, which the profile can
// change. Not during a match: the dialog waits for the title screen.
const NameConflict = ({ conflict, open, close }) => (
  <MessageDialog
    open={open}
    close={close}
    title={t(tr.NAME_CONFLICT_TITLE)}
    text={open ? t(tr.NAME_CONFLICT_TEXT, conflict.taken, conflict.generated) : null}
    data-testid="name-conflict"
  >
    <Button onClick={close}>{t(tr.NAME_CONFLICT_OK)}</Button>
  </MessageDialog>
);

const mapStateToProps = (state) => ({
  conflict: state.ui.nameConflict,
  open: Boolean(state.ui.nameConflict) && typeof state.match.view === "undefined",
});

const mapDispatchToProps = (dispatch) => ({
  close: () => dispatch(nameConflictChanged(null)),
});

export default connect(mapStateToProps, mapDispatchToProps)(NameConflict);
