import React, { Component } from 'react';
import './BuildingPalette.css';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { multiplayer } from '../../Multiplayer';
import { selectBuilding, tapBuilding } from '../UiActions';
import { EntityType, getEntityDescriptor } from '../../gameplay/GameEntities';
import { GameStateTypes } from '../../gameplay/GameplayReducer';
import { Jukebox } from '../misc';

class BuildingPalette extends Component {
    componentWillMount() {
        this.buildingsForSeclection = [{
            type: EntityType.FACTORY,
            className: 'factory',
            alt: 'factory preview',
            costs: getEntityDescriptor(EntityType.FACTORY).costs
        }, {
            type: EntityType.CACAOTREE,
            className: 'cacaotree',
            alt: 'cacao tree preview',
            costs: getEntityDescriptor(EntityType.CACAOTREE).costs
        }, {
            type: EntityType.RUM_TRUFFLE_CANNON,
            className: 'cannon',
            alt: 'cannon preview',
            costs: getEntityDescriptor(EntityType.RUM_TRUFFLE_CANNON).costs
        }, {
            type: EntityType.FACTORY_EXTENSION,
            className: 'factoryExtension',
            alt: 'factory extension preview',
            costs: getEntityDescriptor(EntityType.FACTORY_EXTENSION).costs
        }, {
            type: EntityType.CREAM,
            className: 'cream',
            alt: 'cream preview',
            costs: getEntityDescriptor(EntityType.CREAM).costs
        }, {
            type: EntityType.SPYING_EASTER_BUNNY,
            className: 'bunny',
            alt: 'easter factory',
            costs: getEntityDescriptor(EntityType.SPYING_EASTER_BUNNY).costs
        }, {
            type: EntityType.XMAS_FACTORY,
            className: 'xmasFactory',
            alt: 'xmas factory',
            costs: getEntityDescriptor(EntityType.XMAS_FACTORY).costs
        }, {
            type: EntityType.CHOCOLATE_FOUNTAIN,
            className: 'fountain',
            alt: 'chocolate fountain',
            costs: getEntityDescriptor(EntityType.CHOCOLATE_FOUNTAIN).costs
        }, {
            type: EntityType.FRUIT_CANNON,
            className: 'fruitCannon',
            alt: 'fruit cannon',
            costs: getEntityDescriptor(EntityType.FRUIT_CANNON).costs
        }];
    }

    buildingSelectionIsVisible(game) {
        if (typeof this.props.pseudoGame === 'undefined') {
            return (game.state === GameStateTypes.BUILD_PHASE ||
                game.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT ||
                game.state === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT) &&
                multiplayer.isLocalPlayer(game.currentPlayerIndex);
        } else {
            return game.state === GameStateTypes.BUILD_PHASE || GameStateTypes.PLAYER_1_INITIAL_PLACEMENT;
        }
    }

    getPlayerIndex() {
        if (typeof this.props.pseudoGame === 'undefined') {
            return multiplayer.localPlayerIndex;
        } else {
            return 0;
        }
    }

    playerCanBuild(game, building) {
        const canBuild = game.players[this.getPlayerIndex()].buildingsPerTurn > 0 &&
            game.players[this.getPlayerIndex()].cacao >= building.costs &&
            game.players[this.getPlayerIndex()].buildings > 0;
        if (building.type === EntityType.SPYING_EASTER_BUNNY) {
            const playerField = game.players[this.getPlayerIndex()].fieldIndex;
            return canBuild && game.board.fields[playerField].grid.filter(cell => cell.occupiedBy.includes(EntityType.SPYING_EASTER_BUNNY)).length === 0
        } else if (building.type === EntityType.FACTORY_EXTENSION) {
            const hasFactory = game.players[this.getPlayerIndex()].hasFactory;
            return canBuild && hasFactory;
        } else if (building.type === EntityType.FRUIT_CANNON) {
            const playerField = game.players[this.getPlayerIndex()].fieldIndex;
            const hasCannons = game.board.fields[playerField].grid.filter(cell => cell.occupiedBy.includes(EntityType.RUM_TRUFFLE_CANNON)).length > 0;
            return canBuild && hasCannons;
        } else {
            return canBuild;
        }
    }

    tapBuilding(buildingType) {
        if (typeof this.props.pseudoGame === 'undefined') {
            this.props.tapBuilding(buildingType);
        }
    }

    selectBuilding(buildingType) {
        if (typeof this.props.pseudoGame === 'undefined') {
            this.props.selectBuilding(buildingType);
        } else {
            this.props.simulateBuildingSelection(buildingType);
        }        
    }

    render() {
        const game = typeof this.props.pseudoGame !== 'undefined' ? this.props.pseudoGame.gameplay.game : this.props.game;
        const selectedBuilding = typeof this.props.pseudoGame !== 'undefined' ? this.props.pseudoGame.ui.selectedBuilding : this.props.selectedBuilding;
        if (this.props.isVisible) {
            return (
                <div id="buildingSelection">
                    {(() => {
                        if (this.buildingSelectionIsVisible(game)) {
                            return this.buildingsForSeclection.map((building, i) => {
                                if (typeof this.props.whitelist !== 'undefined') {
                                    if (!this.props.whitelist.includes(building.type)) {
                                        return null;
                                    }
                                }
                                let canBuild = this.playerCanBuild(game, building);

                                if (building.type === EntityType.FACTORY) {
                                    canBuild = (game.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT ||
                                        game.state === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT) &&
                                        !game.players[this.getPlayerIndex()].hasFactory;
                                }

                                if ((building.type === EntityType.FACTORY && ((game.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT ||
                                    game.state === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT) && !game.players[this.getPlayerIndex()].hasFactory)) ||
                                    (building.type !== EntityType.FACTORY && game.state !== GameStateTypes.PLAYER_1_INITIAL_PLACEMENT && game.state !== GameStateTypes.PLAYER_2_INITIAL_PLACEMENT)) {
                                    let className = canBuild ? (selectedBuilding === building.type ? 'selected previewContainer' : 'canbuild previewContainer') : 'previewContainer';
                                    return <div className={className} key={i}>
                                        <div className={building.className + (canBuild ? ' enabled preview' : ' disabled preview')} 
                                             style={{ backgroundImage: 'url(images/toolbar_icon_palette.png)' }} onClick={() => {
                                            this.tapBuilding(building.type);
                                            if (canBuild) {
                                                Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                                this.selectBuilding(building.type);
                                            }
                                        }} />
                                    </div>
                                } else {
                                    return null;
                                }
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
    isVisible: PropTypes.bool.isRequired,
    pseudoGame: PropTypes.object,
    whitelist: PropTypes.array
}

const mapStateToProps = state => ({
    game: state.gameplay.game,
    selectedBuilding: state.ui.selectedBuilding
});

const mapDispatchToProps = {
    selectBuilding,
    tapBuilding
};

const BuildingPaletteContainer = connect(
    mapStateToProps,
    mapDispatchToProps
)(BuildingPalette);

export default BuildingPaletteContainer;