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
import { Jukebox } from "../misc";
import OfflineStore from "../../OfflineStore";
import logger from "../../helper/logger";
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
  const [activeMusicButton, setActiveMusicButton] = useState(!Jukebox.isMuted);
  const [activeFullscreenButton, setActiveFullscreenButton] = useState(true);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // a match against the AI waits while its menu is open
  const pausedByMenu = useRef(false);

  useEffect(() => {
    const fetchAudioState = async () => {
      const audioSettings = await OfflineStore.settingsStore.get("audio");
      if (typeof audioSettings !== "undefined") {
        setActiveMusicButton(!audioSettings.sfxMuted);
      }
    };
    fetchAudioState();

    const fullscreenchange = () => {
      const userAgent = navigator.userAgent || navigator.vendor || window.opera;
      const isElectronApp =
        navigator.userAgent.toLowerCase().indexOf(" electron/") > -1;
      const isiOS = /^(iPhone|iPad|iPod)/.test(navigator.platform);
      const isPWA =
        window.matchMedia("(display-mode: fullscreen)").matches &&
        /iPad|iPhone|iPod|Android/.test(userAgent);
      const isFullscreen =
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement;
      setActiveFullscreenButton(
        !isFullscreen && !isiOS && !isPWA && !isElectronApp
      );
    };

    document.addEventListener("fullscreenchange", fullscreenchange, false);
    fullscreenchange();

    return () => {
      document.removeEventListener("fullscreenchange", fullscreenchange, false);
    };
  }, []);

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
    Jukebox.mute(!activeMusicButton);
    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
    setActiveMusicButton(!activeMusicButton);
  };

  const toggleFullscreen = () => {
    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
    document.documentElement
      .requestFullscreen()
      .catch(() => logger.info("fullscreen request failed"));
  };

  const { MatchPhase } = engine;
  const pausable = () =>
    !props.online &&
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
        if (props.online && props.game.phase !== MatchPhase.ENDED) {
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
    buttons.push(
      <Fab
        key="1"
        color="secondary"
        icon="settings"
        onClick={() => props.showSettings()}
      ></Fab>
    );
    buttons.push(
      <Fab
        key="2"
        color="secondary"
        icon="user"
        onClick={() => props.showSignInOrUp()}
      ></Fab>
    );
    if (activeMusicButton) {
      buttons.push(
        <Fab key="3" color="secondary" icon="volume" onClick={toggleMusic}></Fab>
      );
    } else {
      buttons.push(
        <Fab key="4" color="secondary" icon="mute" onClick={toggleMusic}></Fab>
      );
    }
    if (activeFullscreenButton) {
      buttons.push(
        <Fab
          key="5"
          color="secondary"
          icon="fullscreen"
          onClick={toggleFullscreen}
        ></Fab>
      );
    }
  }
  return (
    <>
      <div className={classes.actions}> {buttons} </div>
      <GameMenu
        open={menuOpen && hasMatch}
        close={closeMenu}
        paused={Boolean(props.paused)}
        online={Boolean(props.online)}
        soundOn={activeMusicButton}
        toggleSound={toggleMusic}
        fullscreen={activeFullscreenButton}
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
  online: state.match.online,
  players: state.players,
  language: state.ui.language,
  tutorial: state.ui.tutorial,
  tutorialInteractive: state.ui.tutorialInteractive,
});

const ActionbarContainer = connect(mapStateToProps)(Actionbar);
export default ActionbarContainer;
