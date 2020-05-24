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
        WebkitTextStroke: `1px ${theme.color.secondary.dark}`,
        '-webkit-font-smoothing': 'antialiased',
        [theme.breakpoints.orientation.portrait]: {
            WebkitTextStroke: `0.15vh ${theme.color.secondary.dark}`
        },
        [theme.breakpoints.orientation.landscape]: {
            WebkitTextStroke: `0.15vw ${theme.color.secondary.dark}`
        }
    },
    entity: {
        display: 'flex',
        flexGrow: 1,
        flexDirection: 'column',
        alignItems: 'center',
        '& > canvas': {
            marginTop: 24,
            width: '80vw',
            height: 'calc(40vh - 24px)'
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
            color: '#fff',
            '-webkit-font-smoothing': 'antialiased',
            fontFamily: 'Bangers',
            marginRight: '1.5vw',
            fontSize: 'calc(3.5vh + 3.5vw)',
            WebkitTextStroke: 'calc(0.08vh + 0.08vw) #3C1C0C'
        },
        '& > div': {
            background: 'url(/images/coins.svg) no-repeat',
            padding: 'calc(2vh + 2vw) calc(3vh + 3vw)'
        }
    },
    cacao: {
        background: `url(/images/cacao.svg) no-repeat`, 
        backgroundSize: '100% 100%',
        [theme.breakpoints.orientation.portrait]: {
            padding: '2vh 4vh',
            marginRight: '-2vh',
        },
        [theme.breakpoints.orientation.landscape]: {
            padding: '3vh 6vh',
            marginRight: '-3vh',
        }
    },
    section: {
        background: `linear-gradient(0deg, ${theme.color.secondary.dark} 0%, ${theme.color.secondary.light} 70%)`,
        width: '100%',
        display: 'flex',
        flexGrow: 1,
        justifyContent: 'center',
        position: 'relative',
        [theme.breakpoints.orientation.landscape]: {
            alignItems: 'flex-start',
            paddingTop: '5vh'
        }
    },
    palette: {
        position: 'absolute',
        [theme.breakpoints.orientation.landscape]: {
            top: '-9vh',
            '& > div:first-child, & > div:last-child': {
                height: '7vh',
                width: '7vh',
                borderWidth: '0.5vh'
            }
        },
        [theme.breakpoints.orientation.portrait]: {
            top: '-7vh',
            '& > div:first-child, & > div:last-child': {
                height: '7vh',
                width: '7vh',
                borderWidth: '0.5vh'
            }
        }
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
        backgroundPositionY: 'top',
        backgroundPositionX: 'right',
    },
    attributes: {
        width: '95%',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        [theme.breakpoints.orientation.landscape]: {
            justifyContent: 'center',
            marginTop: 12
        },
        [theme.breakpoints.orientation.portrait]: {
            justifyContent: 'flex-start',
            marginTop: 18,
            '@media screen and (min-width: 360px)': {
                width: '90%'
            }
        }
    },
    progress: {
        '& > div:first-child': {
            paddingTop: 6
        },
        '& > div:last-child': {
            background: 'linear-gradient(0deg, #3DA2CE 0%, #9DD5E9 80%)',
            position: 'relative',
            overflow: 'hidden'
        },
        '& div div': {
            position: 'absolute',
            height: '100%'
        },
        '@media screen and (min-height: 720px)': {
               
        },
        [theme.breakpoints.orientation.landscape]: {
            width: '30%',
            marginLeft: 6,
            marginRight: 6,
            '& > div:last-child': {
                height: '5vh',
                border: `3px solid ${theme.color.secondary.dark}`,
                borderRadius: '2.5vh'
            }
        },
        [theme.breakpoints.orientation.portrait]: {
            width: 'unset',
            '& > div:last-child': {
                height: 12,
                border: `2px solid ${theme.color.secondary.dark}`,
                borderRadius: 6
            },
            '@media screen and (min-height: 600px)': {
                '& > div:last-child': {
                    border: `3px solid ${theme.color.secondary.dark}`,
                    height: '3vh',
                    borderRadius: '1vh'

                }
            }
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
        marginLeft: 6,
        marginRight: 6,
        '& > span:last-child': {
            display: 'flex',
            width: '100%'
        },
        '& > span:first-child': {
            width: 'max-content'
        },
        [theme.breakpoints.orientation.portrait]: {
            '& > span:first-child': {
                minWidth: 'max-content',
                marginRight: 12
            },
            fontSize: '3.4vh'
        },
        [theme.breakpoints.orientation.landscape]: {
            flexDirection: 'column',
            fontSize: '5vh'
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
        marginTop: 8,
        fontSize: '1.2rem',
        justifyContent: 'center',
        [theme.breakpoints.orientation.portrait]: {
            fontSize: '3.4vh'
        },
        [theme.breakpoints.orientation.landscape]: {
            fontSize: '6vh'
        }
    },
    icon: {
        background: `url(/images/lab.svg) no-repeat`,
        [theme.breakpoints.orientation.portrait]: {
            padding: '3vh',
            marginLeft: '-6vh'
        },
        [theme.breakpoints.orientation.landscape]: {
            padding: '4.5vh',
            marginLeft: '-8vh',
        }
    },
    header: {
        display: 'flex',
        flexDirection: 'column',
        width: '100%'
    },
    title: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        '& > span:last-child': {
            width: 'max-content'
        },
        [theme.breakpoints.orientation.portrait]: {
            marginTop: '4vh',
            fontSize: '5vh'
        },
        [theme.breakpoints.orientation.landscape]: {
            fontSize: '6vh',
            marginLeft: '3vh',
        }
    },
    subtitle: {
        display: 'flex',
        width: '100%',
        justifyContent: 'center',
        [theme.breakpoints.orientation.portrait]: {
            fontSize: '4vh'
        },
        [theme.breakpoints.orientation.landscape]: {
            fontSize: '6vh',
        }
    },
    level: {
        display: 'flex',
        minWidth: 'max-content',
        justifyContent: 'center',
        marginLeft: '1vw',
        marginRight: '1vw', 
        [theme.breakpoints.orientation.landscape]: {
            alignItems: 'center',
        },
        [theme.breakpoints.orientation.portrait]: {
            alignItems: 'flex-start',
            '@media screen and (min-width: 400px)': {
                marginLeft: '5vw',
                marginRight: '5vw'
            }
        }
    },
    levelup: {
        marginLeft: 12,
        marginRight: 6,
        background: `url(/images/level-up-icon.svg) no-repeat`, 
        backgroundSize: '100% 100%',
        [theme.breakpoints.orientation.portrait]: {
            padding: '2vh'
        },
        [theme.breakpoints.orientation.landscape]: {
            padding: '3vh'
        }
    },
    actions: {
        display: 'flex',
        justifyContent: 'space-between',
        [theme.breakpoints.orientation.portrait]: {
            marginTop: '-3vh',
            '@media screen and (min-height: 560px)': {
                marginTop: 6,
                justifyContent: 'center'
            }
        },
        [theme.breakpoints.orientation.landscape]: {
            marginTop: '-16vh',
            padding: '3vh'
        }
    },
    button: {
        [theme.breakpoints.orientation.landscape]: {
            width: '20vw',
            height: '15vh',
            marginTop: -16
        },
        [theme.breakpoints.orientation.portrait]: {
            width: 96,
            height: 68,
            '@media screen and (min-height: 560px)': {
                height: '10vh',
                width: '30vw',
                margin: '0 6vw'
            }
        }
    },
    costs: {
        display: 'flex',
        flexDirection: 'column',
        fontSize: 'calc(2vh + 2vw)',
        alignItems: 'center',
        '& > div': {
            display: 'flex',
            alignItems: 'center',
            '& span': {
                color: '#fff',
                WebkitTextStroke: '1px #3C1C0C',
                '-webkit-font-smoothing': 'antialiased',
                fontFamily: 'Bangers',
            },
            '& > div': {
                backgroundImage: 'url(/images/coins.svg)',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center',
                padding: '10px 20px',
                marginRight: '-10px'
            }
        },
        [theme.breakpoints.orientation.landscape]: {
            '& > div': {
                '& > div': {
                    padding: '3vh 6vh !important',
                    marginRight: '-3vh !important'
                }    
            }
        },
        [theme.breakpoints.orientation.portrait]: {
            '& > div': {
                '& > div': {
                    padding: '2vh 4vh !important',
                    marginRight: '-2vh !important'
                }    
            }
        }
    },
    properties: {
        display: 'flex',
        [theme.breakpoints.orientation.landscape]: {
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'flex-end',
            height: '20vh'
        },
        [theme.breakpoints.orientation.portrait]: {
            flexDirection: 'column',
            justifyContent: 'flex-start',
            '@media screen and (min-width: 400px)': {
                width: '90%',
                alignSelf: 'center'
            }
        }
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
                        <div className={classes.header}>
                            <div className={classes.title}>
                                <span className={classes.icon} />
                                <span>{t(tr.TOOLTIP_BUILDING_TITLE, entityType)}</span>
                            </div>

                            <div className={classes.subtitle}>
                                { upgradePossible ? 
                                <div className={classes.level}>
                                    <span>{t(tr.CHOCLAB_LEVEL)} {props.level[entityType] + 1}</span>
                                    <span className={classes.levelup} />
                                    <span>{ props.level[entityType] + 2 }</span>
                                </div> : null }
                            </div>

                            <div className={classes.actions}>
                                <Button className={classes.button} color="accent" disabled={!downgradePossible || updateRunning } onClick={() => {
                                    if (downgradePossible) {
                                        updateLevel(entityType, false)
                                    }
                                }}><div className={classes.costs}>
                                    <span style={{ WebkitTextStroke: `1px ${theme.color.accent.dark}`, }}>{t(tr.CHOCLAB_DOWNGRADE)}</span>
                                    { downgradePossible ? <div>
                                        <span style={{ WebkitTextStroke: `1px ${theme.color.accent.dark}`, }}>-{ Math.round(downgradedEntity.coins * 0.666) }</span>
                                        <div />
                                    </div> : null }
                                </div></Button>
                                { upgradePossible ? 
                                <Button className={classes.button} disabled={!upgradePossible || updateRunning || props.playerInfos.stats.coins < currentEntity.coins} onClick={() => {
                                        if (upgradePossible && !updateRunning && props.playerInfos.stats.coins >= currentEntity.coins) {
                                            updateLevel(entityType);
                                        }
                                    }
                                }><div className={classes.costs}>
                                    <span style={{ WebkitTextStroke: `1px ${theme.color.primary.dark}`, }}>{t(tr.CHOCLAB_UPGRADE)}</span>
                                    <div>
                                        <span style={{ WebkitTextStroke: `1px ${theme.color.primary.dark}`, }}>{ currentEntity.coins }</span>
                                        <div />
                                    </div>
                                </div></Button> : null }
                            </div>
                        </div>
                        <div className={classes.properties}>
                            { selectedEntity ? Object.keys(selectedEntity)
                                .filter(field => ['hp','area','buildingsPerTurn','cacaoPerTurn','attack','donutProbability','donutTypes'].includes(field)).map(attribute => {
                                let percentage = (currentEntity[attribute] / highlyDevelopedEntity[attribute]) * 100;
                                let percentageForcast = (upgradedEntity[attribute] / highlyDevelopedEntity[attribute]) * 100;
                                let attributeDescription = <span className={classes.upgrade}>{currentEntity[attribute]}</span>;

                                if (upgradePossible) {
                                    attributeDescription = <span><span style={{ flexGrow: 1 }}>{currentEntity[attribute]}</span><span className={classes.levelup} /><span>{upgradedEntity[attribute]}</span></span>;
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
                            </div>
                        { ![EntityType.FACTORY, EntityType.HOT_CHOCOLATE_BALLISTA].includes(entityType) ? <div className={classes.container}>
                                <span>{ currentEntity.costs }</span>
                                <div className={classes.cacao} />
                                { upgradePossible ? <>
                                    <span style={{ width: '20%' }} />
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