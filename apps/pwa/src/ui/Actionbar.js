import React, { Component } from 'react';
import './Actionbar.css';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { build, attack, chooseStart, chooseField, finishTurn, finishBuildPhase, playerJoined } from '../gameplay/GameActions';
import { BattlechocError } from '../gameplay/Errors';
import { playerHasAttacks, playerHasAttacksPerTurn } from '../gameplay/Player';
import { getCheapest } from '../gameplay/GameEntities';
import { deselectBuildings, deselectAttack, joinedMultiplayer, waitForMultiplayer } from './UiActions';
import { GameStateTypes } from '../gameplay/GameplayReducer';
import { multiplayer } from '../Multiplayer';
import Fab from '@material-ui/core/Fab';
import t from './Translation';
import { VolumeUp, VolumeOff, Fullscreen, PlayArrow, FastForward, Settings, Share } from '@material-ui/icons';
import Jukebox from './Jukebox';

class Actionbar extends Component {
    constructor(props) {
        super(props);

        let isiOS = /^(iPhone|iPad|iPod)/.test(navigator.platform);
        let isPWA = window.matchMedia('(display-mode: fullscreen)').matches;
        let isFullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;

        this.state = {
            activeMusicButton: true,
            activeFullscreenButton: !isFullscreen && !isiOS && !isPWA
        }
    }

    componentDidMount() {
        document.addEventListener("fullscreenchange", this.fullscreenchange, false);
    }

    componentWillUnmount() {
        document.removeEventListener("fullscreenchange", this.fullscreenchange, false);
    }

    toggleMusic() {
        Jukebox.toggleMute();
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        this.setState({ activeMusicButton: !this.state.activeMusicButton });
    }

    fullscreenchange = () => {
        let isFullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
        this.setState({
            activeFullscreenButton: !isFullscreen
        });
    }

    toggleFullscreen() {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        document.documentElement.requestFullscreen().then(() => {
            window.screen.orientation.lock('landscape').catch(error => console.log(error));
        });
    }

    shareMultiplayerGame() {
        let whatsappWindowRef = undefined;
        if (typeof navigator.share === 'undefined') {
            whatsappWindowRef = window.open();
        }
        multiplayer.createGameSession(this.props.game, this.props.playerJoined, this.props.joinedMultiplayer, { build: this.props.build, attack: this.props.attack, finishTurn: this.props.finishTurn, finishBuildPhase: this.props.finishBuildPhase, chooseStart: this.props.chooseStart, chooseField: this.props.chooseField }).then((session) => {
            this.props.waitForMultiplayer();
            if (typeof session !== 'undefined') {
                console.dir(session);
                if (navigator.share) {
                    navigator.share({
                        title: window.document.title,
                        text: t[this.props.language].INVITATION,
                        url: session.url,
                    }).then(() => console.log('successfully shared'))
                        .catch((error) => console.log('error sharing multiplayer session', error));
                } else {
                    whatsappWindowRef.location = 'https://api.whatsapp.com/send?text=' + encodeURIComponent(t[this.props.language].INVITATION + ' - ' + session.url);
                }
            }
        }).catch((error) => {
            console.error('could not create a multiplayer game session.', error);
        });
    }

    render() {
        let buttons = [
            <Fab
                size="small"
                key="0"
                color="primary"
                aria-label="settings"
                className="icon"
                onClick={() => this.props.showSettings()}>
                <Settings />
            </Fab>
        ];

        if (this.state.activeMusicButton) {
            buttons.push(
                <Fab
                    size="small"
                    key="1"
                    color="primary"
                    aria-label="volume up"
                    className="icon"
                    onClick={() => this.toggleMusic()}>
                    <VolumeUp />
                </Fab>
            );
        } else {
            buttons.push(
                <Fab
                    size="small"
                    key="1"
                    color="primary"
                    aria-label="volume off"
                    className="icon"
                    onClick={() => this.toggleMusic()}>
                    <VolumeOff />
                </Fab>
            );
        }

        if (this.state.activeFullscreenButton) {
            buttons.push(
                <Fab
                    size="small"
                    key="2"
                    color="primary"
                    aria-label="toggle fullscreen"
                    className="icon"
                    onClick={this.toggleFullscreen}>
                    <Fullscreen />
                </Fab>
            );
        }

        if (typeof this.props.game !== 'undefined' && this.props.game.state === GameStateTypes.CHOOSE_FIELD_OR_START && typeof multiplayer.currentGameSession === 'undefined') {
            buttons.push(
                <Fab
                    size="small"
                    key="3"
                    color="primary"
                    aria-label="share game"
                    className="icon"
                    onClick={() => this.shareMultiplayerGame()}>
                    <Share />
                </Fab>
            );
        }

        if (typeof this.props.game !== 'undefined') {
            if (multiplayer.isLocalPlayer(this.props.game.currentPlayerIndex) === true) {
                if (this.props.game.state === GameStateTypes.BUILD_PHASE) {
                    if (playerHasAttacksPerTurn(this.props.game.players[multiplayer.localPlayerIndex]) === true) {
                        if ((this.props.game.players[multiplayer.localPlayerIndex].buildings > 0 && this.props.game.players[multiplayer.localPlayerIndex].cacao >= getCheapest().costs)) {
                            buttons.push([
                                <Fab
                                    size="small"
                                    key="4"
                                    color="primary"
                                    aria-label="skip build phase"
                                    className="icon"
                                    onClick={() => {
                                        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                        this.props.finishBuildPhase({ issuer: this.props.game.players[multiplayer.localPlayerIndex].id }).then(() => {
                                            this.props.deselectBuildings();
                                            this.props.deselectAttack();
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
                        }
                    } else {
                        if ((this.props.game.players[multiplayer.localPlayerIndex].buildings > 0 && this.props.game.players[multiplayer.localPlayerIndex].cacao >= getCheapest().costs)) {
                            buttons.push([
                                <Fab
                                    size="small"
                                    key="5"
                                    color="primary"
                                    aria-label="finish turn"
                                    className={(this.props.game.players[multiplayer.localPlayerIndex].buildings === 0 || this.props.game.players[multiplayer.localPlayerIndex].cacao < getCheapest().costs) ? "icon blinking" : "icon"}
                                    onClick={() => {
                                        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                        this.props.finishTurn({ issuer: this.props.game.players[multiplayer.localPlayerIndex].id }).then(() => {
                                            this.props.deselectBuildings();
                                            this.props.deselectAttack();
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
                    }
                } else if (this.props.game.state === GameStateTypes.ATTACK_PHASE) {
                    if (playerHasAttacks(this.props.game.players[multiplayer.localPlayerIndex]) === true || playerHasAttacksPerTurn(this.props.game.players[multiplayer.localPlayerIndex]) === false) {
                        buttons.push(
                            <Fab
                                size="small"
                                key="5"
                                color="primary"
                                aria-label="finish turn"
                                className={(playerHasAttacks(this.props.game.players[multiplayer.localPlayerIndex]) === true) ? "icon" : "icon blinking"}
                                onClick={() => {
                                    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                    this.props.finishTurn({ issuer: this.props.game.players[multiplayer.localPlayerIndex].id }).then(() => {
                                        this.props.deselectBuildings();
                                        this.props.deselectAttack();
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
        }
        return <div className="actionbar"> {buttons} </div>;
    }
}

Actionbar.propTypes = {
    showSettings: PropTypes.func.isRequired
}

const mapStateToProps = state => ({
    game: state.gameplay.game,
    players: state.players,
    language: state.ui.language
});

const mapDispatchToProps = {
    finishBuildPhase,
    finishTurn,
    deselectBuildings,
    playerJoined,
    deselectAttack,
    build,
    attack,
    chooseStart,
    chooseField,
    joinedMultiplayer,
    waitForMultiplayer
};

const ActionbarContainer = connect(
    mapStateToProps,
    mapDispatchToProps
)(Actionbar);
export default ActionbarContainer;