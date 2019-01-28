import React, { Component } from 'react';
import './Hud.css';
import PropTypes from 'prop-types';
import { BuildingType } from '../Building.js';

class Hud extends Component {
    constructor(props) {
        super(props);
        this.state = {
            startScreen: true
        };
    }

    startGame() {
        this.setState({
            startScreen: false
        });
        this.props.startGameCallback();
    }

    render() {
        return (
            <div id="hud" className={this.state.startScreen ? "fullscreen" : ""}>
                <div id="toggleMusic" 
                    className={this.state.startScreen ? "overlay" : ""}
                    onClick={() => this.props.toggleMusic()}>toggle music</div>
                {(() => {
                    if (this.state.startScreen) {
                        return (
                            <div id="mainMenu">
                                <div onClick={() => this.startGame()}>New Game</div>
                                <div>Settings</div>
                            </div>
                        );
                    } else {
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
  cacao: PropTypes.number,
  buildings: PropTypes.number
}

export default Hud;