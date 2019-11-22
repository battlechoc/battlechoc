import React, { Component } from 'react';
import './BuildingPalette.css';
import { connect } from 'react-redux';
import { multiplayer } from '../../Multiplayer';
import { selectBuilding, tapBuilding } from '../UiActions';
import { EntityType, getEntityDescriptor } from '../../gameplay/GameEntities';
import { GameStateTypes } from '../../gameplay/GameplayReducer';
import { Jukebox } from '../misc';

class BuildingPalette extends Component {
    constructor(props) {
        super(props);
        this.buildingsForSeclection = [{
            type: EntityType.FACTORY,
            className: 'factory',
            alt: 'factory preview',
            costs: getEntityDescriptor(EntityType.FACTORY, this.props.level).costs()
        }, {
            type: EntityType.CACAOTREE,
            className: 'cacaotree',
            alt: 'cacao tree preview',
            costs: getEntityDescriptor(EntityType.CACAOTREE, this.props.level).costs()
        }, {
            type: EntityType.RUM_TRUFFLE_CANNON,
            className: 'cannon',
            alt: 'cannon preview',
            costs: getEntityDescriptor(EntityType.RUM_TRUFFLE_CANNON, this.props.level).costs()
        }, {
            type: EntityType.FACTORY_EXTENSION,
            className: 'factoryExtension',
            alt: 'factory extension preview',
            costs: getEntityDescriptor(EntityType.FACTORY_EXTENSION, this.props.level).costs()
        }, {
            type: EntityType.CREAM,
            className: 'cream',
            alt: 'cream preview',
            costs: getEntityDescriptor(EntityType.CREAM, this.props.level).costs()
        }, {
            type: EntityType.SPYING_EASTER_BUNNY,
            className: 'bunny',
            alt: 'easter factory',
            costs: getEntityDescriptor(EntityType.SPYING_EASTER_BUNNY, this.props.level).costs()
        }, {
            type: EntityType.XMAS_FACTORY,
            className: 'xmasFactory',
            alt: 'xmas factory',
            costs: getEntityDescriptor(EntityType.XMAS_FACTORY, this.props.level).costs()
        }, {
            type: EntityType.CHOCOLATE_FOUNTAIN,
            className: 'fountain',
            alt: 'chocolate fountain',
            costs: getEntityDescriptor(EntityType.CHOCOLATE_FOUNTAIN, this.props.level).costs()
        }, {
            type: EntityType.FRUIT_CANNON,
            className: 'fruitCannon',
            alt: 'fruit cannon',
            costs: getEntityDescriptor(EntityType.FRUIT_CANNON, this.props.level).costs()
        }];
    }

    buildingSelectionIsVisible() {
        return (this.props.game.state === GameStateTypes.BUILD_PHASE ||
            this.props.game.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT ||
            this.props.game.state === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT) &&
            multiplayer.isLocalPlayer(this.props.game.currentPlayerIndex);
    }

    playerCanBuild(building) {
        const buildingDescriptor = getEntityDescriptor(building.type, this.props.level);
        const canBuild = this.props.game.players[multiplayer.localPlayerIndex].buildingsPerTurn > 0 &&
            this.props.game.players[multiplayer.localPlayerIndex].cacao >= buildingDescriptor.costs() &&
            this.props.game.players[multiplayer.localPlayerIndex].buildings > 0;
        if (building.type === EntityType.SPYING_EASTER_BUNNY) {
            const playerField = this.props.game.players[multiplayer.localPlayerIndex].fieldIndex;
            return canBuild && this.props.game.board.fields[playerField].grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.SPYING_EASTER_BUNNY)).length === 0
        } else if (building.type === EntityType.FACTORY_EXTENSION) {
            const hasFactory = this.props.game.players[multiplayer.localPlayerIndex].hasFactory;
            return canBuild && hasFactory;
        } else if (building.type === EntityType.FRUIT_CANNON) {
            const playerField = this.props.game.players[multiplayer.localPlayerIndex].fieldIndex;
            const hasCannons = this.props.game.board.fields[playerField].grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.RUM_TRUFFLE_CANNON)).length > 0;
            return canBuild && hasCannons;
        } else {
            return canBuild;
        }
    }

    tapBuilding(buildingType) {
        this.props.tapBuilding(buildingType);
    }

    selectBuilding(buildingType) {
        this.props.selectBuilding(buildingType);      
    }

    render() {
        return (
            <div id="buildingSelection">
                {(() => {
                    if (this.buildingSelectionIsVisible()) {
                        return this.buildingsForSeclection.map((building, i) => {
                            if (typeof this.props.whitelist !== 'undefined') {
                                if (!this.props.whitelist.includes(building.type)) {
                                    return null;
                                }
                            }
                            let canBuild = this.playerCanBuild(building);

                            if (building.type === EntityType.FACTORY) {
                                canBuild = (this.props.game.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT ||
                                    this.props.game.state === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT) &&
                                    !this.props.game.players[multiplayer.localPlayerIndex].hasFactory;
                            }

                            if ((building.type === EntityType.FACTORY && ((this.props.game.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT ||
                                this.props.game.state === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT) && !this.props.game.players[multiplayer.localPlayerIndex].hasFactory)) ||
                                (building.type !== EntityType.FACTORY && this.props.game.state !== GameStateTypes.PLAYER_1_INITIAL_PLACEMENT && this.props.game.state !== GameStateTypes.PLAYER_2_INITIAL_PLACEMENT)) {
                                let className = canBuild ? (this.props.selectedBuilding === building.type ? 'selected previewContainer' : 'canbuild previewContainer') : 'previewContainer';
                                return <div className={className} key={i}>
                                    <div className={building.className + (canBuild ? ' enabled preview' : ' disabled preview')} 
                                         style={{ backgroundImage: 'url(/images/toolbar_icon_palette.png)' }} onClick={() => {
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
    }
}

const mapStateToProps = state => ({
    game: state.gameplay.game,
    selectedBuilding: state.ui.selectedBuilding,
    whitelist: state.ui.whitelistBuildings,
    level: state.ui.playerInfos.stats.level
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