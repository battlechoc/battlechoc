import React, { useState, useEffect, useCallback } from 'react';
import './Hud.css';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { GameStateTypes } from 'battlechoc-shared-functions';
import { showQuickMessage, showNotification, hideNotification } from './UiActions';
import { translate as t, keys as tr } from './misc';
import { Info, Tooltip, Settings, AccountOverview, Dialog, Highscore } from './dialogs';
import MultiplayerScreen from './pages/MultiplayerScreen';
import Choclab from './pages/Choclab';
import { multiplayer } from '../Multiplayer';
import { ServerRequest } from '../helper/settings';
import logger from '../helper/logger';
import firebase from '@firebase/app';
import { Button, Fab, Progress, Actionbar, InfoPanel, BuildingPalette, AttackPalette, GameStartSelection, GameEndOverview } from './controls';
import { createUseStyles } from 'react-jss'

const useStyles = createUseStyles(theme => ({
    actionbar: {
        position: 'absolute',
        top: 5,
        left: 5,
        zIndex: 5
    },
    logo: {
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        overflow: 'hidden',
        '& > :first-child': {
            position: 'absolute',
            top: 70,
            width: 290,
            height: 222,
            background: 'url(/images/logo.svg) no-repeat',
            zIndex: 1,
            [theme.breakpoints.landscape.smartphone]: {
                top: 5,
                width: 232,
                height: 178
            }
        },
        '& > :last-child': {
            position: 'absolute',
            height: 1600,
            width: 1600,
            top: -700,
            marginLeft: -68,
            background: 'url(/images/stripes.svg) no-repeat',
            backgroundSize: 1600,
            zIndex: 0,
            animation: 'pulse 20s linear 0s infinite',
            [theme.breakpoints.landscape.smartphone]: {
                top: -765,
                marginLeft: -56
            }
        },        
    },
    menu: {
        display: 'flex',
        height: 230,
        justifyContent: 'space-between',
        flexDirection: 'column',
        position: 'absolute',
        top: '44%',
        zIndex: 4,
        [theme.breakpoints.landscape.smartphone]: {
            height: 200,
            top: '48%'
        }
    },
    decoration: {
        position: 'fixed',
        bottom: -90,
        left: -145,
        width: 397,
        height: 294,
        background: 'url(/images/decoration.svg) no-repeat',
        zIndex: 3
    },
    resumeGameDialog: {
        color: 'white'
    },
    notification: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        fontSize: '1.5rem'
    }
}));

const Hud = props => {
    const classes = useStyles(props);
    const { resumeGamePossible, enterMultiplayerGame, sessionId, showQuickMessage, challengedPlayer, assetsReady, overviewVisible, selectedAttack, tappedBuilding, game, state, openInfo, prepareNewGameCallback, className, surrender, startTutorial, playerInfos, endGame, notification, hideNotification } = props;

    const [open, setOpen] = useState(false);
    const [openSettings, setOpenSettings] = useState(false);
    const [showAccountOverview, setShowAccountOverview] = useState(false);
    const [dialogStyle, setDialogStyle] = useState('default');
    const [showMultiplayerScreen, setShowMultiplayerScreen] = useState(false);
    const [waitingRoom, setWaitingRoom] = useState(false);
    const [waitingRoomText, setWaitingRoomText] = useState(t(tr.TRY_TO_JOIN_GAME));
    const [choclabScreen, setChoclabScreen] = useState(false);
    const [playerAccount, setPlayerAccount] = useState(undefined);
    const [challengedProfile, setChallengedProfile] = useState(undefined);

    const sleep = ms => {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    const openAccountOverview = (account, style='default') => {
        setDialogStyle(style);
        setShowAccountOverview(true);
        setPlayerAccount(account);
    }

    const joinGame = useCallback(session => {
        setShowMultiplayerScreen(false);
        setChoclabScreen(false);
        enterMultiplayerGame(session);
    }, [enterMultiplayerGame]);

    useEffect(() => {
        const checkForWaitingRoom = async () => {
            if (typeof challengedPlayer !== 'undefined') {
                setWaitingRoom(true);
                setWaitingRoomText(t(tr.TRY_TO_SHOW_PLAYER_ACCOUNT));

                try {
                    while (!firebase.auth().currentUser) {
                        await sleep(100);
                    }
                    const response = await ServerRequest('get', '/user/' + challengedPlayer);
                    openAccountOverview(response.data[0]);
                } catch (error) {
                    if (error.response) {
                        if (error.response.status === 404) {
                            showQuickMessage({ text: t(tr.WARNING_PLAYER_NOT_FOUND, challengedPlayer) });
                        } else {
                            logger.warn(error, error.response.toString());
                        }
                    } else {
                        logger.error(error);
                    }
                } finally {
                    setWaitingRoom(false);
                }
            } else if (typeof sessionId !== 'undefined') {
                setWaitingRoom(true);
                setWaitingRoomText(t(tr.TRY_TO_JOIN_GAME))

                try {
                    let sessions = undefined;
                    let retry = false;
                    while (typeof sessions === 'undefined') {
                        if (retry) {
                            await sleep(250);
                        }
                        sessions = await multiplayer.getMultiplayerSessions(null, sessionId);
                        retry = true;
                    }

                    if (sessions.length > 0) {
                        joinGame(sessions[0].id);
                    } else {
                        logger.warn(`${sessionId} is not a session of this player`);
                        showQuickMessage({ text: t(tr.WARNING_GAME_NOT_JOINABLE_VIA_URL) });
                    }
                } catch (error) {
                    logger.warn(error);
                    showQuickMessage({ text: t(tr.ERROR_GAME_NOT_JOINABLE_VIA_URL) });
                } finally {
                    setWaitingRoom(false);
                }
            }
        }
        checkForWaitingRoom();
    }, [challengedPlayer, joinGame, sessionId, showQuickMessage]);

    const estimateStage = () => {
        if (typeof state === 'undefined' && !showMultiplayerScreen && !choclabScreen && !challengedProfile && !waitingRoom) {
            return 'TITLE_SCREEN'
        } else if (state === GameStateTypes.START ||
            state === GameStateTypes.CHOOSE_FIELD_OR_START ||
            state === GameStateTypes.CHOOSE_FIELD) {
            return 'CHOOSE_MENU';
        } else if (showMultiplayerScreen) {
            return 'MULTIPLAYER_SCREEN';
        } else if (choclabScreen) {
            return 'CHOCLAB_SCREEN';
        } else if (challengedProfile) {
            return 'CHALLENGE_SCREEN';
        } else if (waitingRoom) {
            return 'WAITING_ROOM';
        } else {
            return 'INGAME';
        }
    }

    const resumeOrStartGame = () => {
        if (resumeGamePossible) {
            setOpen(true);
        } else {
            prepareNewGameCallback(false);
        }
    }

    const kickOffTutorial = async () => {
        multiplayer.tutorialStarted();
        startTutorial();
    }

    const skipTutorial = async () => {
        await multiplayer.tutorialSkipped();
    }

    const notifyUnlock = (missingScore, feature) => {
        props.showNotification({ title: feature + ' not yet unlocked', message: 'You need to earn ' + missingScore + ' more coins to unlock the ' + feature + ' feature.' });
    }

    const stage = estimateStage();
    return (
        <div className={showMultiplayerScreen ? 'scrollable ' + className : className}>
            <Settings startTutorial={kickOffTutorial} surrender={surrender} open={openSettings} close={() => setOpenSettings(false)} />
            <AccountOverview
                challengePlayer={async username => {
                    await multiplayer.challengePlayer(username);
                    multiplayer.getMultiplayerSessions();
                }}
                addFriend={async friend => {
                    await multiplayer.addFriend(friend);
                }}
                removeFriend={async friend => {
                    await multiplayer.removeFriend(friend);
                }}
                dialogStyle={dialogStyle}
                joinGame={joinGame} playerAccount={playerAccount} open={showAccountOverview} close={() => setShowAccountOverview(false)} />
            {(() => {
                if (stage === 'CHOCLAB_SCREEN') {
                    return <div className={classes.actionbar}>
                        <Fab
                            color="secondary"
                            icon="back"
                            onClick={() => setChoclabScreen(false)}>
                        </Fab>
                    </div>
                } else if (stage === 'MULTIPLAYER_SCREEN') {
                    return null;
                } else if (stage === 'CHALLENGE_SCREEN') {
                    return <div className={classes.actionbar}>
                        <Fab
                            color="secondary"
                            icon="back"
                            onClick={() => setChallengedProfile(undefined)}>
                        </Fab>
                    </div>
                } else if (stage === 'WAITING_ROOM') {
                    return null;
                } else {
                    return <Actionbar endGame={endGame} showSettings={() => setOpenSettings(true)} showSignInOrUp={openAccountOverview} />
                }
            })()}

            {(() => {
                if (stage === 'TITLE_SCREEN') {
                    const controls = []
                    const playername = playerInfos.stats.username;
                    const score = playerInfos.stats.score;
                    const firstPlayScreen = playerInfos.stats.tutorialFinished === false && playerInfos.stats.tutorialSkipped === false;
                    const locked = typeof playername === 'undefined' || playername === 'Chocnonymous' || score < 1000;

                    if (firstPlayScreen) {
                        controls.push(<Button key="0" size="huge" buttonStyle={{ fontSize: '2rem'}} onClick={() => kickOffTutorial()}>{t(tr.START_TUTORIAL)}</Button>);
                        controls.push(<Button key="1" size="huge" color="accent" buttonStyle={{ fontSize: '1.6rem'}} onClick={() => skipTutorial()}>{t(tr.SKIP_TUTORIAL)}</Button>);
                        controls.push(<Button key="2" size="huge" color="secondary" buttonStyle={{ fontSize: '2rem'}} onClick={() => setShowAccountOverview(true)}>{t(tr.SIGNINORUP)}</Button>);
                    } else {
                        controls.push(<Button key="0" size="huge" onClick={() => resumeOrStartGame()}>{typeof playername === 'undefined' || playername === 'Chocnonymous' ? t(tr.NEW_GAME) : t(tr.MAIN_MENU_SINGLEPLAYER)}</Button>);
                        controls.push(<Button key="1" size="huge" locked={locked} color="secondary" onClick={() => {
                            if (locked) {
                                notifyUnlock(1000 - score, 'Multiplayer');
                            } else {
                                setShowMultiplayerScreen(true);
                            }
                        }}>{t(tr.MAIN_MENU_MULTIPLAYER)}</Button>);
                        
                        controls.push(<Button key="2" size="huge" locked={locked} color="accent" onClick={() => { 
                            if (locked) {
                                notifyUnlock(1000 - score, 'Choclab');
                            } else {
                                setChoclabScreen(true);
                            }
                        }}>{t(tr.MAIN_MENU_CHOCLAB)}</Button>);
                    }

                    return (
                        <>
                            <Dialog
                                open={open}
                                close={() => setOpen(false)}
                                title={t(tr.HUD_RESUME_GAME)}>
                                <div className={classes.resumeGameDialog}>
                                    <p>{t(tr.HUD_ASK_NEW_OR_RESUME)}</p>
                                    <div className="actions">
                                        <Button style={{ width: '40%', maxWidth: 246}} onClick={() => {
                                            setOpen(false);
                                            prepareNewGameCallback(true);
                                        }}>{t(tr.HUD_RESUME_GAME)}</Button>
                                        <Button style={{ width: '40%', maxWidth: 246}} color="accent" onClick={() => {
                                            setOpen(false);
                                            prepareNewGameCallback(false);
                                        }}>{t(tr.HUD_NEW_GAME)}</Button>
                                    </div>
                                </div>
                            </Dialog>
                            <div id="mainMenu">
                                {typeof playerInfos.stats.coins !== 'undefined' ? <div id="chocolate-coins">
                                    <span>{playerInfos.stats.coins}</span>
                                    <div className="coins" />
                                </div> : null}
                                <div className={classes.logo}><div /><div /></div>
                                <div className={classes.decoration} />
                                <div className={classes.menu}>
                                    {assetsReady ? controls : null}
                                </div>
                            </div>
                            <Highscore playername={playername} showPlayerProfile={session => openAccountOverview(session.opponent, 'stacked')} showQuickMessage={showQuickMessage} />
                            <Dialog
                                open={notification.open}
                                mode="info"
                                closable={false}
                                title={notification.title}>
                                <div className={classes.notification}>
                                    <p>{notification.message}</p>
                                    <Button size="small" style={{ marginRight: 32 }} onClick={() => hideNotification()}>Ok</Button>
                                </div>
                            </Dialog>
                            <Info openInfo={openInfo} />
                        </>
                    );
                } else if (stage === 'CHOOSE_MENU') {
                    return (
                        <div className="chooseStage">
                            <Tooltip
                                state={state}
                                currentPlayerName={game.players[multiplayer.localPlayerIndex].name}
                                tappedBuilding={tappedBuilding}
                                selectedAttack={selectedAttack}
                                level={game.players[multiplayer.localPlayerIndex].level}
                                playerTurn={multiplayer.isLocalPlayer(game.currentPlayerIndex)} />
                            <GameStartSelection />
                        </div>
                    );
                } else if (stage === 'MULTIPLAYER_SCREEN') {
                    return <>
                        <div className={classes.decoration} />
                        <MultiplayerScreen closeMultiplayerScreen={() => setShowMultiplayerScreen(false)} openAccountOverview={openAccountOverview} enterMultiplayerGame={joinGame} />
                    </>;
                } else if (stage === 'CHOCLAB_SCREEN') {
                    return <Choclab />
                } else if (stage === 'WAITING_ROOM') {
                    return <div className="waiting-room"><p>{waitingRoomText}</p><Progress infiniteAnimation /></div>
                } else {
                    let player = game.players[multiplayer.localPlayerIndex];
                    return (
                        <div>
                            <Tooltip
                                state={state}
                                currentPlayerName={player.name}
                                tappedBuilding={tappedBuilding}
                                selectedAttack={selectedAttack}
                                level={player.level}
                                playerTurn={multiplayer.isLocalPlayer(game.currentPlayerIndex)} />
                            <AttackPalette />
                            <BuildingPalette />
                            <InfoPanel players={game.players} />
                            {overviewVisible ? <GameEndOverview player={player} winners={game.winners} finishGame={coins => endGame(coins)} /> : null}
                        </div>
                    )
                }
            })()}
        </div>
    );
}

Hud.propTypes = {
    prepareNewGameCallback: PropTypes.func.isRequired,
    enterMultiplayerGame: PropTypes.func.isRequired,
    startTutorial: PropTypes.func.isRequired,
    endGame: PropTypes.func.isRequired,
    challengedPlayer: PropTypes.string,
    className: PropTypes.string.isRequired,
    sessionId: PropTypes.string
}

const mapStateToProps = state => ({
    game: state.gameplay.game,
    state: typeof state.gameplay.game === 'undefined' ? undefined : state.gameplay.game.state,
    overviewVisible: state.ui.overviewVisible,
    resumeGamePossible: state.ui.resumeGamePossible,
    assetsReady: state.ui.assetsReady,
    notification: state.ui.notification,
    playerInfos: state.ui.playerInfos,
    tappedBuilding: state.ui.tappedBuilding,
    selectedAttack: state.ui.selectedAttack
});

const mapDispatchToProps = {
    showQuickMessage,
    showNotification,
    hideNotification
};

const HudContainer = connect(
    mapStateToProps,
    mapDispatchToProps
)(Hud);

export default HudContainer;