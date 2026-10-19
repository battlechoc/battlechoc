import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import {
  engine,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import { toggleBoardView } from "../UiActions";
import { selectActiveGame } from "../../match/matchSlice";
import { matchSession } from "../../match/LocalMatchHost";
import Fab from "./Fab";
import Button from "./Button";
import Dialog from "../dialogs/Dialog";
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

  // the demos show no controls; the lesson keeps the view and sound buttons
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

  const buttons = [];

  if (typeof props.game !== "undefined" && !props.tutorial) {
    buttons.push(
      <Fab
        key="0"
        color="secondary"
        icon="back"
        onClick={() => {
          // leaving a running online match gives it up: ask first
          if (props.online && props.game.phase !== engine.MatchPhase.ENDED) {
            setConfirmLeave(true);
          } else {
            props.endGame();
          }
        }}
      ></Fab>
    );
  }

  buttons.push(
    <Fab
      key="1"
      color="secondary"
      icon="settings"
      onClick={() => props.showSettings()}
    ></Fab>
  );

  if (typeof props.game === "undefined") {
    buttons.push(
      <Fab
        key="2"
        color="secondary"
        icon="user"
        onClick={() => props.showSignInOrUp()}
      ></Fab>
    );
  }

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

  // real-time match: pause and switch between the own and the opponent's board
  if (
    typeof props.game !== "undefined" &&
    typeof props.game.phase !== "undefined" &&
    props.game.phase !== engine.MatchPhase.FIELD_CHOICE
  ) {
    buttons.push(
      <Fab
        key="realtime-view"
        color="secondary"
        icon="swap-view"
        onClick={() => {
          Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
          props.toggleBoardView();
        }}
      ></Fab>
    );
    // online matches cannot be paused, the lesson has no deadlines to pause
    if (!props.online && !props.tutorial) buttons.push(
      <Fab
        key="realtime-pause"
        color="secondary"
        icon={props.paused ? "play" : "pause"}
        onClick={() => {
          Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
          if (matchSession.host) {
            if (props.paused) {
              matchSession.host.resume();
            } else {
              matchSession.host.pause();
            }
          }
        }}
      ></Fab>
    );
  }
  return (
    <>
      <div className={classes.actions}> {buttons} </div>
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

const mapDispatchToProps = {
  toggleBoardView,
};

const ActionbarContainer = connect(
  mapStateToProps,
  mapDispatchToProps
)(Actionbar);
export default ActionbarContainer;
