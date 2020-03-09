import React, { useState } from 'react';
import { updatePlayerStats, updateLevel, showQuickMessage } from '../UiActions';
import { translate as t } from '../misc';
import { connect } from 'react-redux';
import { getEntityDescriptor, finalLevel, EntityType } from 'battlechoc-shared-functions';
import { ChoclabPalette } from '../controls';
import MeshPreview from '../../3d/MeshPreview';
import { OptimizedImage } from '../../helper/compatibility';
import { makeStyles } from '@material-ui/core/styles';
import DoubleArrow from '@material-ui/icons/DoubleArrow';
import { ServerRequest } from '../../helper/settings';
import logger from '../../helper/logger';
import OfflineStore from '../../OfflineStore';

const useStyles = makeStyles(theme => ({
    page: {
        display: 'flex',
        zIndex: 2,
        position: 'absolute',
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        overflow: 'hidden'
    },
    entity: {
        display: 'flex',
        flexGrow: 1,
        flexDirection: 'row',
        '& > canvas': {
            marginTop: 60,
            width: '50vw',
            height: 'calc(80vh - 60px)'
        },
        '@media screen and (max-width: 600px) and (orientation: portrait)': {
            flexDirection: 'column',
            alignItems: 'center',
            '& > canvas': {
                marginTop: 36,
                width: '80vw',
                height: 'calc(30vh - 36px)'
            }
        }
    },
    coins: {
        position: 'absolute',
        top: 5,
        right: 0,
        display: 'flex',
        '& span': {
            fontSize: '2rem',
            color: '#5bb9bf',
            textShadow: '0px 2px 2px #324D5C',
            fontWeight: 'bold',
            marginRight: 5
        },
        '& img': {
            height: 48
        },
        '@media screen and (max-width: 959px)': {
            '& img': {
                height: 40
            },
            '& span': {
                fontSize: '1.8rem'
            }
        },
        '@media screen and (max-width: 600px)': {
            '& img': {
                height: 36
            }
        }
    },
    costs: {
        justifyContent: 'flex-end',
        display: 'flex',
        alignItems: 'center',
        '& img': {
            filter: 'drop-shadow(0px 5px 5px rgba(0,0,0,0.3))',
            height: 32,
            margin: '0 5px',
            '@media screen and (max-width: 900px)': {
                height: 28
            }
        },
        '& span': {
            fontSize: '1.2rem',
            color: '#5bb9bf',
            fontWeight: 'bold',
            '@media screen and (max-width: 900px)': {
                fontSize: '1rem'
            },
            '@media screen and (max-width: 600px)': {
                fontSize: '0.8rem',
            }
        }
    },
    cacao: {
        '& img': { filter: 'brightness(1.5)' }
    },
    attributes: {
        flexGrow: 1,
        padding: '20px',
        paddingTop: '15vh',
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        boxShadow: '2px 2px 6px rgba(0,0,0,0.6)',
        display: 'flex',
        flexDirection: 'column',
        '& h3': { margin: '0', color: '#324D5C' },
        '& h4': { margin: '0', color: '#324D5C' },
        '@media screen and (max-width: 600px) and (orientation: portrait)': {
            paddingTop: 5,
            marginRight: 0,
            marginTop: 0,
            width: '100vw',
            fontSize: '0.8rem',
            '& > *': {
                marginLeft: '22vw',
                marginRight: '5vw',
            },
            '& h3': { margin: '0.5rem 5vw 0.5rem 22vw' },
            '& h4': { margin: '0.5rem 5vw 0.5rem 22vw' }
        },
        '@media screen and (max-height: 400px) and (orientation: landscape)': {
            '& h3': { fontSize: '1rem' },
            '& h4': { fontSize: '0.9rem' },
            '& > div > div > span': { fontSize: '0.9rem' }
        }
    },
    progress: {
        '& > div:first-child': {
            paddingTop: 12
        },
        '& > div:last-child': {
            height: 28,
            borderRadius: 3,
            background: 'rgba(0,0,0, 0.1)',
            position: 'relative'
        },
        '& div div': {
            position: 'absolute',
            height: '100%'
        },
        '@media screen and (max-height: 600px)': {
            '& > div:first-child': {
                paddingTop: 4
            },
            '& > div:last-child': {
                height: 18,
            }
        },
        '@media screen and (max-height: 400px)': {
            '& > div:first-child': {
                paddingTop: 2
            }
        }
    },
    hp: { backgroundColor: 'rgb(50, 77, 92)' },
    buildingsPerTurn: { backgroundColor: 'rgb(69, 123, 130)' },
    cacaoPerTurn: { backgroundColor: 'rgb(69, 123, 130)' },
    area: { backgroundColor: 'rgb(69, 123, 130)' },
    attack: { backgroundColor: 'rgb(91, 47, 25)' },
    donutProbability: { backgroundColor: 'rgb(69, 123, 130)' },
    donutTypes: { backgroundColor: 'rgb(91, 47, 25)' },
    donutProbabilityForecast: { backgroundColor: 'rgba(69, 123, 130, 0.4)' },
    donutTypesForecast: { backgroundColor: 'rgba(91, 47, 25, 0.4)' },
    hpForecast: { backgroundColor: 'rgba(50, 77, 92, 0.4)' },
    buildingsPerTurnForecast: { backgroundColor: 'rgba(69, 123, 130, 0.4)' },
    cacaoPerTurnForecast: { backgroundColor: 'rgba(69, 123, 130, 0.4)' },
    areaForecast: { backgroundColor: 'rgba(69, 123, 130, 0.4)' },
    attackForecast: { backgroundColor: 'rgba(91, 47, 25, 0.4)' },
    label: {
        display: 'flex',
        alignItems: 'flex-end',
        color: 'rgba(0,0,0,0.87)',
        '& span:first-child': {
            flexGrow: 1
        },
        '& span': {
            color: '#324D5C'
        }
    },
    upgrade: {
        display: 'flex',
        alignItems: 'center',
        '& svg': {
            color: '#5bb9bf'
        },
        '& span:last-child': {
            color: '#5bb9bf'
        }
    },
    container: {
        display: 'flex',
        alignItems: 'baseline',
        margin: '1rem 0',
        justifyContent: 'flex-end',
        '& svg': {
            color: '#5bb9bf'
        },
        '@media screen and (max-width: 600px)': {
            margin: '0.5rem 5vw 0.5rem 0'
        }
    },
    button: {
        display: 'flex',
        alignItems: 'center',
        cursor: 'pointer',
        fontSize: '1.2rem',
        color: '#f3f7df',
        marginTop: 15,
        fontWeight: 'bold',
        backgroundColor: 'rgb(69, 123, 130)',
        padding: 12,
        userSelect: 'none',
        position: 'relative',
        justifyContent: 'center',
        boxShadow: '1px 1px 6px #324D5C',
        textShadow: '0px 2px 2px #324D5C',
        '& > div': { position: 'absolute', right: 0 },
        '& > span': { color: '#fff' },
        '& > div > span': {
            color: '#fff'
        },
        '@media screen and (max-width: 900px)': {
            fontSize: '1rem',
        },
        '@media screen and (max-width: 800px)': {
            justifyContent: 'flex-start',
            '& > span': {
                marginLeft: 15
            }
        },
        '@media screen and (max-width: 600px)': {
            fontSize: '0.8rem',
        },
        '@media screen and (max-height: 400px)': {
            padding: 8,
        }        
    },
    downgrade: {
        backgroundColor: 'rgb(50, 77, 92)'
    },
    inactive: {
        backgroundColor: '#666',
        cursor: 'unset',
        textShadow: '0px 2px 2px #324D5C'
    },
    actions: {
        marginTop: '5vh',
        '@media screen and (max-height: 400px) and (orientation: landscape)': {
            marginTop: '2vh'
        }
    }
}));

const Choclab = props => {
    const classes = useStyles();
    const [selectedEntity, setSelectedEntity] = useState(getEntityDescriptor(EntityType.FACTORY, props.level));
    const [updateRunning, setUpdateRunning] = useState(false)
    
    let entityType = selectedEntity.type;
    let currentEntity = getEntityDescriptor(entityType, props.level);
    let upgradePossible = props.level[entityType] < ( selectedEntity.hasOwnProperty('level') ? selectedEntity.level.max - 1 : finalLevel ); 
    let downgradePossible = props.level[entityType] > 0;
    let nextLevelDescription = <h4 className={classes.upgrade}>{`Level ${props.level[entityType] + 1}`}</h4>
    let level = { [entityType]: finalLevel };
    let highlyDevelopedEntity = getEntityDescriptor(entityType, level);
    level[entityType] = props.level[entityType] + 1;
    let upgradedEntity = getEntityDescriptor(entityType, level);
    let downgradedEntity = null;
    if (downgradePossible) {
        level[entityType] = props.level[entityType] - 1;
        downgradedEntity = getEntityDescriptor(entityType, level);
    }

    let updateLevel = (entityType, upgrade=true) => {
        if (!updateRunning) {
            setUpdateRunning(true);
            ServerRequest('post', '/update/level', { entityType: entityType, upgrade: upgrade })
            .then(response => {
                props.updateLevel(response.data.level).then(() => {
                    props.updatePlayerStats({ 'coins': response.data.coins });
                    OfflineStore.playerStore.get('stats').then(playerStats => {
                        playerStats.coins = response.data.coins;
                        OfflineStore.playerStore.set('stats', playerStats);
                    });
                })
            })
            .catch(error => {
                logger.warn(error);
                props.showQuickMessage({ text: t('UPDATE_LEVEL_FAILED', upgrade) });
            })
            .finally(() => setUpdateRunning(false));
        }
    }

    if (upgradePossible) {
        nextLevelDescription = <h4 className={classes.upgrade}><span>{t('CHOCLAB_LEVEL')} {props.level[entityType] + 1}</span><DoubleArrow /><span>{ props.level[entityType] + 2 }</span></h4>
    }
    return (
        <div className={classes.page}>
            <div className={classes.coins}>
                <span>{ props.playerInfos.stats.coins }</span>
                <OptimizedImage src="/images/coins.png" alt="choco coins" />
            </div>
            <div className={classes.entity}> 
                <MeshPreview selectedEntity={selectedEntity} />

                <div className={classes.attributes}>
                    <h3>{t('TOOLTIP_BUILDING_TITLE', entityType)}</h3>
                    { nextLevelDescription }
                    { selectedEntity ? Object.keys(selectedEntity)
                        .filter(field => ['hp','area','buildingsPerTurn','cacaoPerTurn','attack','donutProbability','donutTypes'].includes(field)).map(attribute => {
                        let percentage = (currentEntity[attribute] / highlyDevelopedEntity[attribute]) * 100;
                        let percentageForcast = (upgradedEntity[attribute] / highlyDevelopedEntity[attribute]) * 100;
                        let attributeDescription = <span className={classes.upgrade}>{currentEntity[attribute]}</span>;

                        if (upgradePossible) {
                            attributeDescription = <span className={classes.upgrade}><span>{currentEntity[attribute]}</span><DoubleArrow /><span>{upgradedEntity[attribute]}</span></span>;
                        }

                        return (
                            <div className={classes.progress} key={attribute}>
                                <div className={classes.label}><span>{ t('ATTRIBUTE_NAME', attribute) }</span>{attributeDescription}</div>
                                <div>
                                    <div className={classes[attribute]} style={{ width: percentage + '%'}}></div>
                                    { upgradePossible ? <div className={classes[attribute + 'Forecast']} style={{ width: percentageForcast + '%'}}></div> : null }
                                </div>
                            </div>
                        )
                    })  : null }
                    { ![EntityType.FACTORY, EntityType.HOT_CHOCOLATE_BALLISTA].includes(entityType) ? <div className={classes.container}>
                        <div className={`${classes.costs} ${classes.cacao}`}>
                            <span>{ currentEntity.costs }</span>
                            <img src="/images/cacao_no_background.png" alt="cacao costs" />
                        </div> 
                        { upgradePossible ? [<DoubleArrow key={1} />,
                        <div key={2} className={`${classes.costs} ${classes.cacao}`}>
                            <span>{ upgradedEntity.costs }</span>
                            <img src="/images/cacao_no_background.png" alt="cacao costs" />
                        </div>] : null }
                    </div> : null }
                    <div className={classes.actions}>
                        { entityType !== EntityType.CREAM  && upgradePossible ? 
                            <div className={`${classes.button} ${!upgradePossible || updateRunning || props.playerInfos.stats.coins < currentEntity.coins ? classes.inactive : null}`} onClick={() => {
                                    if (upgradePossible && !updateRunning && props.playerInfos.stats.coins >= currentEntity.coins) {
                                        updateLevel(entityType);
                                    }
                                }
                            }>
                                <span>{t('CHOCLAB_UPGRADE')}</span>
                                <div className={classes.costs}>
                                    <span>{ currentEntity.coins }</span>
                                    <OptimizedImage src="/images/coins.png" alt="choco coins" />
                                </div>
                            </div> : null 
                        }

                        { entityType !== EntityType.CREAM ?
                            <div className={`${classes.button} ${classes.downgrade} ${!downgradePossible || updateRunning ? classes.inactive : null}`} onClick={() => {
                                if (downgradePossible) {
                                    updateLevel(entityType, false)
                                }
                            }}>
                                <span>{t('CHOCLAB_DOWNGRADE')}</span>
                                { downgradePossible ? <div className={classes.costs}>
                                    <span>-{ Math.round(downgradedEntity.coins * 0.666) }</span>
                                    <OptimizedImage src="/images/coins.png" alt="choco coins" />
                                </div> : null }
                            </div> : null 
                        }
                    </div>
                </div>
            </div>
            <ChoclabPalette selectEntity={entity => setSelectedEntity(getEntityDescriptor(entity, props.level))} />
        </div>
    );
}

const mapStateToProps = state => ({
    game: state.gameplay.game,
    level: state.ui.playerInfos.stats.level,
    playerInfos: state.ui.playerInfos
});

const mapDispatchToProps = {
    updateLevel,
    updatePlayerStats,
    showQuickMessage
};

const ChoclabContainer = connect(
    mapStateToProps,
    mapDispatchToProps
)(Choclab);

export default ChoclabContainer;