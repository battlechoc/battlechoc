import React, { Component } from 'react';
import PropTypes from 'prop-types';
import MicroGamefield from './MicroGamefield';
import ChatLikeInstructions from './ChatLikeInstructions';

class ChoosePage extends Component {
    render() {
    	let gamefield = <div>
	                <div className="microGamefield">
	                    <MicroGamefield size={3} />
	                </div>

	                <div id="buildingSelection">
	                    <div className="selected previewContainer">
	                        <img alt="factory preview" className="enabled preview" src="images/factory_icon.png"/>
	                    </div>
	                </div>
                </div>;
    	let messages = [
    		{ text: 'To build e.g. cacao trees or cannons, you need to build a chocolate factory', type: 'text', delay: 2500 },
    		{ text: 'The factory allows you to build 2 buildings per turn', type: 'text', delay: 2500 },
    		{ text: 'Hint: If you build a factory on a black field it can work better and manages 3 buildings per round', type: 'text', delay: 3500 },
    		{ text: 'Build the factory by clicking on a field of your choice to continue with the tutorial', type: 'text', delay: 3500 },
    		{ element: gamefield, type: 'challenge'}
    	]
        return (
            <ChatLikeInstructions messages={messages}/>
        );
    }
}

ChoosePage.propTypes = {
    fulfilled: PropTypes.func.isRequired
}

export default ChoosePage