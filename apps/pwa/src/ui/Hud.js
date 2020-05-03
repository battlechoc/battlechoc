import React, { useState, useEffect, useCallback } from 'react';
import './Hud.css';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { GameStateTypes } from 'battlechoc-shared-functions';
import { showQuickMessage, showNotification, hideNotification } from './UiActions';
import { Actionbar, InfoPanel, BuildingPalette, AttackPalette, GameStartSelection, SocialIcons, GameEndOverview } from './controls';
import { Jukebox, translate as t, keys as tr } from './misc';
import { Notification, Info, Tooltip, Settings, AccountOverview } from './dialogs';
import BattlechocDialog from './dialogs/BattlechocDialog';
import Fab from '@material-ui/core/Fab';
import CircularProgress from '@material-ui/core/CircularProgress';
import { KeyboardArrowLeft as ArrowBackIcon } from '@material-ui/icons';
import MultiplayerScreen from './pages/MultiplayerScreen';
import Choclab from './pages/Choclab';
import { multiplayer } from '../Multiplayer';
import { ServerRequest } from '../helper/settings';
import logger from '../helper/logger';
import firebase from '@firebase/app';
import { OptimizedImage } from '../helper/compatibility';

const Hud = props => {
    const { resumeGamePossible, enterMultiplayerGame, sessionId, showQuickMessage, challengedPlayer, assetsReady, overviewVisible, selectedAttack, tappedBuilding, game, state, openInfo, prepareNewGameCallback, className, surrender, startTutorial, playerInfos, endGame, notification, hideNotification } = props;

    const [open, setOpen] = useState(false);
    const [openSettings, setOpenSettings] = useState(false);
    const [showAccountOverview, setShowAccountOverview] = useState(false);
    const [showMultiplayerScreen, setShowMultiplayerScreen] = useState(false);
    const [waitingRoom, setWaitingRoom] = useState(false);
    const [waitingRoomText, setWaitingRoomText] = useState(t(tr.TRY_TO_JOIN_GAME));
    const [choclabScreen, setChoclabScreen] = useState(false);
    const [playerAccount, setPlayerAccount] = useState(undefined);
    const [challengedProfile, setChallengedProfile] = useState(undefined);

    const sleep = ms => {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    const openAccountOverview = account => {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
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
        multiplayer.tutorialSkipped();
    }

    const notifyUnlock = async (missingScore, feature) => {
        props.showNotification({ title: feature + ' not yet unlocked', message: 'You need to earn ' + missingScore + ' more coins to unlock the ' + feature + ' feature.' });
    }

    const stage = estimateStage();
    return (
        <div className={showMultiplayerScreen ? 'scrollable ' + className : className}>
            <Settings startTutorial={kickOffTutorial} surrender={surrender} open={openSettings} close={() => setOpenSettings(false)} />
            <AccountOverview
                challengePlayer={async username => {
                    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                    await multiplayer.challengePlayer(username);
                    multiplayer.getMultiplayerSessions();
                }}
                addFriend={async friend => {
                    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                    await multiplayer.addFriend(friend);
                }}
                removeFriend={async friend => {
                    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                    await multiplayer.removeFriend(friend);
                }}
                joinGame={joinGame} playerAccount={playerAccount} open={showAccountOverview} close={() => setShowAccountOverview(false)} />
            {(() => {
                if (stage === 'CHOCLAB_SCREEN') {
                    return <div className="actionbar">
                        <Fab
                            size="small"
                            color="primary"
                            className="icon"
                            onClick={() => setChoclabScreen(false)}>
                            <ArrowBackIcon />
                        </Fab>
                    </div>
                } else if (stage === 'MULTIPLAYER_SCREEN') {
                    return null;
                } else if (stage === 'CHALLENGE_SCREEN') {
                    return <div className="actionbar">
                        <Fab
                            size="small"
                            color="primary"
                            className="icon"
                            onClick={() => setChallengedProfile(undefined)}>
                            <ArrowBackIcon />
                        </Fab>
                    </div>
                } else if (stage === 'WAITING_ROOM') {
                    return null;
                } else {
                    return <Actionbar endGame={endGame} showSettings={() => {
                        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                        setOpenSettings(true);
                    }} showSignInOrUp={openAccountOverview} />
                }
            })()}

            {(() => {
                if (stage === 'TITLE_SCREEN') {
                    const controls = []
                    const playername = playerInfos.stats.username;
                    const score = playerInfos.stats.score;
                    const firstPlayScreen = playerInfos.stats.tutorialFinished === false && playerInfos.stats.tutorialSkipped === false;
                    const hideOptions = typeof playername === 'undefined' || playername === 'Chocnonymous' || score < 1000;

                    if (firstPlayScreen) {
                        controls.push(<div key="0" className="menuButton" onClick={() => kickOffTutorial()}>{t(tr.START_TUTORIAL)}</div>);
                        controls.push(<div key="1" className="menuButton" onClick={() => skipTutorial()}>{t(tr.SKIP_TUTORIAL)}</div>);
                        controls.push(<div key="2" className="menuButton" onClick={() => setShowAccountOverview(true)}>{t(tr.SIGNINORUP)}</div>);
                    } else {
                        controls.push(<div key="0" className="menuButton" onClick={() => resumeOrStartGame()}>{t(tr.NEW_GAME)}</div>);

                        if (!hideOptions) {
                            controls.push(<div key="1" className="menuButton" onClick={() => setShowMultiplayerScreen(true)}>{t(tr.MAIN_MENU_MULTIPLAYER)}</div>);
                            controls.push(<div key="2" className="menuButton" onClick={() => setChoclabScreen(true)}>{t(tr.MAIN_MENU_CHOCLAB)}</div>);
                        } else {
                            controls.push(<div key="1" className="menuButton locked" onClick={() => notifyUnlock(1000 - score, 'Multiplayer')}>{t(tr.MAIN_MENU_MULTIPLAYER)}</div>);
                            controls.push(<div key="2" className="menuButton locked" onClick={() => notifyUnlock(1000 - score, 'Choclab')}>{t(tr.MAIN_MENU_CHOCLAB)}</div>);
                        }
                    }

                    return (
                        <div id="mainMenu">
                            {typeof playerInfos.stats.coins !== 'undefined' ? <div id="chocolate-coins">
                                <span>{playerInfos.stats.coins}</span>
                                <OptimizedImage src="/images/coins.png" alt="choco coins" />
                            </div> : null}
                            <SocialIcons />
                            <div className="logo">
                                <OptimizedImage src="/images/logo.png" alt="battlechoc logo" />
                            </div>
                            <div className="titleMenu">
                                {assetsReady ? controls : null}
                                <BattlechocDialog
                                    open={open}
                                    close={() => setOpen(false)}
                                    title={t(tr.HUD_RESUME_GAME)}>
                                    <div className="resumeGameDialog">
                                        <p>{t(tr.HUD_ASK_NEW_OR_RESUME)}</p>
                                        <div className="actions">
                                            <div className="menuButton" onClick={() => {
                                                Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                                setOpen(false);
                                                prepareNewGameCallback(true);
                                            }}>{t(tr.HUD_RESUME_GAME)}</div>
                                            <div className="menuButton" onClick={() => {
                                                Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                                setOpen(false);
                                                prepareNewGameCallback(false);
                                            }}>{t(tr.HUD_NEW_GAME)}</div>
                                        </div>
                                    </div>
                                </BattlechocDialog>
                            </div>
                            {notification.open ? <Notification message={notification.message} title={notification.title} close={() => hideNotification()} /> : <Info openInfo={openInfo} />}
                        </div>
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
                    return <MultiplayerScreen closeMultiplayerScreen={() => setShowMultiplayerScreen(false)} openAccountOverview={openAccountOverview} enterMultiplayerGame={joinGame} />
                } else if (stage === 'CHOCLAB_SCREEN') {
                    return <Choclab />
                } else if (stage === 'WAITING_ROOM') {
                    return <div className="waiting-room"><p>{waitingRoomText}</p><CircularProgress /></div>
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
    surrender: PropTypes.func.isRequired,
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