import React, { useState } from 'react';
import { updatePlayerStats, updateLevel, showQuickMessage } from '../UiActions';
import { translate as t, keys as tr } from '../misc';
import { connect } from 'react-redux';
import { getEntityDescriptor, finalLevel, EntityType } from 'battlechoc-shared-functions';
import { ChoclabPalette, Button } from '../controls';
import MeshPreview from '../../3d/MeshPreview';
import { createUseStyles, useTheme } from 'react-jss';
import { ServerRequest } from '../../helper/settings';
import logger from '../../helper/logger';
import OfflineStore from '../../OfflineStore';

const useStyles = createUseStyles(theme => ({
    page: {
        display: 'flex',
        zIndex: 2,
        position: 'absolute',
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'Bangers',
        color: 'white',
        '-webkit-text-stroke': `1px ${theme.color.secondary.dark}`,
        '-webkit-font-smoothing': 'antialiased'
    },
    entity: {
        display: 'flex',
        flexGrow: 1,
        flexDirection: 'column',
        alignItems: 'center',
        '& > canvas': {
            marginTop: 24,
            width: '80vw',
            height: 'calc(35vh - 24px)'
        }
    },
    coins: {
        position: 'absolute',
        top: 5,
        right: 5,
        display: 'flex',
        alignItems: 'center',
        zIndex: 1,
        '& span': {
            fontSize: '2.5rem',
            color: '#fff',
            '-webkit-text-stroke': '1px #3C1C0C',
            '-webkit-font-smoothing': 'antialiased',
            fontFamily: 'Bangers',
            marginRight: 10
        },
        '& > div': {
            background: 'url(/images/coins.svg) no-repeat',
            height: 39,
            width: 57
        }
    },
    costs: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        '& > div > span': {
            fontSize: '1.5rem !important',
        },
        '& > div > div': {
            width: 43,
            height: 29
        },
        '& > div': {
            position: 'unset !important'
        }
    },
    cacao: {
        width: 38,
        height: 26,
        marginLeft: 6,
        background: `url(/images/cacao.svg) no-repeat`, 
        backgroundSize: '100% 100%'
    },
    section: {
        background: `linear-gradient(0deg, ${theme.color.secondary.dark} 0%, ${theme.color.secondary.light} 70%)`,
        width: '100%',
        display: 'flex',
        flexGrow: 1,
        justifyContent: 'center',
        position: 'relative'
    },
    palette: {
        position: 'absolute',
        top: -36
    },
    decorationLeft: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '59%',
        height: 108,
        background: 'url(/images/choclab-decoration-left.svg) no-repeat' 
    },
    decorationRight: {
        position: 'absolute', 
        top: 0,
        right: 0,
        width: '39%',
        height: 135,
        background: 'url(/images/choclab-decoration-right.svg) no-repeat',
        backgroundPosition: 'right',
    },
    attributes: {
        marginTop: 42,
        width: '80%',
        display: 'flex',
        flexDirection: 'column'
    },
    progress: {
        '& > div:first-child': {
            paddingTop: 6
        },
        '& > div:last-child': {
            height: 24,
            border: `3px solid ${theme.color.secondary.dark}`,
            borderRadius: 12,
            background: 'linear-gradient(0deg, #3DA2CE 0%, #9DD5E9 80%)',
            position: 'relative',
            overflow: 'hidden'
        },
        '& div div': {
            position: 'absolute',
            height: '100%'
        }
    },
    hp: { 
        background: `linear-gradient(0deg, ${theme.color.primary.dark} 0%, ${theme.color.primary.light} 70%)`,
    },
    buildingsPerTurn: { 
        background: `linear-gradient(0deg, ${theme.color.secondary.dark} 0%, ${theme.color.secondary.light} 70%)`,
    },
    cacaoPerTurn: { 
        background: `linear-gradient(0deg, ${theme.color.secondary.dark} 0%, ${theme.color.secondary.light} 70%)`,
    },
    area: { 
        background: `linear-gradient(0deg, ${theme.color.accent.dark} 0%, ${theme.color.accent.light} 70%)`,
    },
    attack: { 
        background: `linear-gradient(0deg, ${theme.color.accent.dark} 0%, ${theme.color.accent.light} 70%)`,
    },
    donutProbability: { 
        background: `linear-gradient(0deg, ${theme.color.primary.dark} 0%, ${theme.color.primary.light} 70%)`,
    },
    donutTypes: { 
        background: `linear-gradient(0deg, ${theme.color.accent.dark} 0%, ${theme.color.accent.light} 70%)`
    },
    forecast: { opacity: 0.4 },
    label: {
        display: 'flex',
        alignItems: 'center',
        fontSize: '1.5rem',
        '& span:first-child': {
            marginLeft: 6,
            marginRight: 6
        }
    },
    upgrade: {
        display: 'flex',
        alignItems: 'center',
        '& span:last-child': {
            color: '#5bb9bf'
        }
    },
    container: {
        display: 'flex',
        marginTop: 12,
        fontSize: '1.5rem'
    },
    icon: {
        width: 42,
        height: 42,
        marginLeft: -24,
        marginTop: -6,
        background: `url(/images/lab.svg) no-repeat`, 
        backgroundSize: '100% 100%'
    },
    title: {
        zIndex: 12,
        marginTop: 6,
        fontSize: '2rem',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
    },
    level: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '1.6rem',        
    },
    levelup: {
        width: 32,
        height: 32,
        marginLeft: 12,
        marginRight: 6,
        background: `url(/images/level-up-icon.svg) no-repeat`, 
        backgroundSize: '100% 100%'
    },
    actions: {
        display: 'flex',
        justifyContent: 'space-around',
        margin: '5px 0'
    },
    button: {
        width: 144,
        height: 72
    }
}));

const Choclab = props => {
    const theme = useTheme()
    const classes = useStyles();
    const [selectedEntity, setSelectedEntity] = useState(getEntityDescriptor(EntityType.FACTORY, props.level));
    const [updateRunning, setUpdateRunning] = useState(false)
    
    let entityType = selectedEntity.type;
    let currentEntity = getEntityDescriptor(entityType, props.level);
    let upgradePossible = props.level[entityType] < ( selectedEntity.hasOwnProperty('level') ? selectedEntity.level.max - 1 : finalLevel ); 
    let downgradePossible = props.level[entityType] > 0;
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
                props.showQuickMessage({ text: t(tr.UPDATE_LEVEL_FAILED, upgrade) });
            })
            .finally(() => setUpdateRunning(false));
        }
    }

    return (
        <div className={classes.page}>
            <div className={classes.coins}>
                <span>{ props.playerInfos.stats.coins }</span>
                <div />
            </div>
            <div className={classes.entity}> 
                <MeshPreview selectedEntity={selectedEntity} />

                <div className={classes.section}>
                    <div className={classes.decorationLeft} /><div className={classes.decorationRight} />
                    <ChoclabPalette className={classes.palette} selectEntity={entity => setSelectedEntity(getEntityDescriptor(entity, props.level))} />
                    <div className={classes.attributes}>
                        <div className={classes.title}>
                            <span className={classes.icon} />
                            <span>{t(tr.TOOLTIP_BUILDING_TITLE, entityType)}</span>
                        </div>
                        { upgradePossible ? 
                            <div className={classes.level}>
                                <span>{t(tr.CHOCLAB_LEVEL)} {props.level[entityType] + 1}</span>
                                <span className={classes.levelup} />
                                <span>{ props.level[entityType] + 2 }</span>
                            </div> : null
                        }

                        <div className={classes.actions}>
                            { upgradePossible ? 
                                <Button className={classes.button} disabled={!upgradePossible || updateRunning || props.playerInfos.stats.coins < currentEntity.coins} onClick={() => {
                                        if (upgradePossible && !updateRunning && props.playerInfos.stats.coins >= currentEntity.coins) {
                                            updateLevel(entityType);
                                        }
                                    }
                                }><div className={classes.costs}>
                                    <span style={{ '-webkit-text-stroke': `1px ${theme.color.primary.dark}`, }}>{t(tr.CHOCLAB_UPGRADE)}</span>
                                    <div className={classes.coins}>
                                        <span style={{ '-webkit-text-stroke': `1px ${theme.color.primary.dark}`, }}>{ currentEntity.coins }</span>
                                        <div />
                                    </div>
                                </div></Button> : null 
                            }

                            <Button className={classes.button} color="accent" disabled={!downgradePossible || updateRunning } onClick={() => {
                                if (downgradePossible) {
                                    updateLevel(entityType, false)
                                }
                            }}><div className={classes.costs}>
                                <span style={{ '-webkit-text-stroke': `1px ${theme.color.accent.dark}`, }}>{t(tr.CHOCLAB_DOWNGRADE)}</span>
                                { downgradePossible ? <div className={classes.coins}>
                                    <span style={{ '-webkit-text-stroke': `1px ${theme.color.accent.dark}`, }}>-{ Math.round(downgradedEntity.coins * 0.666) }</span>
                                    <div />
                                </div> : null }
                            </div></Button>
                        </div>

                        { selectedEntity ? Object.keys(selectedEntity)
                            .filter(field => ['hp','area','buildingsPerTurn','cacaoPerTurn','attack','donutProbability','donutTypes'].includes(field)).map(attribute => {
                            let percentage = (currentEntity[attribute] / highlyDevelopedEntity[attribute]) * 100;
                            let percentageForcast = (upgradedEntity[attribute] / highlyDevelopedEntity[attribute]) * 100;
                            let attributeDescription = <span className={classes.upgrade}>{currentEntity[attribute]}</span>;

                            if (upgradePossible) {
                                attributeDescription = <><span style={{ flexGrow: 1 }}>{currentEntity[attribute]}</span><span className={classes.levelup} /><span>{upgradedEntity[attribute]}</span></>;
                            }

                            return (
                                <div className={classes.progress} key={attribute}>
                                    <div className={classes.label}><span>{ t(tr.ATTRIBUTE_NAME, attribute) }</span>{attributeDescription}</div>
                                    <div>
                                        <div className={classes[attribute]} style={{ width: percentage + '%'}}></div>
                                        { upgradePossible ? <div className={`${classes[attribute]}  ${classes.forecast}`} style={{ width: percentageForcast + '%'}}></div> : null }
                                    </div>
                                </div>
                            )
                        })  : null }
                        { ![EntityType.FACTORY, EntityType.HOT_CHOCOLATE_BALLISTA].includes(entityType) ? <div className={classes.container}>
                                <span>{ currentEntity.costs }</span>
                                <div className={classes.cacao} />
                                { upgradePossible ? <>
                                    <span style={{ flexGrow: 1 }} />
                                    <span className={classes.levelup} />
                                    <span>{ upgradedEntity.costs }</span>
                                    <div className={classes.cacao} />
                                </> : null }
                        </div> : null }
                    </div>
                </div>
            </div>
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