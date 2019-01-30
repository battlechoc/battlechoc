import React, { Component } from 'react';
import './Hud.css';
import PropTypes from 'prop-types';
import { BuildingType } from '../Building.js';
import { SweastyActionTypes } from '../gameplay/SweastyGameActions';
import * as GameEntities from '../gameplay/SweastyGameEntities';
import * as THREE from 'three';

class Hud extends Component {
    constructor(props) {
        super(props);
        this.state = {
            screen: 'START_SCREEN',
            messageAnimation: false
        };
    }

    componentDidMount() {
        const width = this.hud.clientWidth;
        const height = this.hud.clientHeight;

        this.gameStartCanvas = document.getElementById('textAnimationCanvas');
        this.gameStartCanvas.width = width;
        this.gameStartCanvas.height = height;
        this.gameStartBitmap = this.gameStartCanvas.getContext('2d');

        this.camera = new THREE.OrthographicCamera(
            -width/2, width/2,
            height/2, -height/2,
            0, 30
        );
        this.scene = new THREE.Scene();   
        this.texture = new THREE.Texture(this.gameStartCanvas)
        this.texture.needsUpdate = true;
        var material = new THREE.MeshBasicMaterial( {map: this.texture } );
        material.transparent = true;

        var plane = new THREE.Mesh( new THREE.PlaneGeometry( width, height ), material );
        this.scene.add( plane );

        this.renderer = new THREE.WebGLRenderer({antialias: false});
        this.renderer.setSize( width, height );
        this.renderer.autoClear = false;
        this.renderer.render(this.scene, this.camera);

        this.hud.appendChild(this.gameStartCanvas);   
    }

    showTurnMessage(message) {
        this.message = message;
        this.setState({
            messageAnimation: true
        });

        this.fontAlpha = 1.0;
        this.fontSize = 40; 
        this.renderText();

        setTimeout(() => {
            this.renderAnimation();
        }, 1000);
    }

    startGame() {
        this.setState({
            screen: 'CHOOSE_START_OR_FIELD'
        });
        this.showTurnMessage('It\'s up on you');

        setTimeout(() => {
            this.props.prepareGameCallback();
        }, 1000);
    }

    renderAnimation = () => {
        this.gameStartBitmap.clearRect(0, 0, this.hud.clientWidth, this.hud.clientHeight);
        
        if (this.state.messageAnimation) {
            this.animateMessage();
        }
    }

    renderText = () => {
        this.gameStartBitmap.font = "Normal " + Math.round(this.fontSize) + "px Arial";
        this.gameStartBitmap.fillStyle = "rgba(245,245,245," + this.fontAlpha + ")";
        this.gameStartBitmap.textAlign = 'center';
        this.gameStartBitmap.fillText(this.message, this.hud.clientWidth / 2, this.hud.clientHeight / 2);
        this.texture.needsUpdate = true;
        this.renderer.render(this.scene, this.camera);
    }

    choose(option) {
        if (option === 'START') {
            this.setState({
                screen: 'GAME_RUNNING'
            });
            this.props.startGameCallback(SweastyActionTypes.choose_start);
        } else if (option === 'LEFT_GAMEFIELD') {
            this.setState({
                screen: 'GAME_RUNNING'
            });
            this.props.startGameCallback(SweastyActionTypes.choose_field, 0);
        } else if (option === 'RIGHT_GAMEFIELD') {
            this.setState({
                screen: 'GAME_RUNNING'
            });
            this.props.startGameCallback(SweastyActionTypes.choose_field, 1);
        }
    }

    animateMessage() {
        if (this.fontSize < 250) {
            this.fontAlpha -= 0.01;
            this.fontSize += 2;
            this.renderText();
            requestAnimationFrame(this.renderAnimation);
        } else {
            this.setState({
                messageAnimation: false
            });
        }   
    }

    getClassName(field) {
        if (field.type === GameEntities.BoardCellTypes.white) {
            return 'white';
        } else if (field.type === GameEntities.BoardCellTypes.brown) {
            return 'brown';
        } else {
            return 'black';
        }
    }

    render() {
        return (
            <div id="hud" className={this.state.screen !== 'GAME_RUNNING' ? 'fullscreen' : ''} ref={hud => {this.hud = hud}}>
                <div id="toggleMusic" 
                    className={this.state.screen === 'START_SCREEN' ? "overlay" : ""}
                    onClick={() => this.props.toggleMusic()}>toggle music</div>
                <canvas id="textAnimationCanvas" className={this.state.messageAnimation ? 'ontop' : 'below'}></canvas>
                {(() => {
                    if (this.state.screen === 'START_SCREEN') {
                        return (
                            <div id="mainMenu">
                                <div onClick={() => this.startGame()}>New Game</div>
                                <div>Settings</div>
                            </div>
                        );
                    } else if (this.state.screen === 'GAME_RUNNING') {
                        return (
                            <div id="gameMenu">
                                <p>Cacao: {this.props.cacao}<br />Buildings: {this.props.buildings}</p>
                                <img alt="cacao tree preview" id="cacaotreeIcon" className="preview" src="images/cacaotree_icon.png" onClick={() => {
                                    this.props.selectBuilding(BuildingType.CACAOTREE);
                                }} />
                                <img alt="cannon preview" id="cannonIcon" className="preview" src="images/cannon_icon.png" onClick={() => {
                                    this.props.selectBuilding(BuildingType.RUM_TRUFFLE_CANNON);
                                }} />
                            </div>
                        );
                    } else if (this.state.screen === 'CHOOSE_START_OR_FIELD') {
                        return (
                            <div className="choose">
                                <div className="button start" onClick={() => this.choose('START')}><p>Choose First Turn</p></div>
                                <div className="gamefield">
                                    <div className="button left" onClick={() => this.choose('LEFT_GAMEFIELD')}><p>Choose this field</p>
                                        <div className="fields">
                                        {(() => {
                                            if (typeof this.props.playerFieldPreview !== 'undefined') {
                                                return this.props.playerFieldPreview.map(
                                                    (preview, i) => {
                                                        return <div key={i} className={this.getClassName(preview)}></div>
                                                    }
                                                );
                                            }
                                        })()}                                    
                                        </div>
                                    </div>
                                    <div className="button right" onClick={() => this.choose('RIGHT_GAMEFIELD')}><p>Choose this field</p>
                                        <div className="fields">
                                        {(() => {
                                            if (typeof this.props.opponentFieldPreview !== 'undefined') {
                                                return this.props.opponentFieldPreview.map(
                                                    (preview, i) => <div key={i} className={this.getClassName(preview)}></div>
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
    selectBuilding: PropTypes.func.isRequired,
    toggleMusic: PropTypes.func.isRequired,
    startGameCallback: PropTypes.func.isRequired,
    playerFieldPreview: PropTypes.array,
    opponentFieldPreview: PropTypes.array,
    cacao: PropTypes.number,
    buildings: PropTypes.number
}

export default Hud;