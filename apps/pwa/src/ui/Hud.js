import React, { Component } from 'react';
import './Hud.css';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { chooseField, chooseStart } from '../gameplay/GameActions';
import { GameStateTypes } from '../gameplay/GameplayReducer';
import Tooltip from './Tooltip';
import Actionbar from './Actionbar';
import BuildingPalette from './BuildingPalette';
import Button from '@material-ui/core/Button';
import StartIcon from '@material-ui/icons/SupervisorAccount';

class Hud extends Component {
    constructor(props) {
        super(props);
        this.state = { 
            clickable: true,
            messageAnimation: false 
        }
    }

    componentDidMount() {
        this.props.onRef(this)

        this.gameStartCanvas = document.getElementById('textAnimationCanvas');
        this.gameStartCanvas.width = this.hud.clientWidth;
        this.gameStartCanvas.height = this.hud.clientHeight;
        this.gameStartBitmap = this.gameStartCanvas.getContext('2d');

        window.addEventListener("resize", () => this.updateDimensions());
    }

    updateDimensions() {
        this.gameStartCanvas.width = this.hud.clientWidth;
        this.gameStartCanvas.height = this.hud.clientHeight;
    }

    componentWillUnmount() {
        window.removeEventListener("resize", () => this.updateDimensions());
    }

    unlockUi() {
        this.setState({ clickable: true });
    }

    lockUi() {
        this.setState({ clickable: false });
    }

    showTurnMessage(message) {
        this.setState({ 
            message: message,
            messageAnimation: true 
        });
     
        this.fontAlpha = 1.0;
        this.fontSize = 40; 
        this.renderText(message);

        setTimeout(() => this.renderAnimation(), 1000);
    }

    renderAnimation = () => {
        this.gameStartBitmap.clearRect(0, 0, this.hud.clientWidth, this.hud.clientHeight);
        
        if (this.state.messageAnimation) {
            if (this.fontSize < 250) {
                this.fontAlpha -= 0.01;
                this.fontSize += 2;
                this.renderText(this.state.message);
                requestAnimationFrame(this.renderAnimation);
            } else {
                this.gameStartBitmap.clearRect(0, 0, this.hud.clientWidth, this.hud.clientHeight);
                this.setState({
                    message: undefined,
                    messageAnimation: false 
                });
            } 
        }
    }

    renderText = text => {
        this.gameStartBitmap.font = "Normal " + Math.round(this.fontSize) + "px Arial";
        this.gameStartBitmap.fillStyle = "rgba(245,245,245," + this.fontAlpha + ")";
        this.gameStartBitmap.shadowColor = "rgba(0,0,0,0.3)";
        this.gameStartBitmap.shadowOffsetX = 3;
        this.gameStartBitmap.shadowOffsetY = 3;
        this.gameStartBitmap.shadowBlur = 4;
        this.gameStartBitmap.textAlign = 'center';
        this.gameStartBitmap.fillText(text, this.hud.clientWidth / 2, this.hud.clientHeight / 2);
    }

    choose(option) {
        if (this.state.clickable) {
            if (option === 'START' && this.props.state === GameStateTypes.CHOOSE_FIELD_OR_START) {
                this.props.chooseStart();
            } else if (option === 'LEFT_GAMEFIELD') {
                this.props.chooseField(0);
            } else if (option === 'RIGHT_GAMEFIELD') {
                this.props.chooseField(1);
            }
        }
    }

    isInitalStage() {
        return this.props.state === GameStateTypes.START ||
               this.props.state === GameStateTypes.CHOOSE_FIELD_OR_START ||
               this.props.state === GameStateTypes.CHOOSE_FIELD;
    }

    isTitleScreen() {
        return typeof this.props.state === 'undefined';
    }

    estimateButtonClasses() {
        let classNames =  'button start'
        if (this.state.clickable && this.props.state === GameStateTypes.CHOOSE_FIELD_OR_START) {
            classNames += ' active'; 
        } else if (this.props.state === GameStateTypes.CHOOSE_FIELD) {
            if (this.props.game.currentPlayerIndex === 0) {
                classNames += ' selectedByOpponent';
            } else {
                classNames += ' selectedByPlayer';
            }
        }
        return classNames;
   } 

    render() {
        return (
            <div>
                <Tooltip />
                <Actionbar toggleMusic={ this.props.toggleMusic } />
                <BuildingPalette isVisible={!this.isInitalStage() && !this.isTitleScreen()} />

                <div id="hud" className={this.isInitalStage() || this.isTitleScreen() || this.state.messageAnimation ? 'fullscreen' : null} ref={hud => {this.hud = hud}}>
                    <canvas id="textAnimationCanvas" className={this.state.messageAnimation ? 'ontop' : null}></canvas>
                    {(() => {
                        if (this.isTitleScreen()) {
                            return (
                                <div id="mainMenu">
                                    <Button aria-label="new game" className="menuButton" variant="contained" onClick={() => this.props.prepareGameCallback()}>
                                        New Game
                                    </Button>
                                    <Button aria-label="settings" className="menuButton" variant="contained">
                                        Settings
                                    </Button>
                                </div>
                            );
                        } else if (!this.isInitalStage() && !this.isTitleScreen()) {
                            return (
                                <div id="gameMenu">
                                    <p>Cacao: {this.props.game.players[0].cacao}<br />
                                    Buildings: {this.props.game.players[0].buildings + '/' + this.props.game.players[0].buildingsPerTurn}<br />
                                    Attacks: {this.props.game.players[0].attacks + '/' + this.props.game.players[0].attacksPerTurn}</p>
                                </div>
                            );
                        } else if (this.isInitalStage()) {
                            return (
                                <div className="choose">

                                    <div className={(this.state.clickable ? 'active ' : null) + ' button left'} onClick={() => this.choose('LEFT_GAMEFIELD')}>
                                        <div className="fields">
                                        {(() => {
                                            if (typeof this.props.game.board !== 'undefined') {
                                                return this.props.game.board.fields[0].grid.map(
                                                    (preview, i) => {
                                                        return <div key={i} className={preview.previewStyle}></div>
                                                    }
                                                );
                                            }
                                        })()}                                    
                                        </div>
                                    </div>


                                    <div id="chooseStart" className={this.estimateButtonClasses()} onClick={() => this.choose('START')}>
                                        <div className="stackedIcon"><div className="firstIcon">#1</div><StartIcon fontSize="large"/></div>
                                    </div>

                                    <div className={(this.state.clickable ? 'active ' : null) + ' button right'} onClick={() => this.choose('RIGHT_GAMEFIELD')}>
                                        <div className="fields">
                                        {(() => {
                                            if (typeof this.props.game.board !== 'undefined') {
                                                return this.props.game.board.fields[1].grid.map(
                                                    (preview, i) => <div key={i} className={preview.previewStyle}></div>
                                                );
                                            }
                                        })()}                                    
                                        </div>
                                    </div>

                                </div>
                            );
                        }
                    })()}
                </div>
            </div>
        );
    }
}

Hud.propTypes = {
    toggleMusic: PropTypes.func.isRequired,
    prepareGameCallback: PropTypes.func.isRequired
}

const mapStateToProps = state => ({
  game: state.gameplay.game,
  state: typeof state.gameplay.game === 'undefined' ? undefined : state.gameplay.game.state
});

const mapDispatchToProps = {
  chooseField,
  chooseStart
};

const HudContainer = connect(
  mapStateToProps,
  mapDispatchToProps
)(Hud);

export default HudContainer;