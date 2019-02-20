import React, { Component } from 'react';
import './Actionbar.css';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { finishTurn, finishBuildPhase } from '../gameplay/GameActions';
import { GameStateTypes } from '../gameplay/GameplayReducer';

class Actionbar extends Component {
    render() {
    	let buttons = [
    		<div key="0" className="menuButton" onClick={() => this.props.toggleMusic()}>toggle music</div>
    	];

        if (typeof this.props.game !== 'undefined') {
            if (this.props.game.currentPlayerIndex === 0) {
            	if (this.props.game.state  === GameStateTypes.BUILD_PHASE) {
					buttons.push([
		                <div key="1" onClick={() => this.props.finishBuildPhase()} className="menuButton">Finish build phase</div>,
		                <div key="2" onClick={() => this.props.finishTurn()} className="menuButton">Finish turn</div>
		            ]);
		        } else if (this.props.game.state  === GameStateTypes.ATTACK_PHASE) {
		            buttons.push(
		                <div key="2" onClick={() => this.props.finishTurn()} className="menuButton">Finish turn</div>
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