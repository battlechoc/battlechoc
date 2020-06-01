import React from 'react';
import { connect } from 'react-redux';
import { multiplayer } from '../../Multiplayer';
import { selectBuilding, tapBuilding, toggleDonutHighlighting } from '../UiActions';
import { GameStateTypes, EntityType, getEntityDescriptor } from 'battlechoc-shared-functions';
import { Jukebox } from '../misc';
import Fab from './Fab';
import { createUseStyles } from 'react-jss';

const useStyles = createUseStyles(theme => ({
    container: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        zIndex: 1,
    },
    palette: {
        marginBottom: 5,
        marginLeft: 5,
        display: 'flex',
        [theme.breakpoints.orientation.portrait]: {
            width: '80vw',
            flexWrap: 'wrap'
        },
        [theme.breakpoints.orientation.square]: {
            width: 'unset',
            flexWrap: 'unset'
        }
    },
    preview: {
        marginRight: 5,
        border: `0.4vw solid ${theme.color.secondary.dark}`,
        borderRadius: '50%',
        background: 'linear-gradient(0deg, #3DA2CE 0%, #9DD5E9 80%)',
        '& > div': {
            backgroundSize: '100% 100%',
            backgroundRepeat: 'no-repeat',
            [theme.breakpoints.orientation.portrait]: {
                width: '12vw',
                height: '12vw',
            },
            [theme.breakpoints.orientation.landscape]: {
                width: '7vw',
                height: '7vw',
                maxWidth: '12vh',
                maxHeight: '12vh'
            },
            [theme.breakpoints.orientation.square]: {
                  width: 'calc(3.5vh + 3.5vw)',
                  height: 'calc(3.5vh + 3.5vw)',
            }
        }
    },
    donut: { 
        marginRight: 5,
        [theme.breakpoints.orientation.portrait]: {
            width: '12vw',
            height: '12vw',
        },
        [theme.breakpoints.orientation.landscape]: {
            width: '7vw',
            height: '7vw',
            maxWidth: '12vh',
            maxHeight: '12vh'
        },
        [theme.breakpoints.orientation.square]: {
              width: 'calc(3.5vh + 3.5vw)',
              height: 'calc(3.5vh + 3.5vw)',
        }
    },
    disabled: {
        filter: 'brightness(20%)'
    },
    selected: {
        border: `0.4vw solid ${theme.color.gold.light}`,
        '& > div': {
            borderRadius: '100%',
            filter: 'brightness(120%)'
        }
    },
    locked: {
        display: 'flex',
        justifyContent: 'center',
        border: `0.4vw solid ${theme.color.accent.dark}`,
        background: `linear-gradient(0deg, ${theme.color.accent.dark} 0%, ${theme.color.accent.light} 80%)`,
        '& > div': {
            padding: '2.8vw',
            backgroundImage: 'url(/images/lock.svg)',
            [theme.breakpoints.orientation.portrait]: {
                padding: '4.5vw'
            },
            [theme.breakpoints.orientation.square]: {
                padding: '2.8vw'
            }
        },
        [theme.breakpoints.orientation.portrait]: {
            width: '12vw',
            height: '12vw',
        },
        [theme.breakpoints.orientation.landscape]: {
            width: '7vw',
            height: '7vw',
            maxWidth: '12vh',
            maxHeight: '12vh'
        },
        [theme.breakpoints.orientation.square]: {
              width: 'calc(3.5vh + 3.5vw)',
              height: 'calc(3.5vh + 3.5vw)',
        }
    }
}));

const BuildingPalette = props => {
    const classes = useStyles();
    const player = props.game.players[multiplayer.localPlayerIndex];
    const buildingsForSeclection = [{
        type: EntityType.FACTORY,
        image: 'factory',
        costs: getEntityDescriptor(EntityType.FACTORY, player.level).costs
    }, {
        type: EntityType.CACAOTREE,
        image: 'cacao-tree',
        costs: getEntityDescriptor(EntityType.CACAOTREE, player.level).costs
    }, {
        type: EntityType.RUM_TRUFFLE_CANNON,
        image: 'truffle-cannon',
        costs: getEntityDescriptor(EntityType.RUM_TRUFFLE_CANNON, player.level).costs
    }, {
        type: EntityType.CREAM,
        image: 'cream',
        costs: getEntityDescriptor(EntityType.CREAM, player.level).costs
    }, {
        type: EntityType.FACTORY_EXTENSION,
        image: 'factory-extension',
        costs: getEntityDescriptor(EntityType.FACTORY_EXTENSION, player.level).costs
    }, {
        type: EntityType.SPYING_EASTER_BUNNY,
        image: 'easter-bunny',
        costs: getEntityDescriptor(EntityType.SPYING_EASTER_BUNNY, player.level).costs
    }, {
        type: EntityType.XMAS_FACTORY,
        image: 'xmas-factory',
        costs: getEntityDescriptor(EntityType.XMAS_FACTORY, player.level).costs
    }, {
        type: EntityType.CHOCOLATE_FOUNTAIN,
        image: 'fountain',
        costs: getEntityDescriptor(EntityType.CHOCOLATE_FOUNTAIN, player.level).costs
    }, {
        type: EntityType.FRUIT_CANNON,
        image: 'fruit-cannon', 
        costs: getEntityDescriptor(EntityType.FRUIT_CANNON, player.level).costs
    },{
        type: EntityType.DONUT_FACTORY,
        image: 'donut-factory',
        costs: getEntityDescriptor(EntityType.DONUT_FACTORY, player.level).costs
    }];


    const buildingSelectionIsVisible = () => {
        return (props.game.state === GameStateTypes.BUILD_PHASE ||
            props.game.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT ||
            props.game.state === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT) &&
            multiplayer.isLocalPlayer(props.game.currentPlayerIndex);
    }

    const playerCanBuild = building => {
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

    const tapBuilding = buildingType => {
        props.tapBuilding(buildingType);
    }

    const selectBuilding = buildingType => {
        props.selectBuilding(buildingType);      
    }

    const getDonutImage = donut => {
        if (donut.type === EntityType.DONUT_PORTAL_BLUE || donut.type === EntityType.DONUT_PORTAL_RED) {
            return 'portal-donut';
        } else if (donut.type === EntityType.DONUT_SURPRISE_YELLOW) {
            return 'surprise-donut';
        } else if (donut.type === EntityType.DONUT_HEALTH_GREEN) {
            return 'health-donut';
        } else if (donut.type === EntityType.DONUT_STOP_PINK) {
            return 'stop-donut';
        } else if (donut.type === EntityType.DONUT_CREAM_WHITE) {
            return 'cream-donut';
        }
    } 

    let donutSelection = null;
    
    if (player.donuts.length > 0 || player.activeDonuts.length > 0) { 
        donutSelection = <div className={classes.palette}>
            { player.activeDonuts.length > 0 ? <Fab
                color="secondary"
                className={classes.donut}
                icon={ props.donutHighlighting ? 'donuts-disabled' : 'donuts-enabled' }
                onClick={() => props.toggleDonutHighlighting() } /> : null
            }
            { player.donuts.length > 0 ? <div className={`${classes.preview} ${props.selectedBuilding === player.donuts[0].type ? classes.selected : ''}`}>
                <div style={{ backgroundImage: `url(/images/${getDonutImage(player.donuts[0])}-icon.svg)` }}  onClick={() => {
                    tapBuilding(player.donuts[0].type);
                    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                    selectBuilding(player.donuts[0].type);
                }} />
            </div> : null }
        </div>
    }

    let whitelist = props.whitelist;
    if (!props.tutorial) {
        if ( props.score < 1) {
            whitelist = [EntityType.FACTORY, EntityType.CACAOTREE, EntityType.RUM_TRUFFLE_CANNON, EntityType.CREAM];
        } else if (props.score < 200) {
            whitelist = [EntityType.FACTORY, EntityType.FACTORY_EXTENSION, EntityType.CACAOTREE, EntityType.RUM_TRUFFLE_CANNON, EntityType.CREAM];
        } else if (props.score < 500) {
            whitelist = [EntityType.FACTORY, EntityType.FACTORY_EXTENSION, EntityType.CACAOTREE, EntityType.RUM_TRUFFLE_CANNON, EntityType.CREAM, EntityType.SPYING_EASTER_BUNNY, EntityType.XMAS_FACTORY];
        } else if (props.score < 1000) {
            whitelist = [EntityType.FACTORY, EntityType.FACTORY_EXTENSION, EntityType.CACAOTREE, EntityType.RUM_TRUFFLE_CANNON, EntityType.CREAM, EntityType.SPYING_EASTER_BUNNY, EntityType.XMAS_FACTORY, EntityType.FRUIT_CANNON, EntityType.CHOCOLATE_FOUNTAIN];
        }
    }

    return (
        <div className={classes.container}>
            { buildingSelectionIsVisible() ? donutSelection : null }
            <div className={classes.palette}>
                {(() => {
                    if (buildingSelectionIsVisible()) {
                        return buildingsForSeclection.map((building, i) => {
                            if (typeof whitelist !== 'undefined') {
                                if (!whitelist.includes(building.type)) {
                                    if (!props.tutorial && props.game.state !== GameStateTypes.PLAYER_1_INITIAL_PLACEMENT && props.game.state !== GameStateTypes.PLAYER_2_INITIAL_PLACEMENT) {
                                        return <div className={`${classes.preview} ${classes.locked}`} key={i}><div /></div>;
                                    } else {
                                        return null
                                    }
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
                                return <div className={`${classes.preview} ${props.selectedBuilding === building.type ? classes.selected : ''} ${canBuild ? '' : classes.disabled}`} key={i}>
                                    <div style={{ backgroundImage: `url(/images/${building.image}-icon.svg)` }} onClick={() => {
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
    donutHighlighting: state.ui.donutHighlighting,
    score: state.ui.playerInfos.stats.score,
    tutorial: state.ui.tutorial
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

export { BuildingPaletteContainer as BuildingPalette, useStyles as sharedPaletteStyles } ;