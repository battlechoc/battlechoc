import React, { Component } from 'react';
import './Actionbar.css';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { finishTurn, finishBuildPhase } from '../gameplay/GameActions';
import { BattlechocError } from '../gameplay/Errors';
import { playerHasAttacks, playerHasAttacksPerTurn } from '../gameplay/Player';
import { getCheapest } from '../gameplay/GameEntities';
import { deselectBuildings } from './UiActions';
import { GameStateTypes } from '../gameplay/GameplayReducer';
import Fab from '@material-ui/core/Fab';
import { VolumeUp, VolumeOff, Fullscreen, PlayArrow, FastForward, Settings } from '@material-ui/icons';
import Jukebox from './Jukebox';

class Actionbar extends Component {
    constructor(props) {
        super(props);

        const searchParams = new URLSearchParams(window.location.search);
        const isPwa = searchParams.get('app_runs_as') === 'pwa';

        this.state = {
            activeMusicButton: true,
            activeFullscreenButton: document.fullscreenElement == null && !isPwa
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
        const searchParams = new URLSearchParams(window.location.search);
        const isPwa = searchParams.get('app_runs_as') === 'pwa';

        this.setState({
            activeFullscreenButton: document.fullscreenElement == null && !isPwa
        });
    }

    toggleFullscreen() {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        document.documentElement.requestFullscreen().then(() => {
            window.screen.orientation.lock('landscape').catch(error => console.log(error));
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

        if (typeof this.props.game !== 'undefined') {
            if (this.props.game.currentPlayerIndex === 0) {
                if (this.props.game.state === GameStateTypes.BUILD_PHASE) {
                    if (playerHasAttacksPerTurn(this.props.game.players[0]) === true) {
                        buttons.push([
                            <Fab
                                size="small"
                                key="3"
                                color="primary"
                                aria-label="skip build phase"
                                className={(this.props.game.players[0].buildings > 0 && this.props.game.players[0].cacao >= getCheapest().costs) ? "icon" : "icon blinking"}
                                onClick={() => {
                                    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                    this.props.finishBuildPhase({ issuer: this.props.game.players[0].id }).then(() => {
                                        this.props.deselectBuildings();
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
                                key="4"
                                color="primary"
                                aria-label="finish turn"
                                className={(this.props.game.players[0].buildings === 0 || this.props.game.players[0].cacao < getCheapest().costs) ? "icon blinking" : "icon"}
                                onClick={() => {
                                    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                    this.props.finishTurn({ issuer: this.props.game.players[0].id }).then(() => {
                                        this.props.deselectBuildings();
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
                } else if (this.props.game.state === GameStateTypes.ATTACK_PHASE) {
                    if (playerHasAttacks(this.props.game.players[0]) === true || playerHasAttacksPerTurn(this.props.game.players[0]) === false) {
                        buttons.push(
                            <Fab
                                size="small"
                                key="4"
                                color="primary"
                                aria-label="finish turn"
                                className={(playerHasAttacks(this.props.game.players[0]) === true) ? "icon" : "icon blinking"}
                                onClick={() => {
                                    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                    this.props.finishTurn({ issuer: this.props.game.players[0].id }).then(() => {
                                        this.props.deselectBuildings();
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
    players: state.players
});

const mapDispatchToProps = {
    finishBuildPhase,
    finishTurn,
    deselectBuildings
};

const ActionbarContainer = connect(
    mapStateToProps,
    mapDispatchToProps
)(Actionbar);
export default ActionbarContainer;