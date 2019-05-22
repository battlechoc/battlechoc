import React, { Component } from 'react';
import PropTypes from 'prop-types';
import MicroGamefield from './MicroGamefield';
import ChatLikeInstructions from './ChatLikeInstructions';
import { EntityType } from '../gameplay/GameEntities';
import BuildingPalette from '../ui/BuildingPalette';
import FactoryTutorialSituation from '../situations/tutorial/FactoryTutorial';

class ChoosePage extends Component {
    constructor(props) {
        super(props);
        this.game = FactoryTutorialSituation.game;
    }

    buildCallback() {
        this.game.ui.selectedBuilding = undefined;
        this.forceUpdate();
        setTimeout(() => this.props.fulfilled(), 1000);
    }

    render() {
        let gamefield = <div className="microGame">
                    <div className="microGamefield">
                        <MicroGamefield onRef={gamefield => this.gamefield = gamefield} 
                                        opponentGamefield={false} 
                                        size={3}
                                        playerSetup={this.game.gameplay.game.board.fields[0]}
                                        selectedBuilding={this.game.ui.selectedBuilding} 
                                        pseudoPhase={this.game.gameplay.game.state}
                                        buildCallback={() => this.buildCallback()}/>
                    </div>
                    <BuildingPalette pseudoGame={this.game} isVisible={true} whitelist={[EntityType.FACTORY]}/>
                </div>;
        let messages = [
            { text: 'To build e.g. cacao trees or cannons, you need to build a chocolate factory', type: 'text', delay: 1000 },
            { src: 'factory', type: 'image', delay: 2500, alt: 'factory message icon' },
            { text: 'The factory allows you to build 2 buildings per turn', type: 'text', delay: 2500 },
            { text: 'Hint: If you build a factory on a black field it can work better and manages 3 buildings per round', type: 'text', delay: 3500 },
            { text: 'Build the factory by clicking on a field of your choice to continue with the tutorial', type: 'text'},
        ]
        return (
            <div>
                { gamefield }
                <ChatLikeInstructions messages={messages} appbar={this.props.appbar}/>
            </div>
        );
    }
}

ChoosePage.propTypes = {
    fulfilled: PropTypes.func.isRequired,
    appbar: PropTypes.object.isRequired
}

export default ChoosePage