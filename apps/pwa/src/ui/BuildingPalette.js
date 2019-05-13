import React, { Component } from 'react';
import './BuildingPalette.css';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { multiplayer } from '../Multiplayer';
import { selectBuilding, tapBuilding } from './UiActions';
import { EntityType, getEntityDescriptor } from '../gameplay/GameEntities';
import { GameStateTypes } from '../gameplay/GameplayReducer';
import Jukebox from './Jukebox';

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

    buildingSelectionIsVisible() {
        return (this.props.state === GameStateTypes.BUILD_PHASE ||
            this.props.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT ||
            this.props.state === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT) &&
            multiplayer.isLocalPlayer(this.props.game.currentPlayerIndex) === true;
    }

    playerCanBuild(building) {
        const canBuild = this.props.game.players[multiplayer.localPlayerIndex].buildingsPerTurn > 0 &&
            this.props.game.players[multiplayer.localPlayerIndex].cacao >= building.costs &&
            this.props.game.players[multiplayer.localPlayerIndex].buildings > 0;
        if (building.type === EntityType.SPYING_EASTER_BUNNY) {
            const playerField = this.props.game.players[multiplayer.localPlayerIndex].fieldIndex;
            return canBuild && this.props.game.board.fields[playerField].grid.filter(cell => cell.occupiedBy.includes(EntityType.SPYING_EASTER_BUNNY)).length === 0
        } else if (building.type === EntityType.FACTORY_EXTENSION) {
            const hasFactory = this.props.game.players[multiplayer.localPlayerIndex].hasFactory;
            return canBuild && hasFactory;
        } else if (building.type === EntityType.FRUIT_CANNON) {
            const playerField = this.props.game.players[multiplayer.localPlayerIndex].fieldIndex;
            const hasCannons = this.props.game.board.fields[playerField].grid.filter(cell => cell.occupiedBy.includes(EntityType.RUM_TRUFFLE_CANNON)).length > 0;
            return canBuild && hasCannons;
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
                                        multiplayer.isLocalPlayer(this.props.game.currentPlayerIndex) === true &&
                                        !this.props.game.players[multiplayer.localPlayerIndex].hasFactory;
                                }

                                if ((building.type === EntityType.FACTORY && ((this.props.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT ||
                                    this.props.state === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT) && multiplayer.isLocalPlayer(this.props.game.currentPlayerIndex) === true && !this.props.game.players[multiplayer.localPlayerIndex].hasFactory)) ||
                                    (building.type !== EntityType.FACTORY && this.props.state !== GameStateTypes.PLAYER_1_INITIAL_PLACEMENT && this.props.state !== GameStateTypes.PLAYER_2_INITIAL_PLACEMENT)) {
                                    let className = canBuild ? (this.props.selectedBuilding === building.type ? 'selected previewContainer' : 'canbuild previewContainer') : 'previewContainer';
                                    return <div className={className} key={i}>
                                        <div className={building.className + (canBuild ? ' enabled preview' : ' disabled preview')} 
                                             style={{ backgroundImage: 'url(images/toolbar_icon_palette.png)' }} onClick={() => {
                                            this.props.tapBuilding(building.type);
                                            if (canBuild) {
                                                Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                                this.props.selectBuilding(building.type);
                                            }
                                        }} />
                                    </div>
                                } else {
                                    return '';
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
    isVisible: PropTypes.bool.isRequired
}

const mapStateToProps = state => ({
    game: state.gameplay.game,
    state: typeof state.gameplay.game === 'undefined' ? undefined : state.gameplay.game.state,
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