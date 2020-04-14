import React, { useState, useEffect } from 'react';
import './Actionbar.css';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { build, attack, chooseStart, chooseField, finishTurn, finishBuildPhase } from '../../gameplay/GameActions';
import { GameStateTypes, playerHasAttacksPerTurn, BattlechocError } from 'battlechoc-shared-functions';
import { deselectBuildings, deselectAttack } from '../UiActions';
import { multiplayer } from '../../Multiplayer';
import Fab from '@material-ui/core/Fab';
import { VolumeUp, VolumeOff, Fullscreen, PlayArrow, FastForward, Settings, PermIdentity, KeyboardArrowLeft as ArrowBackIcon } from '@material-ui/icons';
import { Jukebox } from '../misc';
import OfflineStore from '../../OfflineStore';
import logger from '../../helper/logger';

const Actionbar = props => {
    const [activeMusicButton, setActiveMusicButton] = useState(!Jukebox.isMuted);
    const [activeFullscreenButton, setActiveFullscreenButton] = useState(true);

    useEffect(() => {
        const fetchAudioState = async () => {
            const audioSettings = await OfflineStore.settingsStore.get('audio');
            if (typeof audioSettings !== 'undefined') {
                setActiveMusicButton(!audioSettings.sfxMuted);
            }
        }
        fetchAudioState();

        const fullscreenchange = () => {
            const userAgent = navigator.userAgent || navigator.vendor || window.opera;
            const isiOS = /^(iPhone|iPad|iPod)/.test(navigator.platform);
            const isPWA = window.matchMedia('(display-mode: fullscreen)').matches && /iPad|iPhone|iPod|Android/.test(userAgent);
            const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
            const isAndroidApp = typeof window.Android !== 'undefined';
            setActiveFullscreenButton(!isFullscreen && !isiOS && !isPWA && !isAndroidApp);
        }

        document.addEventListener("fullscreenchange", fullscreenchange, false);
        fullscreenchange();

        return () => {
            document.removeEventListener("fullscreenchange", fullscreenchange, false);
        };
    }, [])

    const toggleMusic = () => {
        Jukebox.mute(!activeMusicButton);
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        setActiveMusicButton(!activeMusicButton);
    }

    const toggleFullscreen = () => {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        document.documentElement.requestFullscreen().catch(() => logger.info('fullscreen request failed'));
    }

    const buttons = []

    if (typeof props.game !== 'undefined' && !props.tutorial) {
        buttons.push(
            <Fab
                size="small"
                key="-1"
                color="primary"
                aria-label="back"
                className="icon"
                onClick={() => props.endGame()}>
                <ArrowBackIcon />
            </Fab>
        );
    }

    buttons.push(
        <Fab
            size="small"
            key="0"
            color="primary"
            aria-label="settings"
            className="icon"
            onClick={() => props.showSettings()}>
            <Settings />
        </Fab>
    );

    if (typeof props.game === 'undefined') {
        buttons.push(
            <Fab
                size="small"
                key="1"
                color="primary"
                aria-label="signinorup"
                className="icon"
                onClick={() => props.showSignInOrUp()}>
                <PermIdentity />
            </Fab>
        );
    }

    if (activeMusicButton) {
        buttons.push(
            <Fab
                size="small"
                key="2"
                color="primary"
                aria-label="volume up"
                className="icon"
                onClick={toggleMusic}>
                <VolumeUp />
            </Fab>
        );
    } else {
        buttons.push(
            <Fab
                size="small"
                key="2"
                color="primary"
                aria-label="volume off"
                className="icon"
                onClick={toggleMusic}>
                <VolumeOff />
            </Fab>
        );
    }

    if (activeFullscreenButton) {
        buttons.push(
            <Fab
                size="small"
                key="3"
                color="primary"
                aria-label="toggle fullscreen"
                className="icon"
                onClick={toggleFullscreen}>
                <Fullscreen />
            </Fab>
        );
    }

    if (typeof props.game !== 'undefined') {
        if (multiplayer.isLocalPlayer(props.game.currentPlayerIndex)) {
            if (props.game.state === GameStateTypes.BUILD_PHASE) {
                if (playerHasAttacksPerTurn(props.game.players[multiplayer.localPlayerIndex])) {
                    buttons.push([
                        <Fab
                            size="small"
                            key="5"
                            color="primary"
                            aria-label="skip build phase"
                            className="icon"
                            onClick={() => {
                                Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                props.finishBuildPhase({ issuer: props.game.players[multiplayer.localPlayerIndex].id }).then(() => {
                                    props.deselectBuildings();
                                    props.deselectAttack();
                                }).catch(error => {
                                    if (error instanceof BattlechocError) {
                                        console.warn(error);
                                    } else {
                                        throw error;
                                    }
                                });
                            }}>
                            <PlayArrow />
                        </Fab>
                    ]);
                } else {
                    buttons.push([
                        <Fab
                            size="small"
                            key="6"
                            color="primary"
                            aria-label="finish turn"
                            className="icon"
                            onClick={() => {
                                Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                props.finishTurn({ issuer: props.game.players[multiplayer.localPlayerIndex].id }).then(() => {
                                    props.deselectBuildings();
                                    props.deselectAttack();
                                }).catch(error => {
                                    if (error instanceof BattlechocError) {
                                        console.warn(error);
                                    } else {
                                        throw error;
                                    }
                                });
                            }}>
                            <FastForward />
                        </Fab>
                    ]);
                }
            } else if (props.game.state === GameStateTypes.ATTACK_PHASE) {
                buttons.push(
                    <Fab
                        size="small"
                        key="7"
                        color="primary"
                        aria-label="finish turn"
                        className="icon"
                        onClick={() => {
                            Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                            props.finishTurn({ issuer: props.game.players[multiplayer.localPlayerIndex].id }).then(() => {
                                props.deselectBuildings();
                                props.deselectAttack();
                            }).catch(error => {
                                if (error instanceof BattlechocError) {
                                    console.warn(error);
                                } else {
                                    throw error;
                                }
                            });
                        }}>
                        <FastForward />
                    </Fab>
                );
            }
        }
    }
    return <div className="actionbar"> {buttons} </div>;
}

Actionbar.propTypes = {
    showSettings: PropTypes.func.isRequired,
    showSignInOrUp: PropTypes.func.isRequired
}

const mapStateToProps = state => ({
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
    chooseField
};

const ActionbarContainer = connect(
    mapStateToProps,
    mapDispatchToProps
)(Actionbar);
export default ActionbarContainer;