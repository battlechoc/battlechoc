import React, { Component } from 'react';
import './Actionbar.css';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { build, attack, chooseStart, chooseField, finishTurn, finishBuildPhase, playerJoined } from '../../gameplay/GameActions';
import { BattlechocError } from '../../gameplay/Errors';
import { playerHasAttacks, playerHasAttacksPerTurn } from '../../gameplay/Player';
import { getCheapest } from '../../gameplay/GameEntities';
import { deselectBuildings, deselectAttack } from '../UiActions';
import { GameStateTypes } from '../../gameplay/GameplayReducer';
import { multiplayer } from '../../Multiplayer';
import Fab from '@material-ui/core/Fab';
import { VolumeUp, VolumeOff, Fullscreen, PlayArrow, FastForward, Settings, PermIdentity } from '@material-ui/icons';
import { Jukebox } from '../misc';

class Actionbar extends Component {
    constructor(props) {
        super(props);
        let userAgent = navigator.userAgent || navigator.vendor || window.opera;
        let isiOS = /^(iPhone|iPad|iPod)/.test(navigator.platform);
        let isPWA = window.matchMedia('(display-mode: fullscreen)').matches && /iPad|iPhone|iPod|Android/.test(userAgent);
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
        let userAgent = navigator.userAgent || navigator.vendor || window.opera;
        let isFullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
        let isiOS = /^(iPhone|iPad|iPod)/.test(navigator.platform);
        let isPWA = window.matchMedia('(display-mode: fullscreen)').matches && /iPad|iPhone|iPod|Android/.test(userAgent);
        this.setState({
            activeFullscreenButton: !isFullscreen && !isiOS && !isPWA
        });
    }

    toggleFullscreen() {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        document.documentElement.requestFullscreen().then(() => {
            window.screen.orientation.lock('landscape').catch(error => console.log('Unable to lock orientation to landscape'));
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

        if (typeof this.props.game === 'undefined') {
            buttons.push(
                <Fab
                    size="small"
                    key="1"
                    color="primary"
                    aria-label="signinorup"
                    className="icon"
                    onClick={() => this.props.showSignInOrUp()}>
                    <PermIdentity />
                </Fab>
            );
        }

        if (this.state.activeMusicButton) {
            buttons.push(
                <Fab
                    size="small"
                    key="2"
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
                    key="2"
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
                    key="3"
                    color="primary"
                    aria-label="toggle fullscreen"
                    className="icon"
                    onClick={this.toggleFullscreen}>
                    <Fullscreen />
                </Fab>
            );
        }

        if (typeof this.props.game !== 'undefined') {
            if (multiplayer.isLocalPlayer(this.props.game.currentPlayerIndex)) {
                if (this.props.game.state === GameStateTypes.BUILD_PHASE) {
                    if (playerHasAttacksPerTurn(this.props.game.players[multiplayer.localPlayerIndex])) {
                        if ((this.props.game.players[multiplayer.localPlayerIndex].buildings > 0 && this.props.game.players[multiplayer.localPlayerIndex].cacao >= getCheapest().costs())) {
                            buttons.push([
                                <Fab
                                    size="small"
                                    key="5"
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
                        if ((this.props.game.players[multiplayer.localPlayerIndex].buildings > 0 && this.props.game.players[multiplayer.localPlayerIndex].cacao >= getCheapest().costs())) {
                            buttons.push([
                                <Fab
                                    size="small"
                                    key="6"
                                    color="primary"
                                    aria-label="finish turn"
                                    className={(this.props.game.players[multiplayer.localPlayerIndex].buildings === 0 || this.props.game.players[multiplayer.localPlayerIndex].cacao < getCheapest().costs()) ? "icon blinking" : "icon"}
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
                                key="7"
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
    playerJoined,
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