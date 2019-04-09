import React, { Component } from 'react';
import PropTypes from 'prop-types';
import MicroGamefield from './MicroGamefield';
import ChatLikeInstructions from './ChatLikeInstructions';
import { EntityType, getEntityDescriptor } from '../gameplay/GameEntities';

class TreesAndCannonsPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            selectedBuilding: EntityType.CACAOTREE,
            cacao: 20,
            explainDialogVisible: false,
            messages: [
                { text: 'The most important buildings are the cacao tree and the rum truffle cannon', type: 'text', delay: 500 },
                { src: 'cannon_icon.png', type: 'image', delay: 500, alt: 'cannon message icon' },
                { src: 'cacaotree_icon.png', type: 'image', delay: 2500, alt: 'cacao tree message icon' },
                { text: 'You win a game if you destroy the factory and all cannons of your opponent', type: 'text', delay: 2500 },
                { text: 'Plant a tree to get cacao. You need it to build a cannon', type: 'text', delay: 2500 },
                { text: 'Build a cannon and attack your opponent\'s facotry to continue with the tutorial', type: 'text', delay: 2500 },
                { text: 'Hint: If you build a cacao tree on a white field it grows better produces 1.5x more cacao per round', type: 'text', delay: 1000}
            ]
        };
    }

    buildCallback(building) {
        if (building === EntityType.CACAOTREE) {
            if ((this.state.cacao - 20) < 20) {
                this.setState({ 
                    cacao: this.state.cacao - 20,
                    selectedBuilding: undefined,
                    messages: [...this.state.messages, 
                        { text: 'battlechoc is a turn-based strategy game. A turn consists of two game phases: Build and attack', type: 'text', delay: 2500},
                        { text: 'use this button to finish your build phase..', type: 'text', delay: 2500},
                        { text: '..and this one to end your turn', type: 'text', delay: 2500}
                    ]
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

    handleClose = () => {
        this.setState({explainDialogVisible: false});
    }

    render() {
        let gamefield = <div className="microGame">
                    <div className="microGamefield">
                        <MicroGamefield opponentGamefield={true} size={3} selectedBuilding={this.state.selectedBuilding} buildCallback={building => this.buildCallback(building)}/>

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
                    </div>
                </div>;
        return (
            <div>
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