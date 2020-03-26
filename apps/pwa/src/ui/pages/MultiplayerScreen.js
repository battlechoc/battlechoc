import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import './MultiplayerScreen.css';
import TextField from '@material-ui/core/TextField';
import Fab from '@material-ui/core/Fab';
import CircularProgress from '@material-ui/core/CircularProgress';
import { Jukebox, translate as t, keys as tr, getCurrentLanguage } from '../misc';
import Axios from 'axios';
import { showQuickMessage } from '../UiActions';
import { KeyboardArrowLeft as ArrowBackIcon, Refresh, PlayArrow, ChevronRight, LastPage, FirstPage, ChevronLeft, HourglassEmpty, Cancel, AccountCircle, FormatListNumbered, Casino, People, Search, Share } from '@material-ui/icons';
import { connect } from 'react-redux';
import TimeAgo from 'javascript-time-ago';
import en from 'javascript-time-ago/locale/en';
import de from 'javascript-time-ago/locale/de';
import { multiplayer } from '../../Multiplayer';
import { ServerRequest } from '../../helper/settings';
import logger from '../../helper/logger';
import BattlechocDialog from '../dialogs/BattlechocDialog';
import PlayerList from '../controls/PlayerList';
import { NoHealthyInternetConnectionError } from 'battlechoc-shared-functions';

const MultiplayerScreen = props => {
    const { account, closeMultiplayerScreen, showQuickMessage, openAccountOverview, enterMultiplayerGame, multiplayerSessions, sessionRefreshActions, friends } = props;

    const [searchingRandomOpponent, setSearchingRandomOpponent] = useState(false);    
    const [showFriends, setShowFriends] = useState(false);  
    const [showSurrenderDialog, setShowSurrenderDialog] = useState(false);  
    const [showSearch, setShowSearch] = useState(false);  
    const [userSearchText, setUserSearchText] = useState('');
    const [searchResults, setSearchResults] = useState([]);  
    const [waitForResponse, setWaitForResponse] = useState(false);  
    const [badInternetConnection, setBadInternetConnection] = useState(false);  
    const [showHighscore, setShowHighscore] = useState(false);  
    const [highscoreLoading, setHighscoreLoading] = useState(false);
    const [highscore, setHighscore] = useState([]); 
    const [highscoreLastPage, setHighscoreLastPage] = useState(1); 
    const [highscorePage, setHighscorePage] = useState(1);
    const [surrenderGameId, setSurrenderGameId] = useState(undefined);
    const [surrenderOpponentName, setSurrenderOpponentName] = useState(undefined);

    const requestTimeout = useRef();
    const shouldAskForPermissionTimeout = useRef();
    const askForPermissionTimeout = useRef();
    const requestRunning = useRef(false);
    const source = useRef(Axios.CancelToken.source());
    
    const inputRef = React.useRef();
    
    useEffect(() => {
        TimeAgo.addLocale(en);
        TimeAgo.addLocale(de);

        multiplayer.getMultiplayerSessions(() => showQuickMessage({ text: t(tr.SESSION_REFRESH_FAILED)}));
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

    const timeAgo = millis => {
        let timeAgo = new TimeAgo('en-US');
        if (getCurrentLanguage() === 'de') {
            timeAgo = new TimeAgo('de-DE');
        }
        return timeAgo.format(millis);
    }

    const toggleClassList = id => {
        Array.from(document.getElementsByClassName(`row.${id}`)).forEach(div => div.classList.toggle('selected'));
    }

    const showPlayerProfile = session => openAccountOverview(session.opponent);

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
        await multiplayer.surrenderGame(sessionId);
        multiplayer.getMultiplayerSessions();
    }

    const sortByTimestamp = ( a, b ) => {
      if ( a.last_changed < b.last_changed ){
        return 1;
      }
      if ( a.last_changed > b.last_changed ){
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
                requestTimeout.current = (setTimeout( async () => {
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
                    } catch(error) {
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

    const openHighscorePage = async page => {
        setShowHighscore(true);
        setHighscoreLoading(true);
        setHighscore([]);
        try {
            const highscore = await multiplayer.fetchHighscore(page);
            setHighscoreLoading(false);
            setHighscore(highscore.list);
            setHighscorePage(highscore.page);
            setHighscoreLastPage(highscore.lastPage);
        } catch (error) {
            logger.warn(error);
            showQuickMessage({ text: t(tr.FETCH_HIGHSCORE_FAILED)});
            setShowHighscore(false);
            setHighscoreLoading(false);
        }
    }

    
    const refreshSessions = () => {
        multiplayer.getMultiplayerSessions(() => showQuickMessage({ text: t(tr.SESSION_REFRESH_FAILED)}));
    }

    const createProfileLink = () => {
        multiplayer.createChallengeMeLink().then(link => {
            if (navigator.share) {
                navigator.share({
                    title: window.document.title,
                    text: t(tr.INVITATION),
                    url: link,
                }).catch((error) => logger.info('error sharing multiplayer session', error));
            } else {
                let whatsappWindowRef = window.open();
                whatsappWindowRef.location = 'https://api.whatsapp.com/send?text=' + encodeURIComponent(t(tr.INVITATION) + ' - ' + link);
            }
        });
    }

    return (
        <>
        <div className="actionbar" style={{ width: '100%', position: 'relative', marginBottom: '5vh' }}>
            <Fab
                size="small"
                color="primary"
                className="icon"
                onClick={() => closeMultiplayerScreen() }>
                <ArrowBackIcon />
            </Fab>
            <Fab
                size="small"
                color="primary"
                className={ sessionRefreshActions > 0 ? 'rotating icon' : 'icon' }
                onClick={() => refreshSessions() }>
                <Refresh />
            </Fab>
            <div style={{ flexGrow: 1 }} />
            <Fab
                size="small"
                color="primary"
                className="icon"
                onClick={() => openHighscorePage()}>
                <FormatListNumbered />
            </Fab>
            <Fab
                size="small"
                color="primary"
                className="icon"
                onClick={() => searchRandomOpponent()}>
                { searchingRandomOpponent ? <CircularProgress style={{ color: 'white' }} size={18} /> : <Casino /> }
            </Fab>
            <Fab
                size="small"
                color="primary"
                className="icon"
                onClick={() => setShowFriends(true)}>
                <People />
            </Fab>
            <Fab
                size="small"
                color="primary"
                className="icon"
                onClick={createProfileLink}>
                <Share />
            </Fab>
            <Fab
                size="small"
                color="primary"
                className="icon"
                style={{ marginRight: 5 }}
                onClick={() => setShowSearch(true)}>
                <Search />
            </Fab>
        </div>
        <div id="multiplayer">
            <BattlechocDialog
                open={showSurrenderDialog}
                close={() => setShowSurrenderDialog(false)}
                title={t(tr.SURRENDER_GAME)}>
                <div className="surrenderDialog">
                    <p>{t(tr.SURRENDER_GAME_TEXT, surrenderOpponentName)}</p>
                    <div className="menuButton" onClick={() => {
                        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                        setShowSurrenderDialog(false);
                        setSurrenderGameId(undefined);
                        setSurrenderOpponentName(undefined);
                        surrenderGame(surrenderGameId);
                    }}>{t(tr.SURRENDER)}</div>
                </div>
            </BattlechocDialog>

            <BattlechocDialog
                open={showFriends}
                close={() => setShowFriends(false)}
                title={t(tr.FRIENDS)}>
                <PlayerList 
                    players={friends} 
                    removeFriend={removeFriend}
                    challenge={challengePlayer}
                    showProfile={showPlayerProfile}
                    sessions={multiplayerSessions} />
            </BattlechocDialog>

            <BattlechocDialog
                open={showHighscore}
                close={() => setShowHighscore(false)}
                title="Highscore">
                <div className="highscore-page">
                    <div className="highscore-paginator">
                        <div>
                            <Fab
                                size="small"
                                color="primary"
                                className="icon"
                                disabled={highscorePage === 1}
                                onClick={() => openHighscorePage(1) }>
                                <FirstPage />
                            </Fab>
                            <Fab
                                size="small"
                                color="primary"
                                className="icon"
                                disabled={highscorePage === 1}
                                onClick={() => openHighscorePage(Math.max(highscorePage - 1, 1))}>
                                <ChevronLeft />
                            </Fab>
                        </div>
                        { highscoreLoading ? <CircularProgress size={22} /> : <span style={{color: '#324D5C'}}>{t(tr.ACCOUNT_OVERVIEW_RANK)} {highscore.length > 0 ? `${highscore[0].ranking} - ${highscore[highscore.length - 1].ranking}` : '1 - 1'}</span> }
                        <div>
                            <Fab
                                size="small"
                                color="primary"
                                className="icon"
                                disabled={highscorePage === highscoreLastPage}
                                onClick={() => {
                                    openHighscorePage(Math.min(highscorePage + 1, highscoreLastPage))}
                                }>
                                <ChevronRight />
                            </Fab> 
                            <Fab
                                size="small"
                                color="primary"
                                className="icon"
                                disabled={highscorePage === highscoreLastPage}
                                onClick={() => openHighscorePage(highscoreLastPage) }>
                                <LastPage />
                            </Fab> 
                        </div>
                    </div>
                    { highscoreLoading ? null : <PlayerList 
                        withScore={true}
                        username={account.username}
                        players={highscore} 
                        friends={friends}
                        removeFriend={removeFriend}
                        addFriend={addFriend}
                        challenge={challengePlayer}
                        showProfile={showPlayerProfile}
                        sessions={multiplayerSessions} /> }
                </div>
            </BattlechocDialog>

            <BattlechocDialog
                open={showSearch}
                close={() => setShowSearch(false)}
                title={t(tr.SEARCH_PLAYERS)}>
                <div className="playerSearchDialog">
                    <TextField
                        label="Name"
                        value={userSearchText}
                        error={badInternetConnection && !waitForResponse}
                        helperText={badInternetConnection && !waitForResponse ? t(tr.NO_HEALTHY_INTERNET) : ''}
                        style={{display: 'flex'}}
                        inputProps={{ spellCheck: 'false', autoFocus: true }}
                        InputLabelProps={{ style: {color: 'rgba(69, 123, 130, 0.8)' }}}
                        onChange={event => {
                            setUserSearchText(event.target.value);
                        }}
                        margin="normal"
                        InputProps={{ 
                            endAdornment: waitForResponse ? <CircularProgress size={18} /> : null,
                            inputRef: inputRef
                        }}
                    />
                    <PlayerList 
                        players={searchResults} 
                        friends={friends}
                        addFriend={addFriend}
                        removeFriend={removeFriend}
                        challenge={challengePlayer}
                        showProfile={showPlayerProfile}
                        sessions={multiplayerSessions} />
                </div>
            </BattlechocDialog>
            
            { sessionRefreshActions > 0 ? <CircularProgress style={{ marginTop: '25vh' }} /> : <div className={multiplayerSessions.length > 0 ? 'session-list' : 'empty-list'}>
                { multiplayerSessions.length > 0 ?
                <div className="openGames">
                <div className="gamestable">
                    <div className="tableHead">{t(tr.ACTIONS)}</div>
                    <div className="tableHead">{t(tr.OPPONENT)}</div>
                    <div className="tableHead">{t(tr.TURNS)}</div>
                    <div className="tableHead">{t(tr.LAST_ACTION)}</div>
                    <div className="tableHead">{t(tr.POTENTIAL_COINS)}</div>

                    {Object.assign([], multiplayerSessions).sort(sortByTimestamp).map((row, i) => {
                        let joinGameIcon = <HourglassEmpty onClick={() => enterMultiplayerGame(row.id)} />;
                        if (row.myTurn) {
                            joinGameIcon = <PlayArrow onClick={() => enterMultiplayerGame(row.id)} />;
                        }
                        return [
                            <div key={i} onMouseEnter={() => toggleClassList(i)} onMouseLeave={() => toggleClassList(i)} className={`row.${i} gameActions`}>{ joinGameIcon }<Cancel onClick={() => askSurrenderGame(row.id, row.opponent.name)} /><AccountCircle onClick={() => showPlayerProfile(row)} /></div>,
                            <div key={i+1} onClick={() => showPlayerProfile(row)} className={`row.${i}`} onMouseEnter={() => toggleClassList(i)} onMouseLeave={() => toggleClassList(i)}><span className="gamelabel">player</span><span>{row.opponent.name}</span></div>,
                            <div key={i+2} onClick={() => showPlayerProfile(row)} className={`row.${i}`} onMouseEnter={() => toggleClassList(i)} onMouseLeave={() => toggleClassList(i)}><span className="gamelabel">turns</span><span>{row.turns}</span></div>,
                            <div key={i+3} onClick={() => showPlayerProfile(row)} className={`row.${i}`} onMouseEnter={() => toggleClassList(i)} onMouseLeave={() => toggleClassList(i)}><span className="gamelabel">lastAction</span><span>{timeAgo(row.last_changed)}</span></div>,
                            <div onClick={() => showPlayerProfile(row)} onMouseEnter={() => toggleClassList(i)} onMouseLeave={() => toggleClassList(i)} className={`row.${i} tablefoot`} key={i+4}><span className="gamelabel">potential coins</span><span>{multiplayer.calculateCoinsFromTrackRecord([row.statistics], true)}</span></div>
                        ]
                    })}
                </div></div> : 
                <div className="no-sessions-info">
                    <h4>{t(tr.MULTIPLAYER_INFO_HEADER)}</h4>
                    <p>{t(tr.MULTIPLAYER_INFO_HEADER2)}</p>
                    <ul>
                        <li><Casino />{t(tr.MULTIPLAYER_INFO_CASINO)}</li>
                        <li><People />{t(tr.MULTIPLAYER_INFO_FRIENDS)}</li>
                        <li><Share />{t(tr.MULTIPLAYER_INFO_SHARE)}</li>
                        <li><Search />{t(tr.MULTIPLAYER_INFO_SEARCH)}</li>
                        <li><FormatListNumbered />{t(tr.MULTIPLAYER_INFO_HIGHSCORE)}</li>
                    </ul>
                </div> }
            </div> }
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
    account: state.ui.playerInfos.stats,
    sessionRefreshActions: state.ui.sessionRefreshActions
});

const mapDispatchToProps = {
    showQuickMessage
};

const MultiplayerScreenContainer = connect(
    mapStateToProps,
    mapDispatchToProps
)(MultiplayerScreen);
export default MultiplayerScreenContainer;