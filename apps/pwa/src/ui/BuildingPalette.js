import React, { Component } from 'react';
import './BuildingPalette.css';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { selectBuilding } from './UiActions';
import { EntityType, getEntityDescriptor } from '../gameplay/GameEntities';
import { GameStateTypes } from '../gameplay/GameplayReducer';

class BuildingPalette extends Component {
    componentWillMount() {
        this.buildingsForSeclection = [{
            type: EntityType.FACTORY,
            image: 'images/factory_icon.png',
            alt: 'factory preview',
            costs: getEntityDescriptor(EntityType.FACTORY).costs
        }, {
            type: EntityType.CACAOTREE,
            image: 'images/cacaotree_icon.png',
            alt: 'cacao tree preview',
            costs: getEntityDescriptor(EntityType.CACAOTREE).costs
        }, {
            type: EntityType.RUM_TRUFFLE_CANNON,
            image: 'images/cannon_icon.png',
            alt: 'cannon preview',
            costs: getEntityDescriptor(EntityType.RUM_TRUFFLE_CANNON).costs
        }, {
            type: EntityType.FACTORY_EXTENSION,
            image: 'images/factory_extension_icon.png',
            alt: 'factory extension preview',
            costs: getEntityDescriptor(EntityType.FACTORY_EXTENSION).costs
        }, {
            type: EntityType.CREAM,
            image: 'images/cream_icon.png',
            alt: 'cream preview',
            costs: getEntityDescriptor(EntityType.CREAM).costs
        }, {
            type: EntityType.SPYING_EASTER_BUNNY,
            image: 'images/spying_easter_bunny_icon.png',
            alt: 'easter factory',
            costs: getEntityDescriptor(EntityType.SPYING_EASTER_BUNNY).costs
        }, {
            type: EntityType.XMAS_FACTORY,
            image: 'images/xmasFactory_icon.png',
            alt: 'xmas factory',
            costs: getEntityDescriptor(EntityType.XMAS_FACTORY).costs
        }, {
            type: EntityType.CHOCOLATE_FOUNTAIN,
            image: 'images/chocolateFountain_icon.png',
            alt: 'chocolate fountain',
            costs: getEntityDescriptor(EntityType.CHOCOLATE_FOUNTAIN).costs
        }, {
            type: EntityType.FRUIT_CANNON,
            image: 'images/fruitCannon_icon.png',
            alt: 'fruit cannon',
            costs: getEntityDescriptor(EntityType.FRUIT_CANNON).costs
        }];
    }

    buildingSelectionIsVisible() {
        return (this.props.state === GameStateTypes.BUILD_PHASE ||
            this.props.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT ||
            this.props.state === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT) &&
            this.props.game.currentPlayerIndex === 0;
    }

    playerCanBuild(building) {
        let canBuild = this.props.game.players[0].buildingsPerTurn > 0 &&
                       this.props.game.players[0].cacao >= building.costs &&
                       this.props.game.players[0].buildings > 0;
        if (building.type === EntityType.SPYING_EASTER_BUNNY) {
            let playerField = this.props.game.players[0].fieldIndex;
            return canBuild && this.props.game.board.fields[playerField].grid.filter(cell => cell.occupiedBy.includes(EntityType.SPYING_EASTER_BUNNY)).length === 0
        } else if (building.type === EntityType.FACTORY_EXTENSION) {
            let hasFactory = this.props.game.players[0].hasFactory;
            return canBuild && hasFactory;
        } else {
            return canBuild;
        }
    }

    render() {
        if (this.props.isVisible) {
            return (
                <div id="buildingSelection">
                    {(() => {
                        if (this.buildingSelectionIsVisible()) {
                            return this.buildingsForSeclection.map((building, i) => {
                                let canBuild = this.playerCanBuild(building);
                                if (building.type === EntityType.FACTORY) {
                                    canBuild = (this.props.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT ||
                                        this.props.state === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT) &&
                                        this.props.game.currentPlayerIndex === 0 &&
                                        !this.props.game.players[0].hasFactory;
                                }

                                let className = canBuild && this.props.selectedBuilding === building.type ? 'selected previewContainer' : 'previewContainer';
                                return <div className={className} key={i}>
                                    <div className={canBuild ? '' : 'disabled'}></div>
                                    <img alt={building.alt} className={canBuild ? 'enabled preview' : 'preview'} src={building.image} onClick={() => {
                                        if (canBuild) {
                                            this.props.selectBuilding(building.type);
                                        }
                                    }} />
                                </div>
                            });
                        }
                    })()}
                </div>
            );
        } else {
            return null;
        }
    }
}

BuildingPalette.propTypes = {
    isVisible: PropTypes.bool.isRequired
}

const mapStateToProps = state => ({
    game: state.gameplay.game,
    state: typeof state.gameplay.game === 'undefined' ? undefined : state.gameplay.game.state,
    selectedBuilding: state.ui.selectedBuilding
});

const mapDispatchToProps = {
    selectBuilding
};

const BuildingPaletteContainer = connect(
    mapStateToProps,
    mapDispatchToProps
)(BuildingPalette);

export default BuildingPaletteContainer;