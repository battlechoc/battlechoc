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

// The service worker has installed a new build of the app (src/index.jsx, onUpdate). The player
// starts it now (a reload: the new worker already serves the new files) or later (the next
// start of the app has it anyway). Not during a match: the dialog waits for the title screen.
const UpdateAvailable = ({ open, later }) => {
  const classes = useStyles();
  if (!open) {
    return null;
  }
  return (
    <Dialog open close={later} mode="info" title={t(tr.PWA_UPDATE_TITLE)}>
      <div className={classes.body} data-testid="update-available">
        <p>{t(tr.PWA_UPDATE_TEXT)}</p>
        <Button onClick={() => window.location.reload()}>{t(tr.PWA_UPDATE_NOW)}</Button>
        <Button color="secondary" onClick={later}>
          {t(tr.PWA_UPDATE_LATER)}
        </Button>
      </div>
    </Dialog>
  );
};

const mapStateToProps = (state) => ({
  open: state.ui.updateAvailable && typeof state.match.view === "undefined",
});

const mapDispatchToProps = (dispatch) => ({
  later: () => dispatch(loadUiState({ updateAvailable: false })),
});

export default connect(mapStateToProps, mapDispatchToProps)(UpdateAvailable);
