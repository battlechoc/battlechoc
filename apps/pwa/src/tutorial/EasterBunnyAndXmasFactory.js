import React, { Component } from 'react';
import PropTypes from 'prop-types';
import MicroGamefield from './MicroGamefield';
import ChatLikeInstructions from './ChatLikeInstructions';
import { EntityType, getEntityDescriptor, AttackType } from '../gameplay/GameEntities';
import Jukebox from '../ui/Jukebox';

class TreesAndCannonsPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            selectedBuilding: undefined,
            cacao: 0,
            spyAttacks: 1,
            spyAttacksPerTurn: 1,
            messages: [
                { text: 'The opponent\'s gamefield is filled with cream. Would you like to bring some light into the darkness?', type: 'text', delay: 2500 },
                { text: 'Use the spying easter bunny to uncover  all the cream on your oppoent\'s gamefield', type: 'text', delay: 3000 },
                { text: 'The bunny is going to uncover the area around the selected field', type: 'text', delay: 3000 }
            ],
            pseudoPhase: 'attack',
            ballistaAttacks: 0,
            ballistaAttacksPerTurn: 0,
            opponentTurn: false,
            selectedAttack: AttackType.BUNNY
        };
    }

    buildCallback(building, celltype) {
        let description = getEntityDescriptor(building)
        if (building === EntityType.XMAS_FACTORY) {
            this.setState({ 
                cacao: this.state.cacao - description.costs,
                selectedBuilding: undefined,
                opponentTurn: true,
                messages: [...this.state.messages, 
                           { text: 'Now it\'s your opponent\'s turn. This animation:', type: 'text', delay: 1000},
                           { src: '../animations/loading.gif', type: 'image', delay: 500, alt: 'opponent turn animation' },
                           { text: 'indicates that your opponent is thinking', type: 'text', delay: 1000}]
            });
            this.simulateOpponentTurn = setTimeout(() => {
                this.gamefield.microGamefield.receiveBallista({row: 1, col: 1});
                this.gamefield.opponentGamefield.meltDownEasterBunny();
                this.setState({
                    opponentTurn: false,
                    ballistaAttacksPerTurn: 1,
                    ballistaAttacks: 1,
                    pseudoPhase: 'attack',
                    selectedAttack: AttackType.HOT_CHOCOLATE
                });
            }, 4000);
        }
    }

    attackCallback(opponentBuildings) {
        let factoryDestroyed = true;
        let creamUncovered = true;

        for (let row = 0; row < opponentBuildings.length; row ++) {
            for (let col = 0; col < opponentBuildings[0].length; col ++) {
                if (opponentBuildings[row][col].findIndex(building => building.entityType === EntityType.FACTORY) > -1) {
                    factoryDestroyed = false;
                    break;
                }
            }
        }

        for (let row = 0; row < opponentBuildings.length; row ++) {
            for (let col = 0; col < opponentBuildings[0].length; col ++) {
                if (opponentBuildings[row][col].findIndex(building => building.entityType === EntityType.CREAM) > -1) {
                    creamUncovered = false;
                    break;
                }
            }
        }

        if (factoryDestroyed) {
            setTimeout(() => this.props.fulfilled(), 1000);
        }
        else if (creamUncovered && this.state.messages.length === 3) {
            this.setState({
                messages: [...this.state.messages, 
                           { text: 'Oh no! Your opponent also has a spying easter bunny ...', type: 'text', delay: 2500}]
            });
            this.gotoBuildPhase();
        }
    }

    select(building) {
        if (this.canBuild(building)) {
            Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
            this.setState({ selectedBuilding: building });
        }
    }

    canBuild(building) {
        return this.state.cacao >= getEntityDescriptor(building).costs;
    }

    gotoBuildPhase() {
        if (this.state.messages.length === 4) {
            this.setState({ 
                pseudoPhase: 'build',
                spyAttacks: this.state.spyAttacksPerTurn,
                ballistaAttacks: this.state.ballistaAttacksPerTurn,
                selectedBuilding: EntityType.XMAS_FACTORY,
                cacao: 100,
                messages: [...this.state.messages, 
                { text: 'Take this cacao to build a xmas factory. It will protect you from spying attacks', type: 'text', delay: 2500},
                { text: 'If the bunny is going to spy an area that also conatins a xmas factory..', type: 'text', delay: 2500},
                { text: 'It gets melted down and you get a hot chocolate ballista', type: 'text', delay: 2500}]
            });
        } else {
            this.setState({ 
                pseudoPhase: 'build',
                spyAttacks: this.state.spyAttacksPerTurn,
                ballistaAttacks: this.state.ballistaAttacksPerTurn
            });
        }
    }

    selectAttack(attack) {
        if (attack === AttackType.BUNNY) {
            if (this.state.spyAttacks > 0) {
                this.setState({ selectedAttack: AttackType.BUNNY });
            }
        } else if (attack === AttackType.HOT_CHOCOLATE) {
            if (this.state.ballistaAttacks > 0) {
                this.setState({ selectedAttack: AttackType.HOT_CHOCOLATE });
            }
        }
    }

    render() {
        let loadingAnimation = this.state.opponentTurn ? <div className="tutorial"><img className="loadingAnimation" src="animations/loading.gif" alt="loading" /></div> : null;
        let playerSetup = [{ type: EntityType.FACTORY, row: 1, col: 1 }, { type: EntityType.CREAM, row: 1, col: 1}, 
                           { type: EntityType.CREAM, row: 0, col: 1 }, { type: EntityType.CREAM, row: 2, col: 1 }, 
                           { type: EntityType.CREAM, row: 2, col: 2 }, { type: EntityType.SPYING_EASTER_BUNNY, row: 2, col: 2 },
                           { type: EntityType.CREAM, row: 0, col: 0 }];
        let opponentSetup = [{ type: EntityType.FACTORY, row: 1, col: 1 }, { type: EntityType.SPYING_EASTER_BUNNY, row: 0, col: 0 },
                             { type: EntityType.CREAM, row: 0, col: 0}, { type: EntityType.CREAM, row: 2, col: 2},
                             { type: EntityType.CREAM, row: 0, col: 1}, { type: EntityType.CREAM, row: 0, col: 2},
                             { type: EntityType.CREAM, row: 1, col: 0}, { type: EntityType.CREAM, row: 1, col: 1},
                             { type: EntityType.CREAM, row: 1, col: 2}, { type: EntityType.CREAM, row: 2, col: 0},
                             { type: EntityType.CREAM, row: 2, col: 1}];
        let gamefield = <div className="microGame">
                    <div className="microGamefield">
                        <MicroGamefield opponentGamefield={true} size={3} 
                                        opponentSetup={opponentSetup}
                                        playerSetup={playerSetup}
                                        selectedBuilding={this.state.selectedBuilding} 
                                        selectedAttack={this.state.selectedAttack} 
                                        pseudoPhase={this.state.pseudoPhase}
                                        attackCallback={opponentBuildings => this.attackCallback(opponentBuildings)}
                                        onRef={gamefield => this.gamefield = gamefield}
                                        buildCallback={(building, celltype) => this.buildCallback(building, celltype)}/>

                        {(() => {
                            if (this.state.pseudoPhase === 'build') {
                                return (
                                    <div className="tutorial" id="buildingSelection">
                                        <div onClick={() => this.select(EntityType.XMAS_FACTORY)} className={this.state.selectedBuilding === EntityType.XMAS_FACTORY ? 'selected previewContainer' : 'previewContainer'}>
                                            <div className={this.canBuild(EntityType.XMAS_FACTORY) ? '' : 'disabled'}></div>
                                            <img alt="cacao tree preview" className="preview" src="images/xmasFactory_icon.png"/>
                                        </div>                    
                                    </div>
                                );
                            } else {
                                return (
                                    <div className="tutorial" id="attackSelection">
                                        <div onClick={() => {
                                              Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                              this.selectAttack(AttackType.BUNNY);
                                            }}
                                             className={this.state.selectedAttack === AttackType.BUNNY ? 'selected previewContainer' : 'previewContainer'}>
                                            <div className={this.state.spyAttacks > 0 ? '' : 'disabled'}></div>
                                            <div className="attackCount">{this.state.spyAttacks}</div>
                                            <img alt="spy attacks preview" className={this.state.spyAttacks > 0 ? 'enabled preview' : 'preview'} src="images/spying_easter_bunny_icon.png"/>
                                        </div>
                                        <div onClick={() => {
                                              Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                              this.selectAttack(AttackType.HOT_CHOCOLATE);
                                            }}
                                            className={this.state.selectedAttack === AttackType.HOT_CHOCOLATE ? 'selected previewContainer' : 'previewContainer'}>
                                            <div className={this.state.ballistaAttacks > 0 ? '' : 'disabled'}></div>
                                            <div className="attackCount">{this.state.ballistaAttacks}</div>
                                            <img alt="ballista preview" className={this.state.spyAttacks > 0 ? 'enabled preview' : 'preview'} src="images/hotChocolateBallista_icon.png" />
                                        </div>
                                    </div>
                                );
                            }
                        })()}

                        <div className="tutorial" id="gameMenu">
                            <div id="totalCacao" className="infoIcon">
                                <img alt="cacao" src="images/cacao_icon.png" />
                                <p>{this.state.cacao}</p>
                            </div>
                        </div>
                    </div>
                </div>;
        return (
            <div>
                { loadingAnimation }
                { gamefield }
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