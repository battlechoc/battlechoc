import React, { Component } from 'react';
import PropTypes from 'prop-types';
import MicroGamefield from './MicroGamefield';
import ChatLikeInstructions from './ChatLikeInstructions';
import { EntityType, getEntityDescriptor, BoardCellTypes, AttackType } from '../gameplay/GameEntities';
import Fab from '@material-ui/core/Fab';
import { PlayArrow, FastForward } from '@material-ui/icons';
import { Jukebox } from '../ui/misc';
import { BuildingPalette, AttackPalette, InfoPanel } from '../ui/controls';
import { GameStateTypes } from '../gameplay/GameplayReducer';
import TreeAndCannonTutorialSituation from '../situations/tutorial/TreeAndCannonTutorial';

class TreesAndCannonsPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            showPseudoActionbar: false,
            messages: [
                { text: 'The most important buildings are the cacao tree and the rum truffle cannon', type: 'text', delay: 500 },
                { src: 'cannon', type: 'image', delay: 500, alt: 'cannon message icon' },
                { src: 'cacaotree', type: 'image', delay: 3500, alt: 'cacao tree message icon' },
                { text: 'You win a game if you destroy the factory and all cannons of your opponent', type: 'text', delay: 2500 },
                { text: 'Plant a few trees to get cacao. You need it to build a cannon', type: 'text', delay: 2500 },
                { text: 'Build a cannon and attack your opponent\'s facotry to continue with the tutorial', type: 'text', delay: 2500 },
                { text: 'Hint: If you build a cacao tree on a white field it grows better produces 1.5x more cacao per round', type: 'text', delay: 1000}
            ]
        };
        this.game = TreeAndCannonTutorialSituation.game;
        console.log(this.game);
    }

    buildCallback(building, celltype) {
        let description = getEntityDescriptor(building)
        if (building === EntityType.CACAOTREE) {
            let cacaoPerTurn = celltype === BoardCellTypes.WHITE ? Math.round(description.cacaoPerTurn * 1.5) : description.cacaoPerTurn;
            this.game.gameplay.game.players[0].cacao -= description.costs;
            this.game.gameplay.game.players[0].cacaoPerTurn += cacaoPerTurn;
            this.game.gameplay.game.players[0].buildings -= 1;
        } else if (building === EntityType.RUM_TRUFFLE_CANNON) {
            if (this.state.messages.length < 12) {
                this.setState({ 
                    messages: [...this.state.messages, { text: 'now you can attack your opponent. Just finish your build phase and click on your opponent\'s facotry!', type: 'text', delay: 2500}]
                });
            }
            this.game.gameplay.game.players[0].cacao -= description.costs;
            this.game.gameplay.game.players[0].attacksPerTurn[AttackType.TRUFFLE] += 1;
            this.game.gameplay.game.players[0].attacks[AttackType.TRUFFLE] += 1;
            this.game.gameplay.game.players[0].buildings -= 1;
        }

        if (this.game.gameplay.game.players[0].cacao < description.costs) {
            if (building === EntityType.RUM_TRUFFLE_CANNON && this.game.gameplay.game.players[0].cacao >= getEntityDescriptor(EntityType.CACAOTREE).costs) {
                this.simulateBuildingSelection(EntityType.CACAOTREE);
            } else {
                this.simulateBuildingSelection(undefined);
            }
            if (this.state.messages.length < 8) {
                this.setState({
                    messages: [...this.state.messages, 
                        { text: 'battlechoc is a turn-based strategy game. A turn consists of two game phases: Build and attack', type: 'text', delay: 2500},
                        { text: 'Use the blinking button above to finish your build phase..', type: 'text', delay: 2500}
                    ],
                    showPseudoActionbar: true
                });
            }
        }
        this.forceUpdate();
    }

    attackCallback() {
        setTimeout(() => this.props.fulfilled(), 1000);
    }

    simulateBuildingSelection = buildingType => {
        this.game.ui.selectedBuilding = buildingType;
        this.forceUpdate();
    }

    simulateAttackSelection = attackType => {
        this.game.ui.selectedAttack = attackType;
        this.forceUpdate();
    }

    gotoAttackPhase() {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        this.game.gameplay.game.state = GameStateTypes.ATTACK_PHASE;
        if (this.game.gameplay.game.players[0].attacks[AttackType.TRUFFLE] > 0) {
            this.game.ui.selectedAttack = AttackType.TRUFFLE;
        }
        if (this.state.messages.length < 10) {
            this.setState({
                messages: [...this.state.messages, { text: '..and this one to end your turn', type: 'text', delay: 2500}]
            });
        }
        this.forceUpdate();
    }

    gotoBuildPhase() {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        this.gamefield.triggerFlyingTreeInfo();
        this.game.gameplay.game.state = GameStateTypes.BUILD_PHASE;
        this.game.gameplay.game.players[0].cacao += this.game.gameplay.game.players[0].cacaoPerTurn;
        this.game.gameplay.game.players[0].buildings = this.game.gameplay.game.players[0].buildingsPerTurn;
        
        if (this.state.messages.length < 11) {
            this.simulateBuildingSelection(EntityType.RUM_TRUFFLE_CANNON);
            this.setState({ 
                messages: [...this.state.messages, { text: 'look: you gained some cacao! Now you can build a cannon. Select the cannon by clicking the icon', type: 'text', delay: 2500}]
            });
        }   
        this.forceUpdate();
    }

    render() {
        let icon = <Fab
                    size="small"
                    key="3"
                    color="primary"
                    aria-label="skip build phase"
                    className="icon blinking"
                    onClick={() => this.gotoAttackPhase()}>
                    <PlayArrow />
                  </Fab>

        if (this.game.gameplay.game.state === GameStateTypes.ATTACK_PHASE) {
            icon =<Fab
                    size="small"
                    key="4"
                    color="primary"
                    aria-label="finish turn"
                    className="icon blinking"
                    onClick={() => this.gotoBuildPhase()}>
                    <FastForward />
                 </Fab>
        } 
        let pseudoActionbar = <div className="pseudo actionbar">{ icon }</div>
        return (
            <div>
                { this.state.showPseudoActionbar ? pseudoActionbar : null }
                <div className="microGame">
                    <div className="microGamefield">
                        <MicroGamefield opponentGamefield={true} size={3} 
                                        selectedBuilding={this.game.ui.selectedBuilding} 
                                        selectedAttack={this.game.ui.selectedAttack} 
                                        playerSetup={this.game.gameplay.game.board.fields[0]}
                                        opponentSetup={this.game.gameplay.game.board.fields[1]}
                                        pseudoPhase={this.game.gameplay.game.state}
                                        attackCallback={() => this.attackCallback()}
                                        onRef={gamefield => this.gamefield = gamefield}
                                        buildCallback={(building, celltype) => this.buildCallback(building, celltype)}/>

                        <BuildingPalette simulateBuildingSelection={this.simulateBuildingSelection} pseudoGame={this.game} isVisible={this.game.gameplay.game.state === GameStateTypes.BUILD_PHASE} whitelist={[EntityType.CACAOTREE, EntityType.RUM_TRUFFLE_CANNON]}/>
                        <AttackPalette simulateAttackSelection={this.simulateAttackSelection} pseudoGame={this.game} isVisible={this.game.gameplay.game.state === GameStateTypes.ATTACK_PHASE} whitelist={[AttackType.TRUFFLE]}/>
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