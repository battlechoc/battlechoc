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
        zIndex: 1,
        [theme.breakpoints.orientation.landscape]: {
            width: 'calc(100% - 3*60px)',
            position: 'absolute',
            top: 5,
            marginTop: 0,
            marginBottom: 0,
            left: 'calc(2 * 60px)',
            justifyContent: 'space-evenly'
        },
        [theme.breakpoints.orientation.portrait]: {
            width: '100%',
            justifyContent: 'center',
            position: 'relative',
            '& > div': {
                margin: '1vh'
            }
        }
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
        width: '30vw',
        margin: '1vw',
        fontFamily: 'Bangers',
        background: `linear-gradient(0deg, ${theme.color.secondary.dark} 0%, ${theme.color.secondary.light} 70%)`,
        borderRadius: '5%',
        position: 'relative',
        [theme.breakpoints.orientation.portrait]: {
            width: '30vh',
            margin: '1vh',
        }
    },
    title: {
        fontSize: '3vw',
        textAlign: 'center',
        position: 'relative',
        [theme.breakpoints.orientation.portrait]: {
            fontSize: '3vh'
        } 
    },
    button: {
        width: '45%',
        '& > div': {
            fontSize: '3vw',
            [theme.breakpoints.orientation.portrait]: {
                fontSize: '3vh'
            } 
        }
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
        height: '50%',
        background: 'url(/images/header.svg) no-repeat',
        backgroundSize: '100%'
    },
    statistics: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        fontSize: '3vw',
        '& h3': {
            margin: 5
        },
        [theme.breakpoints.orientation.portrait]: {
            fontSize: '3vh'
        } 
    },
    coins: {
        display: 'flex',
        alignItems: 'center',
        '& span': {
            fontFamily: 'Bangers',
            marginRight: 10
        }, 
        '& div': {
            background: 'url(/images/coins.svg) no-repeat',
            padding: '1.5vw 2vw',
            [theme.breakpoints.orientation.portrait]: {
                padding: '1.5vh 2vh',
            } 
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
        padding: '1vw',
        fontSize: '2.5vw',
        textAlign: 'center',
        [theme.breakpoints.orientation.portrait]: {
            padding: '1vh', 
            fontSize: '2.5vh',
        }
    },
    search: {
        display: 'flex',
        alignItems: 'center'
    },
    label: {
        fontSize: '5vw',
        fontFamily: 'Bangers',
        '-webkit-text-stroke': `0.1vw ${theme.color.secondary.dark}`,
        '-webkit-font-smoothing': 'antialiased',
        marginRight: '2vw',
        [theme.breakpoints.orientation.portrait]: {
            fontSize: '5vh',
            '-webkit-text-stroke': `0.1vh ${theme.color.secondary.dark}`,
        }
    }, 
    input: {
        color: theme.color.secondary.dark,
        border: `0.1vw solid ${theme.color.secondary.dark}`,
        fontFamily: 'Bangers',
        padding: '1.5vw',
        flexGrow: 1,
        borderRadius: '1.5vw',
        outline: 'none',
        fontSize: '4.5vw',
        margin: '2vw 0',
        [theme.breakpoints.orientation.portrait]: {
            border: `0.1vh solid ${theme.color.secondary.dark}`,
            padding: '1.5vh',
            borderRadius: '1.5vh',
            fontSize: '4.5vh',
            margin: '2vh 0',
        }
    },
    dialog: {
        width: '90%'
    },
    playerList: {
        width: '100%',
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
    const { /*updateMultiplayerSessions,*/ closeMultiplayerScreen, showQuickMessage, openAccountOverview, enterMultiplayerGame, multiplayerSessions, sessionRefreshActions, friends } = props;

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

    const showPlayerProfile = (session, mode='stacked') => openAccountOverview(session.opponent, mode);

    /*const canNotifyOpponent = session => {
        const currentDateTime = (new Date()).getTime();
        const lastNotifiedTime = (typeof session.last_notification === 'undefined') ? 0 : session.last_notification;
        return (((currentDateTime - lastNotifiedTime) > 1000 * 60 * 60 * 4) && session.myTurn === false);
    }

    const notifyOpponent = session => {
        ServerRequest('post', '/user/notify', { sessionId: session.id }).then(response => {
            updateMultiplayerSessions(response.data.sessions);
        })
    }*/

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
                <Button onClick={searchRandomOpponent} color="accent">{t(tr.MULTIPLAYER_RANDOM_OPPONENT)}</Button>
                <Button onClick={() => setShowFriends(true)}>{t(tr.FRIENDS)}</Button>
            </div>
            
            { multiplayerSessions.length > 0 && sessionRefreshActions === 0 ? <div className={classes.sessions}>
                {  Object.assign([], multiplayerSessions).sort(sortByTimestamp).map((row, i) =>
                <div className={classes.session} key={i}>
                    <div className={classes.header} />
                    <h2 className={classes.title}>{`you vs ${row.opponent.name}`}</h2>
                    <div className={classes.buttons}>
                        { row.myTurn ? 
                        <Button className={classes.button} onClick={() => enterMultiplayerGame(row.id)}>Play</Button> :
                        <Button className={classes.button} color="secondary" onClick={() => enterMultiplayerGame(row.id)}>Wait</Button> }
                        <Button color="accent" className={classes.button} onClick={() => askSurrenderGame(row.id, row.opponent.name)}>{t(tr.SURRENDER)}</Button>
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
                        <Fab icon="user" onClick={() => showPlayerProfile(row, 'default')} />
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