import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import {
  build,
  attack,
  chooseStart,
  chooseField,
  finishTurn,
  finishBuildPhase,
} from "../../gameplay/GameActions";
import {
  GameStateTypes,
  playerHasAttacksPerTurn,
  BattlechocError,
} from "@battlechoc/battlechoc-shared-functions";
import { deselectBuildings, deselectAttack } from "../UiActions";
import { multiplayer } from "../../Multiplayer";
import Fab from "./Fab";
import { Jukebox } from "../misc";
import OfflineStore from "../../OfflineStore";
import logger from "../../helper/logger";
import { createUseStyles } from "react-jss";

const useStyles = createUseStyles((theme) => ({
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
      const isAndroidApp = typeof window.Android !== "undefined";
      setActiveFullscreenButton(
        !isFullscreen && !isiOS && !isPWA && !isAndroidApp && !isElectronApp
      );
    };

    document.addEventListener("fullscreenchange", fullscreenchange, false);
    fullscreenchange();

    return () => {
      document.removeEventListener("fullscreenchange", fullscreenchange, false);
    };
  }, []);

  if (props.tutorial) {
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

  if (typeof props.game !== "undefined") {
    buttons.push(
      <Fab
        key="0"
        color="secondary"
        icon="back"
        onClick={() => props.endGame()}
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

  if (typeof props.game !== "undefined") {
    if (multiplayer.isLocalPlayer(props.game.currentPlayerIndex)) {
      if (props.game.state === GameStateTypes.BUILD_PHASE) {
        if (
          playerHasAttacksPerTurn(
            props.game.players[multiplayer.localPlayerIndex]
          )
        ) {
          buttons.push([
            <Fab
              key="6"
              color="accent"
              icon="forward-accent"
              onClick={() => {
                Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                props
                  .finishBuildPhase({
                    issuer: props.game.players[multiplayer.localPlayerIndex].id,
                  })
                  .then(() => {
                    props.deselectBuildings();
                    props.deselectAttack();
                  })
                  .catch((error) => {
                    if (error instanceof BattlechocError) {
                      console.warn(error);
                    } else {
                      throw error;
                    }
                  });
              }}
            ></Fab>,
          ]);
        } else {
          buttons.push([
            <Fab
              key="7"
              color="accent"
              icon="fast-forward"
              onClick={() => {
                Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                props
                  .finishTurn({
                    issuer: props.game.players[multiplayer.localPlayerIndex].id,
                  })
                  .then(() => {
                    props.deselectBuildings();
                    props.deselectAttack();
                  })
                  .catch((error) => {
                    if (error instanceof BattlechocError) {
                      console.warn(error);
                    } else {
                      throw error;
                    }
                  });
              }}
            ></Fab>,
          ]);
        }
      } else if (props.game.state === GameStateTypes.ATTACK_PHASE) {
        buttons.push(
          <Fab
            key="8"
            color="accent"
            icon="fast-forward"
            onClick={() => {
              Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
              props
                .finishTurn({
                  issuer: props.game.players[multiplayer.localPlayerIndex].id,
                })
                .then(() => {
                  props.deselectBuildings();
                  props.deselectAttack();
                })
                .catch((error) => {
                  if (error instanceof BattlechocError) {
                    console.warn(error);
                  } else {
                    throw error;
                  }
                });
            }}
          ></Fab>
        );
      }
    }
  }
  return <div className={classes.actions}> {buttons} </div>;
};

Actionbar.propTypes = {
  showSettings: PropTypes.func.isRequired,
  showSignInOrUp: PropTypes.func.isRequired,
};

const mapStateToProps = (state) => ({
  game: state.gameplay.game,
  players: state.players,
  language: state.ui.language,
  tutorial: state.ui.tutorial,
});

const mapDispatchToProps = {
  finishBuildPhase,
  finishTurn,
  deselectBuildings,
  deselectAttack,
  build,
  attack,
  chooseStart,
  chooseField,
};

const ActionbarContainer = connect(
  mapStateToProps,
  mapDispatchToProps
)(Actionbar);
export default ActionbarContainer;
