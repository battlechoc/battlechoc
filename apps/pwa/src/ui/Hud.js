import React, { Component } from 'react';
import './Hud.css';
import PropTypes from 'prop-types';
import { BuildingType } from '../gameplay/GameEntities';
import { connect } from 'react-redux';
import { startGame, chooseField, chooseStart, createBoard, finishTurn, finishBuildPhase } from '../gameplay/GameActions';
import { selectBuilding, showMessage, hideMessage } from './UiActions';
import { createPlayer, PlayerType } from '../gameplay/Player';
import { GameStateTypes } from '../gameplay/GameplayReducer';
import { GameTransitions, getGameTransition } from '../gameplay/GameTransitions';

class Hud extends Component {
    componentDidMount() {
        const width = this.hud.clientWidth;
        const height = this.hud.clientHeight;

        this.gameStartCanvas = document.getElementById('textAnimationCanvas');
        this.gameStartCanvas.width = width;
        this.gameStartCanvas.height = height;
        this.gameStartBitmap = this.gameStartCanvas.getContext('2d'); 

        this.activeUi = true;
        // -1 no color, 0 player (blue), 1 opponent (red)
        this.colorStartButton = -1; 
    }

    componentWillReceiveProps(nextProps) {
        let gameTransition = getGameTransition(this.props.game, nextProps.game);

        if (gameTransition === GameTransitions.PLAYER_BEGINS_GAME) {
            this.showTurnMessage('It\'s up on you', true);
        } else if (gameTransition === GameTransitions.OPPONENT_BEGINS_GAME) {
            this.activeUi = false;
            this.showTurnMessage('Your opponent decides', true);
        } else if (gameTransition === GameTransitions.OPPONENT_HAS_CHOSEN_START) {
            this.activeUi = true;
            this.showTurnMessage(this.props.game.players[0].name + ' picks a field', false);
            this.colorStartButton = 1;
        } else if (gameTransition === GameTransitions.PLAYER_INITAL_PLACEMENT) {
            // TODO: Tooltip shows infos about placing the factory
        } else if (gameTransition === GameTransitions.OPPONENT_INITAL_PLACEMENT) {
            // TODO: Tooltip shows infos about opponent placing the factory
        } else if (gameTransition === GameTransitions.PLAYER_BUILD_PHASE ||
            gameTransition === GameTransitions.OPPONENT_FINISHED_INITIAL_PLACEMENT) {
            // TODO: Tooltip shows infos about the build phase
        } else if (gameTransition === GameTransitions.PLAYER_ATTACK_PHASE) {
            // TODO: Tooltip shows infos about attack
        }
    }

    showTurnMessage(message, animated) {
        this.props.showMessage(message);
     
        this.fontAlpha = 1.0;
        this.fontSize = 40; 
        this.renderText(message);

        if (animated) {
            setTimeout(() => { this.renderAnimation(); }, 1000);
        } else {
            setTimeout(() => { 
                this.gameStartBitmap.clearRect(0, 0, this.hud.clientWidth, this.hud.clientHeight);
                this.props.hideMessage();
            }, 1000);
        }
    }

    fireGameStart() {
        let player = [
            createPlayer("Charlie Bucket", PlayerType.HUMAN), 
            createPlayer("Augustus Gloop", PlayerType.AUGUSTUS_GLOOP)
        ];

        this.props.startGame(player);
        setTimeout(() => {
            this.props.createBoard({
              boardSize: {rows: 8, cols: 8},
              boardSeed: 42
            });
        }, 1000);
    }

    renderAnimation = () => {
        this.gameStartBitmap.clearRect(0, 0, this.hud.clientWidth, this.hud.clientHeight);
        
        if (this.props.messageAnimation) {
            this.animateMessage();
        }
    }

    animateMessage() {
        if (this.fontSize < 250) {
            this.fontAlpha -= 0.01;
            this.fontSize += 2;
            this.renderText(this.props.message);
            requestAnimationFrame(this.renderAnimation);
        } else {
            this.gameStartBitmap.clearRect(0, 0, this.hud.clientWidth, this.hud.clientHeight);
            this.props.hideMessage(); 
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
        if (this.activeUi) {
            if (option === 'START' && this.colorStartButton === -1) {
                this.props.chooseStart();
                this.colorStartButton = 0;
                this.showTurnMessage(this.props.game.players[1].name + ' picks a field', false);
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

    buildingSelectionIsVisible() {
        return (this.props.state === GameStateTypes.BUILD_PHASE ||
            this.props.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT ||
            this.props.state === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT) && 
            this.props.game.currentPlayerIndex === 0;
    }

    render() {
        let skipButtons = undefined;
        if (typeof this.props.game !== 'undefined') {
            if (this.props.game.currentPlayerIndex === 0) {
                if (this.props.state  === GameStateTypes.BUILD_PHASE) {
                    skipButtons = <div className="skipMenu">
                            <div onClick={() => this.props.finishBuildPhase()} className="menuButton">Finish build phase</div>
                            <div onClick={() => this.props.finishTurn()} className="menuButton">Finish turn</div>
                        </div>;
                } else if (this.props.state  === GameStateTypes.ATTACK_PHASE) {
                    skipButtons = <div className="skipMenu">
                            <div onClick={() => this.props.finishTurn()} className="menuButton">Finish Turn</div>
                        </div>;
                }
            }
        }

        return (
            <div id="hud" className={this.isInitalStage() || this.isTitleScreen() || this.props.messageAnimation ? 'fullscreen' : ''} ref={hud => {this.hud = hud}}>
                <div id="toggleMusic" 
                    className={this.isTitleScreen() ? "overlay menuButton" : "menuButton"}
                    onClick={() => this.props.toggleMusic()}>toggle music</div>
                <canvas id="textAnimationCanvas" className={this.props.messageAnimation ? 'ontop' : 'below'}></canvas>
                {(() => {
                    if (this.isTitleScreen()) {
                        return (
                            <div id="mainMenu">
                                <div onClick={() => this.fireGameStart()}>New Game</div>
                                <div>Settings</div>
                            </div>
                        );
                    } else if (!this.isInitalStage() && !this.isTitleScreen()) {
                        return (
                            <div id="gameMenu">
                                { skipButtons }
                                <p>Cacao: {this.props.game.players[0].cacao}<br />
                                Buildings: {this.props.game.players[0].buildings + '/' + this.props.game.players[0].buildingsPerTurn}<br />
                                Attacks: {this.props.game.players[0].attacks + '/' + this.props.game.players[0].attacksPerTurn}</p>
                                {(() => {
                                    if (this.buildingSelectionIsVisible()) {
                                        return (<div id="buildings">
                                                    <img alt="cacao tree preview" id="cacaotreeIcon" className="preview" src="images/cacaotree_icon.png" onClick={() => {
                                                        this.props.selectBuilding(BuildingType.CACAOTREE);
                                                    }} />
                                                    <img alt="cannon preview" id="cannonIcon" className="preview" src="images/cannon_icon.png" onClick={() => {
                                                        this.props.selectBuilding(BuildingType.RUM_TRUFFLE_CANNON);
                                                    }} />
                                                </div>);
                                    }
                                })()}
                            </div>
                        );
                    } else if (this.isInitalStage()) {
                        return (
                            <div className="choose">
                                <div className={(this.activeUi && this.colorStartButton === -1 ? 'active ' : '')
                                                + 'button start'
                                                + (this.colorStartButton === 0 ? ' selectedByPlayer' : '')
                                                + (this.colorStartButton === 1 ? ' selectedByOpponent' : '')} onClick={() => this.choose('START')}><p>Choose First Turn</p></div>
                                <div className="gamefield">
                                    <div className={(this.activeUi ? 'active ' : '') + 'button left'} onClick={() => this.choose('LEFT_GAMEFIELD')}><p>Choose this field</p>
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
                                    <div className={(this.activeUi ? 'active ' : '') + 'button right'} onClick={() => this.choose('RIGHT_GAMEFIELD')}><p>Choose this field</p>
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
                            </div>
                        );
                    }
                })()}
            </div>
        );
    }
}

Hud.propTypes = {
    toggleMusic: PropTypes.func.isRequired,
    startGameCallback: PropTypes.func.isRequired,
    triggerAugustusAction: PropTypes.func.isRequired
}

const mapStateToProps = state => ({
  game: state.gameplay.game,
  state: typeof state.gameplay.game === 'undefined' ? undefined : state.gameplay.game.state,
  message: state.ui.message,
  messageAnimation: state.ui.messageAnimation
});

const mapDispatchToProps = {
  startGame,
  chooseField,
  chooseStart,
  createBoard,
  selectBuilding,
  hideMessage,
  showMessage,
  finishBuildPhase,
  finishTurn
};

const HudContainer = connect(
  mapStateToProps,
  mapDispatchToProps
)(Hud);

export default HudContainer;