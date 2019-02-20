import React, { Component } from 'react';
import './Tooltip.css';
import { connect } from 'react-redux';
import { GameStateTypes } from '../gameplay/GameplayReducer';

class Tooltip extends Component {
    constructor(props) {
        super(props);
        this.state = {
            expanded: true
        }
    }

    getContent() {
        let gameState = this.props.game.state;
        let currentPlayer = this.props.game.currentPlayerIndex;

        if (gameState === GameStateTypes.CHOOSE_FIELD_OR_START) {
            var title = 'Initial Turn';
            if (currentPlayer === 0) {
                var message = 'In the first round you can choose a playing field or the first move';
            }
        } else if (gameState === GameStateTypes.CHOOSE_FIELD) {
            title = 'Initial Turn';
            message = this.props.game.players[currentPlayer].name + ' can now select a game field';
        } else if (gameState === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT || 
                   gameState === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT) {
            title = 'Initial Placement';
            if (currentPlayer === 0) {
                message = 'Now you can build the factory once. Set the factory carefully: ' +
                          'If it is destroyed, you cannot build any other buildings';
            } 
        } else if (gameState === GameStateTypes.BUILD_PHASE) {
            title = 'Build Phase';
            if (currentPlayer === 0) {
                message = 'Choose a building from the list below and build it on any of the free fields. ' + 
                          'The cream is displayed translucent. A building built in cream will be invisible to the enemy';
            }
        } else if (gameState === GameStateTypes.ATTACK_PHASE) {
            title = 'Attack Phase';
            if (currentPlayer === 0) {
                message = 'Click on an enemy building to destroy it. Hint: Smart enemies hide buildings within cream';
            }
        }

        return { title, message }
    }

    render() {
        if (typeof this.props.game !== 'undefined') {
            let { title, message } = this.getContent()
            if (typeof title !== 'undefined') {
                return(
                    <div id="tooltip">
                        <h3 className={typeof message !== 'undefined' ? 'extendable' : ''} onClick={() => 
                            this.setState({ expanded: !this.state.expanded })
                        }>
                            { title }
                        </h3>
                        <p className={this.state.expanded && typeof message !== 'undefined' ? '' : 'invisible'}>{ message }</p>
                    </div>
                );
            } else {
                return null;
            }
        } else {
            return null;
        }
    }
}

const mapStateToProps = state => ({
  game: state.gameplay.game
});

const TooltipContainer = connect(
  mapStateToProps
)(Tooltip);

export default TooltipContainer;