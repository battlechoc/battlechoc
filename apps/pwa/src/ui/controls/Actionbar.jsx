import React, { useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import {
  engine,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import { selectActiveGame } from "../../match/matchSlice";
import { matchSession } from "../../match/LocalMatchHost";
import Fab from "./Fab";
import Button from "./Button";
import Dialog from "../dialogs/Dialog";
import GameMenu from "../dialogs/GameMenu";
import { Jukebox, useAudioSettings } from "../misc";
import { showOfflineMessage } from "../UiActions";
import { enterFullscreen, useFullscreenAvailable } from "../../helper/fullscreen";
import { createUseStyles } from "react-jss";

const useStyles = createUseStyles((theme) => ({
  confirm: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "2vh",
    fontFamily: theme.font.display,
    fontSize: theme.font.size.md,
    color: theme.color.secondary.dark,
    "& p": { margin: 0, textAlign: "center" },
    "& > div": { display: "flex", gap: "2vw" },
  },
  actions: {
    position: "absolute",
    zIndex: 4,
    display: "flex",
    top: 5,
    left: 5,
    flexDirection: "row",
    "& > div": {
      marginRight: 5,
      [theme.breakpoints.smartphone]: {
        marginRight: 10,
      },
    },
  },
}));

const Actionbar = (props) => {
  const classes = useStyles();
  const { muted } = useAudioSettings();
  const fullscreenAvailable = useFullscreenAvailable();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // a match against the AI waits while its menu is open
  const pausedByMenu = useRef(false);

  const hasMatch = typeof props.game !== "undefined";
  useEffect(() => {
    if (!hasMatch) {
      setMenuOpen(false);
      pausedByMenu.current = false;
    }
  }, [hasMatch]);

  // the demos show no controls; the lesson keeps the menu
  if (props.tutorial && !props.tutorialInteractive) {
    return null;
  }

  const toggleMusic = () => {
    Jukebox.mute(muted);
    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
  };

  const toggleFullscreen = () => {
    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
    enterFullscreen();
  };

  const { MatchPhase } = engine;
  const pausable = () =>
    !props.matchOnline &&
    !props.tutorial &&
    typeof matchSession.host !== "undefined" &&
    props.game.phase !== MatchPhase.FIELD_CHOICE &&
    props.game.phase !== MatchPhase.ENDED;

  const openMenu = () => {
    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
    if (pausable() && !props.paused) {
      matchSession.host.pause();
      pausedByMenu.current = true;
    }
    setMenuOpen(true);
  };

  const closeMenu = () => {
    setMenuOpen(false);
    if (pausedByMenu.current) {
      pausedByMenu.current = false;
      if (matchSession.host) {
        matchSession.host.resume();
      }
    }
  };

  // the settings cover the menu; the match stays paused and the menu comes back after them
  const openSettings = () => {
    setMenuOpen(false);
    props.showSettings(() => setMenuOpen(true));
  };

  // leaving a running online match gives it up: ask first. The tutorial has its own way out.
  const leave = props.tutorial
    ? undefined
    : () => {
        setMenuOpen(false);
        if (props.matchOnline && props.game.phase !== MatchPhase.ENDED) {
          setConfirmLeave(true);
        } else {
          pausedByMenu.current = false;
          props.endGame();
        }
      };

  const buttons = [];

  if (hasMatch) {
    // in a match one button opens the menu with all the rest; the boards switch through the
    // preview of the other board (Scene)
    buttons.push(
      <Fab key="menu" color="secondary" icon="settings" onClick={openMenu}></Fab>
    );
  } else {
    // sound and fullscreen are in the settings; the profile needs the server
    buttons.push(
      <Fab
        key="settings"
        color="secondary"
        icon="settings"
        onClick={() => props.showSettings()}
      ></Fab>
    );
    buttons.push(
      <Fab
        key="user"
        color="secondary"
        icon="user"
        offline={!props.online}
        onOfflineClick={props.showOfflineMessage}
        onClick={() => props.showSignInOrUp()}
      ></Fab>
    );
  }
  return (
    <>
      <div className={classes.actions}> {buttons} </div>
      <GameMenu
        open={menuOpen && hasMatch}
        close={closeMenu}
        paused={Boolean(props.paused)}
        online={Boolean(props.matchOnline)}
        soundOn={!muted}
        toggleSound={toggleMusic}
        fullscreen={fullscreenAvailable}
        toggleFullscreen={toggleFullscreen}
        openSettings={openSettings}
        leave={leave}
      />
      <Dialog
        open={confirmLeave}
        close={() => setConfirmLeave(false)}
        mode="info"
        title={t(tr.SURRENDER)}
      >
        <div className={classes.confirm} data-testid="confirm-leave">
          <p>{t(tr.MATCH_LEAVE_ONLINE)}</p>
          <div>
            <Button
              size="small"
              color="accent"
              onClick={() => {
                setConfirmLeave(false);
                props.endGame();
              }}
            >
              {t(tr.SURRENDER)}
            </Button>
            <Button size="small" onClick={() => setConfirmLeave(false)}>
              {t(tr.ONLINE_CANCEL)}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
};

Actionbar.propTypes = {
  showSettings: PropTypes.func.isRequired,
  showSignInOrUp: PropTypes.func.isRequired,
};

const mapStateToProps = (state) => ({
  game: selectActiveGame(state),
  paused: state.match.paused,
  matchOnline: state.match.online,
  // the server answers (connectivity)
  online: state.ui.online,
  players: state.players,
  language: state.ui.language,
  tutorial: state.ui.tutorial,
  tutorialInteractive: state.ui.tutorialInteractive,
});

const mapDispatchToProps = { showOfflineMessage };

const ActionbarContainer = connect(mapStateToProps, mapDispatchToProps)(Actionbar);
export default ActionbarContainer;
