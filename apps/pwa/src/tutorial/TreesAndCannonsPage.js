import React, { Component } from 'react';
import PropTypes from 'prop-types';
import MicroGamefield from './MicroGamefield';
import ChatLikeInstructions from './ChatLikeInstructions';
import { EntityType, getEntityDescriptor, BoardCellTypes, AttackType } from '../gameplay/GameEntities';
import Fab from '@material-ui/core/Fab';
import { PlayArrow, FastForward } from '@material-ui/icons';
import Jukebox from '../ui/Jukebox';

class TreesAndCannonsPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            selectedBuilding: EntityType.CACAOTREE,
            cacao: 50,
            explainDialogVisible: false,
            messages: [
                { text: 'The most important buildings are the cacao tree and the rum truffle cannon', type: 'text', delay: 500 },
                { src: 'cannon_icon.png', type: 'image', delay: 500, alt: 'cannon message icon' },
                { src: 'cacaotree_icon.png', type: 'image', delay: 3500, alt: 'cacao tree message icon' },
                { text: 'You win a game if you destroy the factory and all cannons of your opponent', type: 'text', delay: 2500 },
                { text: 'Plant a few trees to get cacao. You need it to build a cannon', type: 'text', delay: 2500 },
                { text: 'Build a cannon and attack your opponent\'s facotry to continue with the tutorial', type: 'text', delay: 2500 },
                { text: 'Hint: If you build a cacao tree on a white field it grows better produces 1.5x more cacao per round', type: 'text', delay: 1000}
            ],
            showPseudoActionbar: false,
            pseudoPhase: 'build',
            cacaoPerTurn: 0,
            attacksPerTurn: 0,
            selectedAttack: undefined
        };
    }

    buildCallback(building, celltype) {
        let description = getEntityDescriptor(building)
        if (building === EntityType.CACAOTREE) {
            let cacaoPerTurn = celltype === BoardCellTypes.WHITE ? Math.round(description.cacaoPerTurn * 1.5) : description.cacaoPerTurn;
            if ((this.state.cacao - description.costs) < description.costs) {
                if (this.state.messages.length < 8) {
                    this.setState({ 
                        cacao: this.state.cacao - description.costs,
                        cacaoPerTurn: this.state.cacaoPerTurn + cacaoPerTurn,
                        selectedBuilding: undefined,
                        messages: [...this.state.messages, 
                            { text: 'battlechoc is a turn-based strategy game. A turn consists of two game phases: Build and attack', type: 'text', delay: 2500},
                            { text: 'Use the blinking button above to finish your build phase..', type: 'text', delay: 2500}
                        ],
                        showPseudoActionbar: true
                    });
                } else {
                    this.setState({ 
                        cacao: this.state.cacao - description.costs,
                        cacaoPerTurn: this.state.cacaoPerTurn + cacaoPerTurn,
                        selectedBuilding: undefined,
                    });
                }
            } else {
                this.setState({ 
                    cacao: this.state.cacao - description.costs,
                    cacaoPerTurn: this.state.cacaoPerTurn + cacaoPerTurn 
                });
            }
        } else if (building === EntityType.RUM_TRUFFLE_CANNON) {
            if (this.state.messages.length < 12) {
                this.setState({ 
                    messages: [...this.state.messages, { text: 'now you can attack your opponent. Just finish your build phase and click on your opponent\'s facotry!', type: 'text', delay: 2500}]
                });
            }
            this.setState({ 
                cacao: this.state.cacao - description.costs,
                attacksPerTurn: this.state.attacksPerTurn + 1,
                selectedAttack: AttackType.TRUFFLE
            });
            if ((this.state.cacao - description.costs) < description.costs) {
                this.setState({ selectedBuilding: undefined });                
            }          
        }
    }

    attackCallback() {
        setTimeout(() => this.props.fulfilled(), 1000);
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

    gotoAttackPhase() {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        if (this.state.messages.length < 10) {
            this.setState({ 
                pseudoPhase: 'attack',
                messages: [...this.state.messages, { text: '..and this one to end your turn', type: 'text', delay: 2500}]
            });
        } else {
            this.setState({ pseudoPhase: 'attack' });            
        }
    }

    gotoBuildPhase() {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        if (this.state.messages.length < 11) {
            this.setState({ 
                pseudoPhase: 'build',
                selectedBuilding: EntityType.RUM_TRUFFLE_CANNON,
                cacao: this.state.cacao + this.state.cacaoPerTurn,
                messages: [...this.state.messages, { text: 'look: you gained some cacao! Now you can build a cannon. Select the cannon by clicking the icon', type: 'text', delay: 2500}]
            });
            this.highlight('totalCacao');
        } else {
            this.setState({ 
                pseudoPhase: 'build',
                cacao: this.state.cacao + this.state.cacaoPerTurn
            });
        }
    }

    highlight(id) {
        let domElement = document.getElementById(id);
        domElement.classList.add('highlighted');
        setTimeout(() => domElement.classList.remove('highlighted'), 4000);
    }

    handleClose = () => {
        this.setState({explainDialogVisible: false});
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

        if (this.state.pseudoPhase === 'attack') {
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
        let gamefield = <div className="microGame">
                    <div className="microGamefield">
                        <MicroGamefield opponentGamefield={true} size={3} 
                                        selectedBuilding={this.state.selectedBuilding} 
                                        selectedAttack={this.state.selectedAttack} 
                                        pseudoPhase={this.state.pseudoPhase}
                                        attackCallback={() => this.attackCallback()}
                                        buildCallback={(building, celltype) => this.buildCallback(building, celltype)}/>

                        {(() => {
                            if (this.state.pseudoPhase === 'build') {
                                return (
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
                                );
                            } else {
                                return (
                                    <div className="tutorial" id="attackSelection">
                                        <div className={this.state.attacksPerTurn > 0 ? 'selected previewContainer' : 'previewContainer'}>
                                            <div className={this.state.attacksPerTurn > 0 ? '' : 'disabled'}></div>
                                            <img alt="cannon preview" className={this.state.attacksPerTurn > 0 ? 'enabled preview' : 'preview'} src="images/cannon_icon.png"/>
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
                { this.state.showPseudoActionbar ? pseudoActionbar : null }
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