import React, { Component } from 'react';
import PropTypes from 'prop-types';
import MicroGamefield from './MicroGamefield';
import ChatLikeInstructions from './ChatLikeInstructions';
import { EntityType } from '../gameplay/GameEntities';

class TreesAndCannonsPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            selectedBuilding: EntityType.CACAOTREE
        };
    }

    buildCallback() {
        this.setState({ selectedBuilding: undefined });
        setTimeout(() => this.props.fulfilled(), 1000);
    }

    render() {
        let gamefield = <div className="microGame">
	                <div className="microGamefield">
	                    <MicroGamefield size={3} selectedBuilding={this.state.selectedBuilding} buildCallback={() => this.buildCallback()}/>
	                </div>

	                <div className="tutorial" id="buildingSelection">
	                    <div className={this.state.selectedBuilding === EntityType.CACAOTREE ? 'selected previewContainer' : 'previewContainer'}>
	                        <img alt="cacao tree preview" className="preview" src="images/cacaotree_icon.png"/>
	                    </div>
	                    <div className={this.state.selectedBuilding === EntityType.RUM_TRUFFLE_CANNON ? 'selected previewContainer' : 'previewContainer'}>
	                        <img alt="cannon preview" className="preview" src="images/cannon_icon.png"/>
	                    </div>	                    
	                </div>
                </div>;
    	let messages = [
    		{ text: 'The most important buildings are the cacao tree and the rum truffle cannon', type: 'text', delay: 2500 },
    		{ text: 'You win a game if you destroy the factory and all cannons of your opponent', type: 'text', delay: 2500 },
    		{ text: 'Plant a tree to get cacao. You need it to build a cannon', type: 'text', delay: 2500 },
    		{ text: 'Build a cannon and attack your opponent\'s facotry to continue with the tutorial', type: 'text', delay: 2500 },
    		{ text: 'Hint: If you build a cacao tree on a white field it grows better produces 1.5x more cacao per round', type: 'text', delay: 3500 },
    		{ element: gamefield, type: 'challenge', delay: 3500 },
    		{ text: 'Use these icons to select the building you want to build', type: 'text', delay: 3500 },
    	]
        return (
            <ChatLikeInstructions messages={messages}/>
        );
    }
}

TreesAndCannonsPage.propTypes = {
    fulfilled: PropTypes.func.isRequired
}

export default TreesAndCannonsPage