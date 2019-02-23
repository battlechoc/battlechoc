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
        this.state = { 
            activeMusicButton: false,
            activeFullscreenButton: document.fullscreenElement == null
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
        this.setState({
            activeFullscreenButton: document.fullscreenElement == null
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
                <Fab size="small" key="0" aria-label="volume up" className="icon">
                    <VolumeUp onClick={() => this.toggleMusic()}/>
                </Fab>
            );
        } else {
            buttons.push(
                <Fab size="small" key="0" aria-label="volume off" className="icon">
                    <VolumeOff onClick={() => this.toggleMusic()}/>
                </Fab>
            );            
        }

        //if (window.matchMedia('(display-mode: standalone)').matches) {  
        
        //} 

        if (this.state.activeFullscreenButton) {
            buttons.push(
                <Fab size="small" key="1" aria-label="toggle fullscreen" className="icon">
                    <Fullscreen onClick={this.toggleFullscreen} />
                </Fab>
            );
        }

        if (typeof this.props.game !== 'undefined') {
            if (this.props.game.currentPlayerIndex === 0) {
                if (this.props.game.state  === GameStateTypes.BUILD_PHASE) {
                    buttons.push([
                        <Fab size="small" key="2" aria-label="skip build phase" className="icon">
                            <PlayArrow onClick={() => this.props.finishBuildPhase()}/>
                        </Fab>,
                        <Fab size="small" key="3" aria-label="finish turn" className="icon">
                            <FastForward onClick={() => this.props.finishTurn()}/>
                        </Fab>
                    ]);
                } else if (this.props.game.state  === GameStateTypes.ATTACK_PHASE) {
                    buttons.push(
                        <Fab size="small" key="3" aria-label="finish turn" className="icon">
                            <FastForward onClick={() => this.props.finishTurn()}/>
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