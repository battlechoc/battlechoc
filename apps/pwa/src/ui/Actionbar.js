import React, { Component } from 'react';
import './Actionbar.css';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { finishTurn, finishBuildPhase } from '../gameplay/GameActions';
import { GameStateTypes } from '../gameplay/GameplayReducer';
import Fab from '@material-ui/core/Fab';
import { VolumeUp, VolumeOff, Fullscreen, PlayArrow, FastForward } from '@material-ui/icons';

class Actionbar extends Component {
    constructor(props) {
        super(props);

        const searchParams = new URLSearchParams(window.location.search);
        const isPwa = searchParams.get('app_runs_as') === 'pwa';

        this.state = { 
            activeMusicButton: false,
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
        this.setState({ activeMusicButton: !this.state.activeMusicButton });
        this.props.toggleMusic();
    }

    fullscreenchange = () => {
        const searchParams = new URLSearchParams(window.location.search);
        const isPwa = searchParams.get('app_runs_as') === 'pwa';

        this.setState({
            activeFullscreenButton: document.fullscreenElement == null && !isPwa
        });
    }

    toggleFullscreen() {
        document.documentElement.requestFullscreen().then(() => {
            window.screen.orientation.lock('landscape').catch(error => console.log(error));
        });
    }

    render() {
        let buttons = [];

        if (this.state.activeMusicButton) {
            buttons.push(
                <Fab 
                    size="small" 
                    key="0" 
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
                    key="0" 
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
                    key="1"
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
                if (this.props.game.state  === GameStateTypes.BUILD_PHASE) {
                    buttons.push([
                        <Fab 
                            size="small" 
                            key="2"
                            color="primary"
                            aria-label="skip build phase" 
                            className="icon"
                            onClick={() => this.props.finishBuildPhase()}>
                            <PlayArrow />
                        </Fab>,
                        <Fab 
                            size="small" 
                            key="3"
                            color="primary"
                            aria-label="finish turn" 
                            className="icon" 
                            onClick={() => this.props.finishTurn()}>
                            <FastForward />
                        </Fab>
                    ]);
                } else if (this.props.game.state  === GameStateTypes.ATTACK_PHASE) {
                    buttons.push(
                        <Fab 
                            size="small" 
                            key="3"
                            color="primary"
                            aria-label="finish turn" 
                            className="icon" 
                            onClick={() => this.props.finishTurn()}>
                            <FastForward />
                        </Fab>
                    );              
                }
            } 
        }

        return <div className="actionbar"> { buttons } </div>;
    }
}

Actionbar.propTypes = {
    toggleMusic: PropTypes.func.isRequired
}

const mapStateToProps = state => ({
  game: state.gameplay.game,
});

const mapDispatchToProps = {
  finishBuildPhase,
  finishTurn
};

const ActionbarContainer = connect(
  mapStateToProps,
  mapDispatchToProps
)(Actionbar);
export default ActionbarContainer;