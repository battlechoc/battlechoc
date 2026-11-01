import React, { useState } from "react";
import { connect } from "react-redux";
import { createUseStyles } from "react-jss";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import Dialog from "./Dialog";
import PlayerNameInput from "../controls/PlayerNameInput";
import { ServerRequest } from "../../helper/settings";
import { multiplayer } from "../../Multiplayer";
import { loadUiState } from "../UiActions";
import logger from "../../helper/logger";

const useStyles = createUseStyles((theme) => ({
  body: {
    display: "flex",
    flexDirection: "column",
    gap: "0.8em",
    width: "min(22em, 70vw)",
    textAlign: "center",
    "& p": { margin: 0 },
  },
}));

// A name chosen offline was taken by somebody else before the server got it
// (Multiplayer.syncPendingUsername): the player chooses another one. It cannot be closed: other
// players must find a name, and the old one belongs to someone else now.
const NameConflict = ({ name, resolved }) => {
  const classes = useStyles();
  const [failed, setFailed] = useState(false);
  if (!name) {
    return null;
  }
  const choose = async (username) => {
    try {
      await ServerRequest("post", "/user/username", { username });
      await multiplayer.usernameSynced(username);
      resolved();
    } catch (error) {
      // taken in the meantime too: the field says so on the next check
      logger.info("could not take the new name", error);
      setFailed(true);
    }
  };
  return (
    <Dialog open closable={false} mode="info" title={t(tr.NAME_CONFLICT_TITLE)}>
      <div className={classes.body} data-testid="name-conflict">
        <p>{t(tr.NAME_CONFLICT_TEXT, name)}</p>
        <PlayerNameInput
          key={failed ? "again" : "first"}
          editMode
          setPlayerName={choose}
          startValue={name}
          current={name}
        />
      </div>
    </Dialog>
  );
};

const mapStateToProps = (state) => ({ name: state.ui.nameConflict });

const mapDispatchToProps = (dispatch) => ({
  resolved: () => dispatch(loadUiState({ nameConflict: null })),
});

export default connect(mapStateToProps, mapDispatchToProps)(NameConflict);
