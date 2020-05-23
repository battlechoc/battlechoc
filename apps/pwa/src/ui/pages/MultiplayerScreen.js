import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { Jukebox, translate as t, keys as tr, getCurrentLanguage } from '../misc';
import Axios from 'axios';
import { showQuickMessage, updateMultiplayerSessions } from '../UiActions';
import { connect } from 'react-redux';
import TimeAgo from 'javascript-time-ago';
import en from 'javascript-time-ago/locale/en';
import de from 'javascript-time-ago/locale/de';
import { multiplayer } from '../../Multiplayer';
import { ServerRequest } from '../../helper/settings';
import logger from '../../helper/logger';
import { Dialog } from '../dialogs';
import { Progress, PlayerList, Button, Fab } from '../controls';
import { NoHealthyInternetConnectionError } from 'battlechoc-shared-functions';
import { createUseStyles } from 'react-jss';

const useStyles = createUseStyles(theme => ({
    page: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        color: 'white'
    },
    actions: {
        display: 'flex',
        width: '100%',
        justifyContent: 'space-around',
        marginBottom: 24,
        marginTop: 24,
        position: 'relative',
        zIndex: 1,
        [theme.breakpoints.orientation.landscape]: {
            width: 'calc(100% - 3*60px)',
            position: 'absolute',
            top: 5,
            marginTop: 0,
            marginBottom: 0,
            left: 'calc(2 * 60px)',
            justifyContent: 'space-evenly'
        }
    },
    action: {
        width: 200
    },
    actionbar: {
        margin: 5,
        display: 'flex',
        flexDirection: 'row',
        width: 'calc(100% - 10px)',
        position: 'relative',
        zIndex: 1,
        '& > :first-child': {
            marginRight: 5
        }
    },
    sessions: {
        display: 'flex',
        width: '100%',
        justifyContent: 'center',
        flexWrap: 'wrap',
        position: 'relative',
        zIndex: 4,
    },
    session: {
        width: 180,
        margin: 10,
        fontFamily: 'Bangers',
        background: `linear-gradient(0deg, ${theme.color.secondary.dark} 0%, ${theme.color.secondary.light} 70%)`,
        borderRadius: '5%',
        position: 'relative',
        [theme.breakpoints.orientation.landscape]: {
            margin: '20px 10px 0px 10px'
        }
    },
    title: {
        fontSize: '1rem',
        textAlign: 'center',
        position: 'relative'
    },
    button: {
        width: '45%'
    },
    buttons: {
        display: 'flex',
        justifyContent: 'space-around'
    },
    info: {
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        margin: 10
    },
    header: { 
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: 60,
        background: 'url(/images/header.svg) no-repeat',
        backgroundSize: '100%'
    },
    statistics: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        '& h3': {
            margin: 5
        }
    },
    coins: {
        display: 'flex',
        alignItems: 'center',
        '& span': {
            fontSize: '1.2rem',
            fontFamily: 'Bangers',
            marginRight: 10
        }, 
        '& div': {
            background: 'url(/images/coins.svg) no-repeat',
            height: 19,
            width: 28
        }
    },
    surrenderDialog: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center'  
    },
    timeago: {
        fontFamily: 'Montserrat',
        padding: 10,
        textAlign: 'center'
    },
    message: {
        padding: 10,
        textAlign: 'center',
        fontFamily: 'Montserrat',
        background: `linear-gradient(0deg, ${theme.color.accent.dark} 0%, ${theme.color.accent.light} 100%)`,
        borderRadius: 12,
        border: `3px solid ${theme.color.accent.light}`,
        position: 'relative',
        zIndex: 3,
        margin: '24px 10px 0 10px'
    },
    search: {
        display: 'flex',
        alignItems: 'center'
    },
    label: {
        fontSize: '1.6rem',
        fontFamily: 'Bangers',
        '-webkit-text-stroke': `1px ${theme.color.secondary.dark}`,
        '-webkit-font-smoothing': 'antialiased',
        marginRight: 6
    }, 
    input: {
        color: theme.color.secondary.dark,
        border: `1px solid ${theme.color.secondary.dark}`,
        fontFamily: 'Bangers',
        padding: 6,
        flexGrow: 1,
        borderRadius: 6,
        outline: 'none',
        fontSize: '1.2rem'
    },
    dialog: {
        width: '90%'
    },
    playerList: {
        width: '100%',
        marginTop: 24
    },
    progress: {
        position: 'absolute',
        width: '100vw',
        height: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 0
    }
}));

const MultiplayerScreen = props => {
    const classes = useStyles();
    const { updateMultiplayerSessions, closeMultiplayerScreen, showQuickMessage, openAccountOverview, enterMultiplayerGame, multiplayerSessions, sessionRefreshActions, friends } = props;

    const [searchingRandomOpponent, setSearchingRandomOpponent] = useState(false);
    const [showFriends, setShowFriends] = useState(false);
    const [showSurrenderDialog, setShowSurrenderDialog] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [userSearchText, setUserSearchText] = useState('');
    const [searchResults, setSearchResults] = useState([]);  
    const [waitForResponse, setWaitForResponse] = useState(false);  
    const [badInternetConnection, setBadInternetConnection] = useState(false);
    const [surrenderGameId, setSurrenderGameId] = useState(undefined);
    const [surrenderOpponentName, setSurrenderOpponentName] = useState(undefined);

    const requestTimeout = useRef();
    const shouldAskForPermissionTimeout = useRef();
    const askForPermissionTimeout = useRef();
    const requestRunning = useRef(false);
    const source = useRef(Axios.CancelToken.source());

    const inputRef = React.useRef();
    
    let timeAgo = new TimeAgo('en-US');
    if (getCurrentLanguage() === 'de') {
        timeAgo = new TimeAgo('de-DE');
    } else if (getCurrentLanguage() === 'jp') {
        timeAgo = new TimeAgo('ja');
    }

    useEffect(() => {
        TimeAgo.addLocale(en);
        TimeAgo.addLocale(de);

        multiplayer.getMultiplayerSessions(() => showQuickMessage({ text: t(tr.SESSION_REFRESH_FAILED) }));
        multiplayer.fetchFriendsList();

        shouldAskForPermissionTimeout.current = setTimeout(() => {
            if (multiplayer.shouldAskForNotificationPermission()) {
                showQuickMessage({ text: t(tr.NOTIFICATION_PERMISSION_INFO), variant: 'info' });
                askForPermissionTimeout.current = setTimeout(() => multiplayer.askForNotificationPermission(), 5000);
            }
        }, 2000);

        return () => {
            clearTimeout(shouldAskForPermissionTimeout.current);
            clearTimeout(askForPermissionTimeout.current);
        }
    }, [showQuickMessage]);

    const showPlayerProfile = (session, stacked=true) => openAccountOverview(session.opponent, stacked);

    const canNotifyOpponent = session => {
        const currentDateTime = (new Date()).getTime();
        const lastNotifiedTime = (typeof session.last_notification === 'undefined') ? 0 : session.last_notification;
        return (((currentDateTime - lastNotifiedTime) > 1000 * 60 * 60 * 4) && session.myTurn === false);
    }

    const notifyOpponent = session => {
        ServerRequest('post', '/user/notify', { sessionId: session.id }).then(response => {
            updateMultiplayerSessions(response.data.sessions);
        })
    }

    const removeFriend = async friend => {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        await multiplayer.removeFriend(friend);
    }

    const addFriend = async friend => {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        await multiplayer.addFriend(friend);
    }

    const challengePlayer = async username => {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        setShowFriends(false);
        setShowSearch(false)
        await multiplayer.challengePlayer(username);
        multiplayer.getMultiplayerSessions();
    }

    const askSurrenderGame = (sessionId, opponent) => {
        setShowSurrenderDialog(true);
        setSurrenderGameId(sessionId);
        setSurrenderOpponentName(opponent);
    }

    const surrenderGame = async sessionId => {
        multiplayer.surrenderGame(sessionId).then(() => multiplayer.getMultiplayerSessions()).then(() => {
            multiplayer.fetchPlayerStats();
        }).catch(err => {
            showQuickMessage({ text: t(tr.NOTIFICATION_SURRENDER_NOT_POSSIBLE), variant: 'info' });
        });
    }

    const sortByTimestamp = (a, b) => {
        if (a.last_changed < b.last_changed) {
            return 1;
        }
        if (a.last_changed > b.last_changed) {
            return -1;
        }
        return 0;
    }

    const searchRandomOpponent = async () => {
        if (!searchingRandomOpponent) {
            setSearchingRandomOpponent(true);

            try {
                const player = await multiplayer.findRandomPlayer();
                openAccountOverview(player);
            } catch (error) {
                logger.warn(error.toString());
            } finally {
                setSearchingRandomOpponent(false);
            }
        }
    }

    useEffect(() => {
        const searchUser = async () => {
            if (userSearchText !== '') {
                clearTimeout(requestTimeout.current);
                if (requestRunning.current) {
                    source.current.cancel();
                }

                setSearchResults([]);
                requestTimeout.current = (setTimeout(async () => {
                    setWaitForResponse(true);
                    source.current = Axios.CancelToken.source();
                    requestRunning.current = true;

                    try {
                        const response = await ServerRequest('get', '/query/user/' + userSearchText, source.current.token);
                        setBadInternetConnection(false);
                        setSearchResults(response.data);
                        if (window.innerHeight < 300) {
                            inputRef.current.blur();
                        }
                    } catch (error) {
                        if (error instanceof NoHealthyInternetConnectionError || error.code === 'auth/network-request-failed') {
                            setBadInternetConnection(true);
                        } else if (!Axios.isCancel(error)) {
                            logger.warn(error);
                            setSearchResults([]);
                        }
                    } finally {
                        requestRunning.current = false;
                        setWaitForResponse(false);
                    }
                }, 500));
            }
        }
        searchUser();
    }, [userSearchText]);

    const refreshSessions = () => {
        multiplayer.getMultiplayerSessions(() => showQuickMessage({ text: t(tr.SESSION_REFRESH_FAILED) }));
    }

    return (
        <>
        { sessionRefreshActions > 0 ? <Progress className={classes.progress} infiniteAnimation /> : null }
        <div className={classes.actionbar}>
            <Fab
                color="secondary"
                icon="back"
                onClick={() => closeMultiplayerScreen() } />
            <Fab
                color="secondary"
                iconStyle={ sessionRefreshActions > 0 ? { animation: 'spin 1.2s infinite linear' } : {} }
                icon="refresh"
                onClick={() => refreshSessions() } />
            <div style={{ flexGrow: 1 }} />
            <Fab
                color="secondary"
                icon="search"
                onClick={() => setShowSearch(true)} />
        </div>
        <div className={classes.page}>
            <Dialog
                open={showSurrenderDialog}
                close={() => setShowSurrenderDialog(false)}
                title={t(tr.SURRENDER_GAME)}>
                <div className={classes.surrenderDialog}>
                    <p>{t(tr.SURRENDER_GAME_TEXT, surrenderOpponentName)}</p>
                    <Button color="accent" onClick={() => {
                        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                        setShowSurrenderDialog(false);
                        setSurrenderGameId(undefined);
                        setSurrenderOpponentName(undefined);
                        surrenderGame(surrenderGameId);
                    }}>{t(tr.SURRENDER)}</Button>
                </div>
            </Dialog>

            <Dialog
                open={showFriends}
                close={() => setShowFriends(false)}
                title={t(tr.FRIENDS)}>
                <div className={classes.dialog}>
                    <PlayerList
                        className={classes.playerList}
                        players={friends}
                        size="medium"
                        removeFriend={removeFriend}
                        challenge={challengePlayer}
                        showProfile={showPlayerProfile}
                        sessions={multiplayerSessions} />
                </div>
            </Dialog>

            <Dialog
                open={showSearch}
                close={() => setShowSearch(false)}
                title={t(tr.SEARCH_PLAYERS)}>
                <div className={classes.dialog}>
                    { badInternetConnection && !waitForResponse ? <span>{ t(tr.NO_HEALTHY_INTERNET) }</span> : null }
                    <div className={classes.search}>
                        <span className={classes.label}>Name</span>
                        <input className={classes.input} ref={inputRef} value={userSearchText} spellCheck={false} autoFocus onChange={event => {
                            setUserSearchText(event.target.value);
                        }} />
                    </div>
                    { waitForResponse ? <Progress style={{
                        alignItems: 'center',
                        display: 'flex',
                        justifyContent: 'center',
                        margin: 24
                    }} infiniteAnimation /> : null }
                    <PlayerList
                        className={classes.playerList}
                        size="medium"
                        players={searchResults} 
                        friends={friends}
                        addFriend={addFriend}
                        removeFriend={removeFriend}
                        challenge={challengePlayer}
                        showProfile={showPlayerProfile}
                        sessions={multiplayerSessions} />
                </div>
            </Dialog>

            <div className={classes.actions}>
                <Button className={classes.action} onClick={searchRandomOpponent} buttonStyle={{ fontSize: '1.2rem' }} color="accent">{t(tr.MULTIPLAYER_RANDOM_OPPONENT)}</Button>
                <Button className={classes.action} onClick={() => setShowFriends(true)}>{t(tr.FRIENDS)}</Button>
            </div>
            
            { multiplayerSessions.length > 0 && sessionRefreshActions === 0 ? <div className={classes.sessions}>
                {  Object.assign([], multiplayerSessions).sort(sortByTimestamp).map((row, i) =>
                <div className={classes.session} key={i}>
                    <div className={classes.header} />
                    <h2 className={classes.title}>{`you vs ${row.opponent.name}`}</h2>
                    <div className={classes.buttons}>
                        { row.myTurn ? 
                        <Button buttonStyle={{ fontSize: '1.1rem' }} className={classes.button} onClick={() => enterMultiplayerGame(row.id)}>Play</Button> :
                        <Button buttonStyle={{ fontSize: '1.1rem' }} className={classes.button} color="secondary" onClick={() => enterMultiplayerGame(row.id)}>Wait</Button> }
                        <Button color="accent" buttonStyle={{ fontSize: '1.1rem' }} className={classes.button} onClick={() => askSurrenderGame(row.id, row.opponent.name)}>{t(tr.SURRENDER)}</Button>
                    </div>
                    <div className={classes.timeago}>{`You are waiting for ${timeAgo.format(new Date(row.last_changed), 'time')}`}</div>
                    <div className={classes.info}>
                        <div className={classes.statistics}>
                            <h3>{` Turn ${row.turns}`}</h3>
                            <div className={classes.coins}>
                                <span>{multiplayer.calculateCoinsFromTrackRecord([row.statistics], true)}</span>
                                <div />
                            </div>
                        </div>
                        <Fab icon="user" onClick={() => showPlayerProfile(row, false)} />
                    </div>
                </div>) }
            </div> : null }
        </div>
        </>
    );
}

MultiplayerScreen.propTypes = {
    enterMultiplayerGame: PropTypes.func.isRequired
}

const mapStateToProps = state => ({
    game: state.gameplay.game,
    multiplayerSessions: state.ui.multiplayerSessions,
    friends: state.ui.friends,
    sessionRefreshActions: state.ui.sessionRefreshActions
});

const mapDispatchToProps = {
    showQuickMessage,
    updateMultiplayerSessions
};

const MultiplayerScreenContainer = connect(
    mapStateToProps,
    mapDispatchToProps
)(MultiplayerScreen);
export default MultiplayerScreenContainer;