import React, { Component } from 'react';
import PropTypes from 'prop-types';
import MicroGamefield from './MicroGamefield';
import ChatLikeInstructions from './ChatLikeInstructions';
import { EntityType, getEntityDescriptor, BoardCellTypes, AttackType } from '../gameplay/GameEntities';
import Jukebox from '../ui/Jukebox';
import BuildingPalette from '../ui/BuildingPalette';
import AttackPalette from '../ui/AttackPalette';
import InfoPanel from '../ui/InfoPanel';
import { createPlayer, PlayerType } from '../gameplay/Player';
import { GameStateTypes } from '../gameplay/GameplayReducer';

class TreesAndCannonsPage extends Component {
    constructor(props) {
        super(props);

        let playerfield = { grid: [] };
        playerfield.grid.push(this.createField(0, 0, BoardCellTypes.WHITE));
        playerfield.grid.push(this.createField(0, 1));
        playerfield.grid.push(this.createField(0, 2, BoardCellTypes.BLACK));
        playerfield.grid.push(this.createField(1, 0));
        playerfield.grid.push(this.createField(1, 1, BoardCellTypes.BLACK, [EntityType.CREAM, EntityType.FACTORY]));
        playerfield.grid.push(this.createField(1, 2));
        playerfield.grid.push(this.createField(2, 0));
        playerfield.grid.push(this.createField(2, 1, BoardCellTypes.WHITE));
        playerfield.grid.push(this.createField(2, 2, BoardCellTypes.WHITE, [EntityType.CREAM, EntityType.SPYING_EASTER_BUNNY]));

        let opponentfield = { grid: [] };
        opponentfield.grid.push(this.createField(0, 0, BoardCellTypes.BLACK));
        opponentfield.grid.push(this.createField(0, 1, BoardCellTypes.WHITE, [EntityType.CREAM, EntityType.FACTORY]));
        opponentfield.grid.push(this.createField(0, 2, BoardCellTypes.WHITE));
        opponentfield.grid.push(this.createField(1, 0));
        opponentfield.grid.push(this.createField(1, 1, BoardCellTypes.BLACK, [EntityType.CREAM, EntityType.SPYING_EASTER_BUNNY]));
        opponentfield.grid.push(this.createField(1, 2));
        opponentfield.grid.push(this.createField(2, 0));
        opponentfield.grid.push(this.createField(2, 1, BoardCellTypes.BLACK));
        opponentfield.grid.push(this.createField(2, 2));

        let player = createPlayer("Charlie Bucket", PlayerType.HUMAN);
        player.fieldIndex = 0;
        player.buildingsPerTurn = 3;
        player.buildings = 3;
        player.cacao = 50;
        player.attacks[AttackType.BUNNY] = 1;
        player.attacksPerTurn[AttackType.BUNNY] = 1;

        this.state = {
            messages: [
                { text: 'The opponent\'s gamefield is filled with cream. Would you like to bring some light into the darkness?', type: 'text', delay: 2500 },
                { text: 'Use the spying easter bunny to uncover  all the cream on your oppoent\'s gamefield', type: 'text', delay: 3000 },
                { text: 'The bunny is going to uncover the area around the selected field', type: 'text', delay: 3000 }
            ]
        };

        this.game = {
            gameplay: {
                game:{
                    currentPlayerIndex: 0,
                    state: GameStateTypes.ATTACK_PHASE,
                    players: [player],
                    board: { fields: [playerfield, opponentfield], size: 3, seed: 1337 }
                }
            },
            ui: {
                selectedBuilding: EntityType.XMAS_FACTORY,
                selectedAttack: AttackType.BUNNY
            }
        }
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

    buildCallback(building, celltype) {
        let description = getEntityDescriptor(building)
        if (building === EntityType.XMAS_FACTORY) {
            this.setState({ 
                messages: [...this.state.messages, 
                           { text: 'Now it\'s your opponent\'s turn. This animation:', type: 'text', delay: 1000},
                           { src: '../animations/loading.gif', type: 'image', delay: 500, alt: 'opponent turn animation' },
                           { text: 'indicates that your opponent is thinking', type: 'text', delay: 1000}]
            });
            this.game.gameplay.game.players[0].cacao -= description.costs;
            this.game.ui.selectedBuilding =undefined;
            this.game.gameplay.game.currentPlayerIndex = 1;
            this.forceUpdate();

            this.simulateOpponentTurn = setTimeout(() => {
                this.gamefield.microGamefield.receiveBallista({row: 1, col: 1});
                this.gamefield.opponentGamefield.meltDownEasterBunny();
                this.game.gameplay.game.currentPlayerIndex = 0;
                this.game.gameplay.game.players[0].attacks[AttackType.HOT_CHOCOLATE] = 1;
                this.game.gameplay.game.players[0].attacksPerTurn[AttackType.HOT_CHOCOLATE] = 1;
                this.game.gameplay.game.state = GameStateTypes.ATTACK_PHASE;
                this.game.ui.selectedAttack = AttackType.HOT_CHOCOLATE;
                this.forceUpdate();
            }, 4000);
        }
    }

    attackCallback(attackType, position) {
        let attackedField = this.game.gameplay.game.board.fields[1].grid[position.row * 3 + position.col]

        if (attackType === AttackType.HOT_CHOCOLATE) {
            this.game.gameplay.game.board.fields[1].grid[position.row * 3 + position.col].molten = true;
            this.gamefield.meltDownField()
        }
        if (attackedField.occupiedBy.includes(EntityType.FACTORY) && attackType === AttackType.HOT_CHOCOLATE) {
            setTimeout(() => this.props.fulfilled(), 1000);
        } else if (this.state.messages.length === 3 && attackType === AttackType.BUNNY) {
            this.setState({
                messages: [...this.state.messages, 
                           { text: 'Oh no! Your opponent also has a spying easter bunny ...', type: 'text', delay: 2500}]
            });
            this.gotoBuildPhase();
        }
    }

    gotoBuildPhase() {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        this.gamefield.triggerFlyingTreeInfo();
        this.game.gameplay.game.state = GameStateTypes.BUILD_PHASE;
        this.game.gameplay.game.players[0].buildings = this.game.gameplay.game.players[0].buildingsPerTurn;
        this.game.gameplay.game.players[0].attacks[AttackType.BUNNY] = this.game.gameplay.game.players[0].attacksPerTurn[AttackType.BUNNY];
        this.game.gameplay.game.players[0].attacks[AttackType.HOT_CHOCOLATE] = this.game.gameplay.game.players[0].attacksPerTurn[AttackType.HOT_CHOCOLATE];

        if (this.state.messages.length === 4) {
            this.setState({ 
                messages: [...this.state.messages, 
                { text: 'Take this cacao to build a xmas factory. It will protect you from spying attacks', type: 'text', delay: 2500},
                { text: 'If the bunny is going to spy an area that also conatins a xmas factory..', type: 'text', delay: 2500},
                { text: 'It gets melted down and you get a hot chocolate ballista', type: 'text', delay: 2500}]
            });
            this.game.gameplay.game.players[0].cacao = 100;
            this.simulateBuildingSelection(EntityType.XMAS_FACTORY);
        }   
        this.forceUpdate();
    }

    simulateBuildingSelection = buildingType => {
        this.game.ui.selectedBuilding = buildingType;
        this.forceUpdate();
    }

    simulateAttackSelection = attackType => {
        this.game.ui.selectedAttack = attackType;
        this.forceUpdate();
    }

    render() {
        let loadingAnimation = this.game.gameplay.game.currentPlayerIndex === 1 ? <div className="tutorial"><img className="loadingAnimation" src="animations/loading.gif" alt="loading" /></div> : null;
        return (
            <div>
                { loadingAnimation }
                <div className="microGame">
                    <div className="microGamefield">
                        <MicroGamefield opponentGamefield={true} size={3} 
                                        selectedBuilding={this.game.ui.selectedBuilding} 
                                        selectedAttack={this.game.ui.selectedAttack} 
                                        playerSetup={this.game.gameplay.game.board.fields[0]}
                                        opponentSetup={this.game.gameplay.game.board.fields[1]}
                                        pseudoPhase={this.game.gameplay.game.state}
                                        attackCallback={(attackType, position) => this.attackCallback(attackType, position)}
                                        onRef={gamefield => this.gamefield = gamefield}
                                        buildCallback={(building, celltype) => this.buildCallback(building, celltype)}/>
                        <BuildingPalette simulateBuildingSelection={this.simulateBuildingSelection} pseudoGame={this.game} isVisible={this.game.gameplay.game.state === GameStateTypes.BUILD_PHASE} whitelist={[EntityType.XMAS_FACTORY]}/>
                        <AttackPalette simulateAttackSelection={this.simulateAttackSelection} pseudoGame={this.game} isVisible={this.game.gameplay.game.state === GameStateTypes.ATTACK_PHASE} whitelist={[AttackType.BUNNY, AttackType.HOT_CHOCOLATE]}/>
                        <InfoPanel pseudoGame={this.game.gameplay.game} isVisible={true} onRef={info => this.info = info}/>                        
                    </div>
                </div>
                <ChatLikeInstructions messages={this.state.messages} appbar={this.props.appbar}/>
            </div>
        );
    }
}

TreesAndCannonsPage.propTypes = {
    fulfilled: PropTypes.func.isRequired,
    appbar: PropTypes.object.isRequired
}

export default TreesAndCannonsPage