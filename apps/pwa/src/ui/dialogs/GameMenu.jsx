import React from "react";
import PropTypes from "prop-types";
import { createUseStyles } from "react-jss";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import Dialog from "./Dialog";
import Button from "../controls/Button";

const useStyles = createUseStyles((theme) => ({
  menu: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.6em",
    "& p": {
      margin: "0 0 0.3em",
      textAlign: "center",
      color: "white",
      fontFamily: theme.font.body,
      fontSize: theme.font.size.md,
    },
  },
}));

// The menu of a match, behind the one button at its top left: sound, fullscreen, the settings
// and the way out. Against the AI the match waits while it is open (Actionbar pauses it);
// online it keeps running, which the menu says. Only in the page while open: its button texts
// also stand elsewhere.
const GameMenu = ({ open, close, paused, online, soundOn, toggleSound, fullscreen, toggleFullscreen, openSettings, leave }) => {
  const classes = useStyles();
  if (!open) {
    return null;
  }
  return (
    <Dialog open close={close} mode="info" title={t(tr.GAME_MENU_TITLE)}>
      <div className={classes.menu} data-testid="game-menu">
        {online ? <p>{t(tr.GAME_MENU_ONLINE)}</p> : null}
        {paused ? <p>{t(tr.GAME_MENU_PAUSED)}</p> : null}
        <Button onClick={close}>{t(tr.GAME_MENU_RESUME)}</Button>
        <Button color="secondary" onClick={toggleSound}>
          {soundOn ? t(tr.GAME_MENU_SOUND_ON) : t(tr.GAME_MENU_SOUND_OFF)}
        </Button>
        {fullscreen ? (
          <Button color="secondary" onClick={toggleFullscreen}>
            {t(tr.GAME_MENU_FULLSCREEN)}
          </Button>
        ) : null}
        <Button color="secondary" onClick={openSettings}>
          {t(tr.SETTINGS)}
        </Button>
        {leave ? (
          <Button color="accent" onClick={leave}>
            {online ? t(tr.SURRENDER) : t(tr.GAME_MENU_LEAVE)}
          </Button>
        ) : null}
      </div>
    </Dialog>
  );
};

GameMenu.propTypes = {
  open: PropTypes.bool.isRequired,
  close: PropTypes.func.isRequired,
  paused: PropTypes.bool,
  online: PropTypes.bool,
  soundOn: PropTypes.bool,
  toggleSound: PropTypes.func.isRequired,
  fullscreen: PropTypes.bool,
  toggleFullscreen: PropTypes.func.isRequired,
  openSettings: PropTypes.func.isRequired,
  // undefined in the tutorial: it has its own way out
  leave: PropTypes.func,
};

export default GameMenu;
