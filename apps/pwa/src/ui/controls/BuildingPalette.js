import React from 'react';
import './BuildingPalette.css';
import { connect } from 'react-redux';
import { multiplayer } from '../../Multiplayer';
import { selectBuilding, tapBuilding, toggleDonutHighlighting } from '../UiActions';
import { GameStateTypes, EntityType, getEntityDescriptor } from 'battlechoc-shared-functions';
import { Jukebox } from '../misc';
import Fab from '@material-ui/core/Fab';
import { Visibility, VisibilityOff } from '@material-ui/icons';

const BuildingPalette = props => {
    let player = props.game.players[multiplayer.localPlayerIndex];
    let buildingsForSeclection = [{
        type: EntityType.FACTORY,
        className: 'factory',
        alt: 'factory preview',
        costs: getEntityDescriptor(EntityType.FACTORY, player.level).costs
    }, {
        type: EntityType.CACAOTREE,
        className: 'cacaotree',
        alt: 'cacao tree preview',
        costs: getEntityDescriptor(EntityType.CACAOTREE, player.level).costs
    }, {
        type: EntityType.RUM_TRUFFLE_CANNON,
        className: 'cannon',
        alt: 'cannon preview',
        costs: getEntityDescriptor(EntityType.RUM_TRUFFLE_CANNON, player.level).costs
    }, {
        type: EntityType.FACTORY_EXTENSION,
        className: 'factoryExtension',
        alt: 'factory extension preview',
        costs: getEntityDescriptor(EntityType.FACTORY_EXTENSION, player.level).costs
    }, {
        type: EntityType.CREAM,
        className: 'cream',
        alt: 'cream preview',
        costs: getEntityDescriptor(EntityType.CREAM, player.level).costs
    }, {
        type: EntityType.SPYING_EASTER_BUNNY,
        className: 'bunny',
        alt: 'easter factory',
        costs: getEntityDescriptor(EntityType.SPYING_EASTER_BUNNY, player.level).costs
    }, {
        type: EntityType.XMAS_FACTORY,
        className: 'xmasFactory',
        alt: 'xmas factory',
        costs: getEntityDescriptor(EntityType.XMAS_FACTORY, player.level).costs
    }, {
        type: EntityType.CHOCOLATE_FOUNTAIN,
        className: 'fountain',
        alt: 'chocolate fountain',
        costs: getEntityDescriptor(EntityType.CHOCOLATE_FOUNTAIN, player.level).costs
    }, {
        type: EntityType.FRUIT_CANNON,
        className: 'fruitCannon',
        alt: 'fruit cannon',
        costs: getEntityDescriptor(EntityType.FRUIT_CANNON, player.level).costs
    },{
        type: EntityType.DONUT_FACTORY,
        className: 'donut factory',
        alt: 'donut factory',
        costs: getEntityDescriptor(EntityType.DONUT_FACTORY, player.level).costs
    }];


    let buildingSelectionIsVisible = () => {
        return (props.game.state === GameStateTypes.BUILD_PHASE ||
            props.game.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT ||
            props.game.state === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT) &&
            multiplayer.isLocalPlayer(props.game.currentPlayerIndex);
    }

    let playerCanBuild = building => {
        const buildingDescriptor = getEntityDescriptor(building.type, player.level);
        const canBuild = player.buildingsPerTurn > 0 &&
            player.cacao >= buildingDescriptor.costs &&
            player.buildings > 0;
        if (building.type === EntityType.SPYING_EASTER_BUNNY) {
            const playerField = player.fieldIndex;
            return canBuild && props.game.board.fields[playerField].grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.SPYING_EASTER_BUNNY)).length === 0
        } else if (building.type === EntityType.DONUT_FACTORY) {
            return canBuild && player.donutProbability === 0;
        } else if (building.type === EntityType.FACTORY_EXTENSION) {
            const hasFactory = player.hasFactory;
            return canBuild && hasFactory;
        } else if (building.type === EntityType.FRUIT_CANNON) {
            const playerField = player.fieldIndex;
            const hasCannons = props.game.board.fields[playerField].grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.RUM_TRUFFLE_CANNON)).length > 0;
            return canBuild && hasCannons;
        } else {
            return canBuild;
        }
    }

    let tapBuilding = buildingType => {
        props.tapBuilding(buildingType);
    }

    let selectBuilding = buildingType => {
        props.selectBuilding(buildingType);      
    }

    let getDonutClass = donut => {
        if (donut.type === EntityType.DONUT_PORTAL_BLUE || donut.type === EntityType.DONUT_PORTAL_RED) {
            return ' portal donut';
        } else if (donut.type === EntityType.DONUT_SURPRISE_YELLOW) {
            return ' surprise donut';
        } else if (donut.type === EntityType.DONUT_HEALTH_GREEN) {
            return ' health donut';
        } else if (donut.type === EntityType.DONUT_STOP_PINK) {
            return ' stop donut';
        } else if (donut.type === EntityType.DONUT_CREAM_WHITE) {
            return ' cream donut';
        }
    } 

    let donutSelection = null;
    
    if (player.donuts.length > 0 || player.activeDonuts.length > 0) { 
        donutSelection = <div id="donutSelection">
            { player.activeDonuts.length > 0 ? <Fab
                color="primary"
                className="donut-visiblity icon"
                onClick={() => props.toggleDonutHighlighting() }>
                { props.donutHighlighting ? <VisibilityOff /> : <Visibility /> }                    
            </Fab> : null }
            { player.donuts.length > 0 ? <div className={props.selectedBuilding === player.donuts[0].type ? 'selected previewContainer' : 'canbuild previewContainer'}>
                <div className={'enabled preview' + getDonutClass(player.donuts[0])}  onClick={() => {
                    tapBuilding(player.donuts[0].type);
                    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                    selectBuilding(player.donuts[0].type);
                }} />
            </div> : null }
        </div>
    }

    return (
        <div>
            { buildingSelectionIsVisible() ? donutSelection : null }
            <div id="buildingSelection">
                {(() => {
                    if (buildingSelectionIsVisible()) {
                        return buildingsForSeclection.map((building, i) => {
                            if (typeof props.whitelist !== 'undefined') {
                                if (!props.whitelist.includes(building.type)) {
                                    return null;
                                }
                            }
                            let canBuild = playerCanBuild(building);

                            if (building.type === EntityType.FACTORY) {
                                canBuild = (props.game.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT ||
                                    props.game.state === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT) &&
                                    !player.hasFactory;
                            }

                            if ((building.type === EntityType.FACTORY && ((props.game.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT ||
                                props.game.state === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT) && !player.hasFactory)) ||
                                (building.type !== EntityType.FACTORY && props.game.state !== GameStateTypes.PLAYER_1_INITIAL_PLACEMENT && props.game.state !== GameStateTypes.PLAYER_2_INITIAL_PLACEMENT)) {
                                let className = canBuild ? (props.selectedBuilding === building.type ? 'selected previewContainer' : 'canbuild previewContainer') : 'previewContainer';
                                return <div className={className} key={i}>
                                    <div className={building.className + (canBuild ? ' enabled preview' : ' disabled preview')} 
                                         style={{ backgroundImage: 'url(/images/toolbar_icon_palette.png)' }} onClick={() => {
                                        tapBuilding(building.type);
                                        if (canBuild) {
                                            Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                            selectBuilding(building.type);
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
        </div>
    );
}

const mapStateToProps = state => ({
    game: state.gameplay.game,
    selectedBuilding: state.ui.selectedBuilding,
    whitelist: state.ui.whitelistBuildings,
    donutHighlighting: state.ui.donutHighlighting
});

const mapDispatchToProps = {
    selectBuilding,
    tapBuilding,
    toggleDonutHighlighting
};

const BuildingPaletteContainer = connect(
    mapStateToProps,
    mapDispatchToProps
)(BuildingPalette);

export default BuildingPaletteContainer;