import React, { Component } from 'react';
import PropTypes from 'prop-types';
import MicroGamefield from './MicroGamefield';
import ChatLikeInstructions from './ChatLikeInstructions';
import { EntityType, getEntityDescriptor } from '../gameplay/GameEntities';
import DialogTitle from '@material-ui/core/DialogTitle';
import Dialog from '@material-ui/core/Dialog';
import Typography from '@material-ui/core/Typography';

class TreesAndCannonsPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            selectedBuilding: EntityType.CACAOTREE,
            cacao: 20
        };
    }

    buildCallback(building) {
    	if (building === EntityType.CACAOTREE) {
    		if ((this.state.cacao - 20) < 20) {
    			this.setState({ 
    				cacao: this.state.cacao - 20,
    				selectedBuilding: undefined 
    			});
    		} else {
    			this.setState({ cacao: this.state.cacao - 20 });
    		}
    	}
        //setTimeout(() => this.props.fulfilled(), 1000);
    }

    select(building) {
    	if (this.canBuild(building)) {
    		this.setState({ selectedBuilding: building });
    	}
    }

    canBuild(building) {
    	return this.state.cacao >= getEntityDescriptor(building).costs;
    }

    render() {
    	console.log(this.canBuild(EntityType.CACAOTREE));
    	console.log(this.canBuild(EntityType.RUM_TRUFFLE_CANNON));

        let gamefield = <div className="microGame">
	                <div className="microGamefield">
	                    <MicroGamefield opponentGamefield={true} size={3} selectedBuilding={this.state.selectedBuilding} buildCallback={building => this.buildCallback(building)}/>
	                </div>

	                <div className="tutorial" id="buildingSelection">
	                    <div onClick={() => this.select(EntityType.CACAOTREE)} className={this.state.selectedBuilding === EntityType.CACAOTREE ? 'selected previewContainer' : 'previewContainer'}>
	                        <div className={this.canBuild(EntityType.CACAOTREE) ? '' : 'disabled'}></div>
	                        <img alt="cacao tree preview" className="preview" src="images/cacaotree_icon.png"/>
	                    </div>
	                    <div onClick={() => this.select(EntityType.RUM_TRUFFLE_CANNON)} className={this.state.selectedBuilding === EntityType.RUM_TRUFFLE_CANNON ? 'selected previewContainer' : 'previewContainer'}>
	                        <div className={this.canBuild(EntityType.RUM_TRUFFLE_CANNON) ? '' : 'disabled'}></div>
	                        <img alt="cannon preview" className="preview" src="images/cannon_icon.png"/>
	                    </div>	                    
	                </div>

	                <div className="tutorial" id="gameMenu">
	                    <div className="infoIcon">
	                        <img alt="cacao" src="images/cacao_icon.png" />
	                        <p>{this.state.cacao}</p>
	                    </div>
	                </div>

					<Dialog onClose={this.handleClose} aria-labelledby="explain-turns-dialog">
        				<DialogTitle id="simple-dialog-title">Game phases and turns</DialogTitle>
        				<Typography>battlechoc is a turn-based strategy game. A turn consists of two game phases: Build and attack</Typography>
        				<Typography>use this button to finish your build phase and this one to end your turn.</Typography>
        			</Dialog>
                </div>;
    	let messages = [
    		{ text: 'The most important buildings are the cacao tree and the rum truffle cannon', type: 'text', delay: 500 },
    		{ src: 'cannon_icon.png', type: 'image', delay: 500, alt: 'cannon message icon' },
    		{ src: 'cacaotree_icon.png', type: 'image', delay: 2500, alt: 'cacao tree message icon' },
    		{ text: 'You win a game if you destroy the factory and all cannons of your opponent', type: 'text', delay: 2500 },
    		{ text: 'Plant a tree to get cacao. You need it to build a cannon', type: 'text', delay: 2500 },
    		{ text: 'Build a cannon and attack your opponent\'s facotry to continue with the tutorial', type: 'text', delay: 2500 },
    		{ text: 'Hint: If you build a cacao tree on a white field it grows better produces 1.5x more cacao per round', type: 'text', delay: 3500 },
    		{ element: gamefield, type: 'challenge' }
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