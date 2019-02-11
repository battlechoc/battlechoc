import React, { Component } from 'react';
import './Hud.css';
import PropTypes from 'prop-types';
import { BuildingType } from '../Building.js';
import { connect } from 'react-redux';
import { startGame, chooseField, chooseStart, createBoard } from '../gameplay/GameActions';
import { showMessage, hideMessage, viewSelectScreen, viewIngameScreen, selectBuilding } from './UiActions';
import { createPlayer, PlayerType } from '../gameplay/Player';

class Hud extends Component {
    componentDidMount() {
        const width = this.hud.clientWidth;
        const height = this.hud.clientHeight;

        this.gameStartCanvas = document.getElementById('textAnimationCanvas');
        this.gameStartCanvas.width = width;
        this.gameStartCanvas.height = height;
        this.gameStartBitmap = this.gameStartCanvas.getContext('2d'); 
    }

    componentWillReceiveProps(nextProps) {
        if (typeof this.props.game === 'undefined' &&
            typeof nextProps.game !== 'undefined') {
            if (nextProps.game.coinToss === 0) {
                this.showTurnMessage('It\'s up on you');
            } else {
                this.showTurnMessage('Your opponent decides');
            }
        }
    }

    showTurnMessage(message) {
        this.props.showMessage(message);
        
        this.fontAlpha = 1.0;
        this.fontSize = 40; 
        this.renderText(message);

        setTimeout(() => { this.renderAnimation(); }, 1000);
    }

    fireGameStart() {
        this.props.viewSelectScreen();
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

    renderText = text => {
        this.gameStartBitmap.font = "Normal " + Math.round(this.fontSize) + "px Arial";
        this.gameStartBitmap.fillStyle = "rgba(245,245,245," + this.fontAlpha + ")";
        this.gameStartBitmap.textAlign = 'center';
        this.gameStartBitmap.fillText(text, this.hud.clientWidth / 2, this.hud.clientHeight / 2);
    }

    choose(option) {
        this.props.viewIngameScreen();

        if (option === 'START') {
            this.props.chooseStart();
            this.props.startGameCallback(option);
        } else if (option === 'LEFT_GAMEFIELD') {
            this.props.chooseField(0);
            this.props.startGameCallback(option);
        } else if (option === 'RIGHT_GAMEFIELD') {
            this.props.chooseField(1);
            this.props.startGameCallback(option);
        }
    }

    animateMessage() {
        if (this.fontSize < 250) {
            this.fontAlpha -= 0.01;
            this.fontSize += 2;
            this.renderText(this.props.message);
            requestAnimationFrame(this.renderAnimation);
        } else {
            this.props.hideMessage();
        }   
    }

    render() {
        return (
            <div id="hud" className={this.props.screen !== 'GAME_RUNNING' ? 'fullscreen' : ''} ref={hud => {this.hud = hud}}>
                <div id="toggleMusic" 
                    className={this.props.screen === 'START_SCREEN' ? "overlay" : ""}
                    onClick={() => this.props.toggleMusic()}>toggle music</div>
                <canvas id="textAnimationCanvas" className={this.props.messageAnimation ? 'ontop' : 'below'}></canvas>
                {(() => {
                    if (this.props.screen === 'START_SCREEN') {
                        return (
                            <div id="mainMenu">
                                <div onClick={() => this.fireGameStart()}>New Game</div>
                                <div>Settings</div>
                            </div>
                        );
                    } else if (this.props.screen === 'GAME_RUNNING') {
                        return (
                            <div id="gameMenu">
                                <p>Cacao: {this.props.game.players[0].cacao}<br />Buildings: {this.props.game.players[0].buildingsPerTurn}</p>
                                <img alt="cacao tree preview" id="cacaotreeIcon" className="preview" src="images/cacaotree_icon.png" onClick={() => {
                                    this.props.selectBuilding(BuildingType.CACAOTREE);
                                }} />
                                <img alt="cannon preview" id="cannonIcon" className="preview" src="images/cannon_icon.png" onClick={() => {
                                    this.props.selectBuilding(BuildingType.RUM_TRUFFLE_CANNON);
                                }} />
                            </div>
                        );
                    } else if (this.props.screen === 'CHOOSE_START_OR_FIELD') {
                        return (
                            <div className="choose">
                                <div className="button start" onClick={() => this.choose('START')}><p>Choose First Turn</p></div>
                                <div className="gamefield">
                                    <div className="button left" onClick={() => this.choose('LEFT_GAMEFIELD')}><p>Choose this field</p>
                                        <div className="fields">
                                        {(() => {
                                            if (typeof this.props.game.board !== 'undefined') {
                                                return this.props.game.board[0].grid.map(
                                                    (preview, i) => {
                                                        return <div key={i} className={preview.previewStyle}></div>
                                                    }
                                                );
                                            }
                                        })()}                                    
                                        </div>
                                    </div>
                                    <div className="button right" onClick={() => this.choose('RIGHT_GAMEFIELD')}><p>Choose this field</p>
                                        <div className="fields">
                                        {(() => {
                                            if (typeof this.props.game.board !== 'undefined') {
                                                return this.props.game.board[1].grid.map(
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
  screen: state.ui.screen,
  messageAnimation: state.ui.messageAnimation,
  message: state.ui.message
});

const mapDispatchToProps = {
  startGame,
  chooseField,
  chooseStart,
  createBoard,
  showMessage,
  hideMessage,
  viewSelectScreen, 
  viewIngameScreen,
  selectBuilding
};

const HudContainer = connect(
  mapStateToProps,
  mapDispatchToProps
)(Hud);

export default HudContainer;