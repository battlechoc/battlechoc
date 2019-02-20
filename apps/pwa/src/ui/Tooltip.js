import React, { Component } from 'react';
import './Tooltip.css';
import { connect } from 'react-redux';
import { GameTransitions, getGameTransition } from '../gameplay/GameTransitions';

class Tooltip extends Component {
	constructor(props) {
		super(props);
		this.state = {
			expanded: true
		}
	}

	componentWillReceiveProps(nextProps) {
        let gameTransition = getGameTransition(this.props.game, nextProps.game);

        if (gameTransition === GameTransitions.PLAYER_BEGINS_GAME) {
            this.setState({
                title: 'Initial Turn',
                message: 'In the first round you can choose a playing field or the first move'
            });
        } else if (gameTransition === GameTransitions.OPPONENT_BEGINS_GAME) {
            this.setState({
                title: 'Initial Turn',
                message: ''
            });
        } else if (gameTransition === GameTransitions.OPPONENT_HAS_CHOSEN_START) {
            this.setState({
                title: 'Initial Turn',
                message: this.props.game.players[0].name + ' can now select a game field'
            });
        } else if (gameTransition === GameTransitions.PLAYER_HAS_CHOSEN_START) {
            this.setState({
                title: 'Initial Turn',
                message: this.props.game.players[1].name + ' can now select a game field'
            });        	
        } else if (gameTransition === GameTransitions.PLAYER_INITAL_PLACEMENT) {
            this.setState({
                title: 'Initial Placement',
                message: 'Now you can build the factory once. Set the factory carefully: If it is destroyed, you cannot build any other buildings'
            });
        } else if (gameTransition === GameTransitions.OPPONENT_INITAL_PLACEMENT ||
            gameTransition === GameTransitions.PLAYER_FINISHED_INITIAL_PLACEMENT) {
            if (this.props.game.players[1].hasFactory) {
                this.setState({
                    title: 'Build Phase',
                    message: ''
                }); 
            } else {
                this.setState({
                    title: 'Initial Placement',
                    message: ''
                });
            }
        } else if (gameTransition === GameTransitions.PLAYER_BUILD_PHASE ||
            gameTransition === GameTransitions.OPPONENT_FINISHED_INITIAL_PLACEMENT) {
            this.setState({
                title: 'Build Phase',
                message: 'Choose a building from the list below and build it on any of the free fields. The cream is displayed translucent. A building built in cream will be invisible to the enemy'
            });
        } else if (gameTransition === GameTransitions.PLAYER_ATTACK_PHASE) {
            this.setState({
                title: 'Attack Phase',
                message: 'Click on an enemy building to destroy it. Hint: Smart enemies hide buildings within cream'
            });
        } else if (gameTransition === GameTransitions.OPPONENT_BUILD_PHASE) {
            this.setState({
                title: 'Build Phase',
                message: ''
            });           
        } else if (gameTransition === GameTransitions.OPPONENT_ATTACK_PHASE) {
            this.setState({
                title: 'Attack Phase',
                message: ''
            });             
        }
    }

	toggle() {
    	if (typeof this.state.message !== 'undefined') {
        	this.setState({ expanded: !this.state.expanded });
    	}
    }

	render() {
		if (typeof this.state.title !== 'undefined') {
			return(
				<div id="tooltip">
		        	<h3 className={typeof this.state.message !== 'undefined' ? 'extendable' : ''} onClick={() => this.toggle()}>
		        		{ this.state.title }
		        	</h3>
		        	<p className={this.state.expanded && this.state.message !== '' ? '' : 'invisible'}>{ this.state.message }</p>
	      		</div>
	      	);
	    } else {
	    	return <div></div>;
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