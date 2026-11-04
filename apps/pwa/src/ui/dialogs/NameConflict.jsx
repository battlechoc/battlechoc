import React from "react";
import { connect } from "react-redux";
import { createUseStyles } from "react-jss";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import Dialog from "./Dialog";
import Button from "../controls/Button";
import { loadUiState } from "../UiActions";

const useStyles = createUseStyles((theme) => ({
  body: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.8em",
    width: "min(22em, 70vw)",
    "& p": {
      margin: "0 0 0.3em",
      textAlign: "center",
      color: "white",
      fontFamily: theme.font.body,
      fontSize: theme.font.size.md,
    },
  },
}));

// The name kept on this device belongs to somebody else on the server
// (Multiplayer.replaceTakenName): the player got a random one instead, which the profile can
// change. Not during a match: the dialog waits for the title screen.
const NameConflict = ({ conflict, open, close }) => {
  const classes = useStyles();
  if (!open) {
    return null;
  }
  return (
    <Dialog open close={close} mode="info" title={t(tr.NAME_CONFLICT_TITLE)}>
      <div className={classes.body} data-testid="name-conflict">
        <p>{t(tr.NAME_CONFLICT_TEXT, conflict.taken, conflict.generated)}</p>
        <Button onClick={close}>{t(tr.NAME_CONFLICT_OK)}</Button>
      </div>
    </Dialog>
  );
};

const mapStateToProps = (state) => ({
  conflict: state.ui.nameConflict,
  open: Boolean(state.ui.nameConflict) && typeof state.match.view === "undefined",
});

const mapDispatchToProps = (dispatch) => ({
  close: () => dispatch(loadUiState({ nameConflict: null })),
});

export default connect(mapStateToProps, mapDispatchToProps)(NameConflict);
