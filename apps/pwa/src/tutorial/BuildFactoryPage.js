import React, { Component } from 'react';
import PropTypes from 'prop-types';
import MicroGamefield from './MicroGamefield';
import ChatLikeInstructions from './ChatLikeInstructions';
import { EntityType, BoardCellTypes } from '../gameplay/GameEntities';
import BuildingPalette from '../ui/BuildingPalette';
import { createPlayer, PlayerType } from '../gameplay/Player';
import { GameStateTypes } from '../gameplay/GameplayReducer';

class ChoosePage extends Component {
    constructor(props) {
        super(props);
        let playerfield = { grid: [] };
        
        playerfield.grid.push(this.createField(0, 0, BoardCellTypes.WHITE));
        playerfield.grid.push(this.createField(0, 1));
        playerfield.grid.push(this.createField(0, 2, BoardCellTypes.BLACK));
        playerfield.grid.push(this.createField(1, 0));
        playerfield.grid.push(this.createField(1, 1, BoardCellTypes.BLACK));
        playerfield.grid.push(this.createField(1, 2));
        playerfield.grid.push(this.createField(2, 0));
        playerfield.grid.push(this.createField(2, 1, BoardCellTypes.WHITE));
        playerfield.grid.push(this.createField(2, 2, BoardCellTypes.WHITE));

        let player = createPlayer("Charlie Bucket", PlayerType.HUMAN);
        player.fieldIndex = 0;
        this.state = {
            game: {
                gameplay: {
                    game:{
                        state: GameStateTypes.PLAYER_1_INITIAL_PLACEMENT,
                        players: [player],
                        board: { fields: [playerfield], size: 3, seed: 1337 },
                    }
                },
                ui: {
                    selectedBuilding: EntityType.FACTORY
                }
            }
        };
    }

    buildCallback() {
        this.setState(state => (state.game.ui.selectedBuilding = undefined, state));
        setTimeout(() => this.props.fulfilled(), 1000);
    }

    createField(row, col, cellType = BoardCellTypes.BROWN, buildings = [EntityType.CREAM]) {
        return {
            type: cellType,
            row: row,
            col: col,
            occupiedBy: buildings,
            molten: false,
            shielded: false
        }
    }

    render() {
        let gamefield = <div className="microGame">
                    <div className="microGamefield">
                        <MicroGamefield onRef={gamefield => this.gamefield = gamefield} 
                                        opponentGamefield={false} 
                                        size={3}
                                        playerSetup={this.state.game.gameplay.game.board.fields[0]}
                                        selectedBuilding={this.state.game.ui.selectedBuilding} 
                                        pseudoPhase={this.state.game.gameplay.game.state}
                                        buildCallback={() => this.buildCallback()}/>
                    </div>
                    <BuildingPalette pseudoGame={this.state.game} isVisible={true} whitelist={[EntityType.FACTORY]}/>
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