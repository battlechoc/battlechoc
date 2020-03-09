import React, { Component } from 'react';
import PropTypes from 'prop-types';
import './MultiplayerScreen.css';
import TextField from '@material-ui/core/TextField';
import Fab from '@material-ui/core/Fab';
import CircularProgress from '@material-ui/core/CircularProgress';
import { Jukebox, translate as t, getCurrentLanguage } from '../misc';
import Axios from 'axios';
import { showQuickMessage } from '../UiActions';
import { PlayArrow, ChevronRight, LastPage, FirstPage, ChevronLeft, HourglassEmpty, Cancel, AccountCircle, FormatListNumbered, Casino, People, Search, Share } from '@material-ui/icons';
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

class MultiplayerScreen extends Component {
    constructor(props) {
        super(props);
        TimeAgo.addLocale(en);
        TimeAgo.addLocale(de);
        this.state = {
            showFriends: false,
            showSurrenderDialog: false,
            searchingRandomOpponent: false,
            showSearch: false,
            userSearchText: '',
            searchResults: [],
            waitForResponse: false,
            badInternetConnection: false,
            showHighscore: false,
            highscoreLoading: false,
            highscore: [],
            highscoreLastPage: 1,
            highscorePage: 1
        }
        this.source = Axios.CancelToken.source();
        this.inputRef = React.createRef();
        this.requestRunning = false;
    }

    componentDidMount() {
        this.props.onRef(this);
        multiplayer.getMultiplayerSessions(() => this.props.showQuickMessage({ text: t('SESSION_REFRESH_FAILED')}));
        multiplayer.fetchFriendsList();

        this.shouldAskForPermissionTimeout = setTimeout(() => {
            if (multiplayer.shouldAskForNotificationPermission()) {
                this.props.showQuickMessage({ text: t('NOTIFICATION_PERMISSION_INFO'), variant: 'info' });
                this.askForPermissionTimeout = setTimeout(() => multiplayer.askForNotificationPermission(), 5000);
            }
        }, 2000);
    }

    componentWillUnmount() {
        clearTimeout(this.shouldAskForPermissionTimeout);
        clearTimeout(this.askForPermissionTimeout);
    }

    timeToString(millis) {
        let seconds = Math.floor(millis / 1000);
        let hours = Math.floor(seconds / 3600);
        seconds -= hours * 3600;
        let min = Math.floor(seconds / 60);
        seconds -= min * 60;

        seconds = '' + seconds;
        seconds = ('00' + seconds).substring(seconds.length);

        if (hours > 0) {
            min = '' + min;
            min = ('00' + min).substring(min.length);
            return hours + ":" + min + ":" + seconds;
        }
        else {
            return min + ":" + seconds;
        }
    }

    timeAgo(millis) {
        let timeAgo = new TimeAgo('en-US');

        if (getCurrentLanguage() === 'de') {
            timeAgo = new TimeAgo('de-DE');
        }
        
        let timeSinceUpdate = timeAgo.format(millis);
        return timeSinceUpdate; 
    }

    toggleClassList = id => {
        Array.from(document.getElementsByClassName(`row.${id}`)).forEach(div => div.classList.toggle('selected'));
    }

    showPlayerProfile = session => {
        this.props.openAccountOverview(session.opponent);
    }

    joinGame = sessionId => {
        this.props.enterMultiplayerGame(sessionId);
    }

    removeFriend = async friend => {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        this.setState({ pendingFriendRequest: friend });
        await multiplayer.removeFriend(friend);
        this.setState({ pendingFriendRequest: undefined });
    }

    addFriend = async friend => {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        this.setState({ pendingFriendRequest: friend });
        await multiplayer.addFriend(friend);
        this.setState({ pendingFriendRequest: undefined });       
    } 

    canNotChallenge = username => {
        return this.props.multiplayerSessions.map(session => session.opponent.name).includes(username);
    }

    challengePlayer = async username => {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        this.setState({ 
            showFriends: false,
            showSearch: false
        });
        await multiplayer.challengePlayer(username);
        multiplayer.getMultiplayerSessions();        
    }

    askSurrenderGame = (sessionId, opponent) => {
        this.setState({ showSurrenderDialog: true, surrenderGameId: sessionId, surrenderOpponentName: opponent });
    }

    surrenderGame = async sessionId => {
        await multiplayer.surrenderGame(sessionId);
        multiplayer.getMultiplayerSessions();
    }

    sortByTimestamp( a, b ) {
      if ( a.last_changed < b.last_changed ){
        return 1;
      }
      if ( a.last_changed > b.last_changed ){
        return -1;
      }
      return 0;
    }

    sortByUsername( a, b ) {
      if ( a.username > b.username ){
        return 1;
      }
      if ( a.username < b.username ){
        return -1;
      }
      return 0;
    }

    async searchUser() {
        if (this.state.userSearchText !== '') {             
            clearTimeout(this.requestTimeout);
            if (this.requestRunning) {
                this.source.cancel();
            }

            this.setState({ searchResults: [] });
            let queryString = this.state.userSearchText;
            this.requestTimeout = (setTimeout( 
                async () => {
                    this.setState({ waitForResponse: true });
                    this.source = Axios.CancelToken.source();
                    this.requestRunning = true;

                    try {
                        let response = await ServerRequest('get', '/query/user/' + queryString, this.source.token);
                        this.setState({ badInternetConnection: false, searchResults: response.data });
                        this.inputRef.current.blur();
                    } catch(error) {
                        if (error instanceof NoHealthyInternetConnectionError || error.code === 'auth/network-request-failed') {
                            this.setState({ badInternetConnection: true });
                        } else if (!Axios.isCancel(error)) {
                            logger.warn(error);
                            this.setState({ searchResults: [] });
                        }
                    } finally {
                        this.requestRunning = false;
                        this.setState({ waitForResponse: false });
                    }
                }, 500));
        }
    }

    openFriendsPage = () => this.setState({ showFriends: true })

    openSearchPage = () => this.setState({ showSearch: true })

    openHighscorePage = page => {
        this.setState({ showHighscore: true, highscoreLoading: true, highscore: [] }, async () => {
            try {
                let highscore = await multiplayer.fetchHighscore(page);
                this.setState({ 
                    highscoreLoading: false, 
                    highscore: highscore.list, 
                    highscorePage: highscore.page, 
                    highscoreLastPage: highscore.lastPage 
                });
            } catch (error) {
                logger.warn(error);
                this.props.showQuickMessage({ text: t('FETCH_HIGHSCORE_FAILED')});
                this.setState({ showHighscore: false, highscoreLoading: false });
            }
        });
    }

    render() {
        return (
            <div id="multiplayer">
                <BattlechocDialog
                    open={this.state.showSurrenderDialog}
                    close={() => this.setState({ showSurrenderDialog: false })}
                    title={t('SURRENDER_GAME')}>
                    <div className="surrenderDialog">
                        <p>{t('SURRENDER_GAME_TEXT', this.state.surrenderOpponentName)}</p>
                        <div className="menuButton" onClick={() => {
                            Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                            this.setState({ showSurrenderDialog: false, surrenderGameId: undefined, surrenderOpponentName: undefined });
                            this.surrenderGame(this.state.surrenderGameId);
                        }}>{t('SURRENDER')}</div>
                    </div>
                </BattlechocDialog>

                <BattlechocDialog
                    open={this.state.showFriends}
                    close={() => this.setState({ showFriends: false })}
                    title={t('FRIENDS')}>
                    <PlayerList 
                        players={this.props.friends} 
                        removeFriend={this.removeFriend}
                        challenge={this.challengePlayer}
                        showProfile={this.showPlayerProfile}
                        sessions={this.props.multiplayerSessions} />
                </BattlechocDialog>

                <BattlechocDialog
                    open={this.state.showHighscore}
                    close={() => this.setState({ showHighscore: false })}
                    title="Highscore">
                    <div className="highscore-page">
                        <div className="highscore-paginator">
                            <div>
                                <Fab
                                    size="small"
                                    color="primary"
                                    className="icon"
                                    disabled={this.state.highscorePage === 1}
                                    onClick={() => this.openHighscorePage(1) }>
                                    <FirstPage />
                                </Fab>
                                <Fab
                                    size="small"
                                    color="primary"
                                    className="icon"
                                    disabled={this.state.highscorePage === 1}
                                    onClick={() => this.openHighscorePage(Math.max(this.state.highscorePage - 1, 1))}>
                                    <ChevronLeft />
                                </Fab>
                            </div>
                            { this.state.highscoreLoading ? <CircularProgress size={22} /> : <span style={{color: '#324D5C'}}>{t('ACCOUNT_OVERVIEW_RANK')} {this.state.highscore.length > 0 ? `${this.state.highscore[0].ranking} - ${this.state.highscore[this.state.highscore.length - 1].ranking}` : '1 - 1'}</span> }
                            <div>
                                <Fab
                                    size="small"
                                    color="primary"
                                    className="icon"
                                    disabled={this.state.highscorePage === this.state.highscoreLastPage}
                                    onClick={() => {
                                        this.openHighscorePage(Math.min(this.state.highscorePage + 1, this.state.highscoreLastPage))}
                                    }>
                                    <ChevronRight />
                                </Fab> 
                                <Fab
                                    size="small"
                                    color="primary"
                                    className="icon"
                                    disabled={this.state.highscorePage === this.state.highscoreLastPage}
                                    onClick={() => this.openHighscorePage(this.state.highscoreLastPage) }>
                                    <LastPage />
                                </Fab> 
                            </div>
                        </div>
                        { this.state.highscoreLoading ? null : <PlayerList 
                            withScore={true}
                            username={this.props.account.username}
                            players={this.state.highscore} 
                            friends={this.props.friends}
                            removeFriend={this.removeFriend}
                            addFriend={this.addFriend}
                            challenge={this.challengePlayer}
                            showProfile={this.showPlayerProfile}
                            sessions={this.props.multiplayerSessions} /> }
                    </div>
                </BattlechocDialog>

                <BattlechocDialog
                    open={this.state.showSearch}
                    close={() => this.setState({ showSearch: false })}
                    title={t('SEARCH_PLAYERS')}>
                    <div className="playerSearchDialog">
                        <TextField
                            label="Name"
                            value={this.state.userSearchText}
                            error={this.state.badInternetConnection && !this.state.waitForResponse}
                            helperText={this.state.badInternetConnection && !this.state.waitForResponse ? t('NO_HEALTHY_INTERNET') : ''}
                            style={{display: 'flex'}}
                            inputProps={{ spellCheck: 'false', autoFocus: true }}
                            InputLabelProps={{ style: {color: 'rgba(69, 123, 130, 0.8)' }}}
                            onChange={event => {
                                this.setState({userSearchText: event.target.value}, () => this.searchUser());
                            }}
                            margin="normal"
                            InputProps={{ 
                                endAdornment: this.state.waitForResponse ? <CircularProgress size={18} /> : null,
                                inputRef: this.inputRef
                            }}
                        />
                        <PlayerList 
                            players={this.state.searchResults} 
                            friends={this.props.friends}
                            addFriend={this.addFriend}
                            removeFriend={this.removeFriend}
                            challenge={this.challengePlayer}
                            showProfile={this.showPlayerProfile}
                            sessions={this.props.multiplayerSessions} />
                    </div>
                </BattlechocDialog>
                
                { this.props.sessionRefreshActions > 0 ? <CircularProgress style={{ marginTop: '25vh' }} /> : <div className={this.props.multiplayerSessions.length > 0 ? 'session-list' : 'empty-list'}>
                    { this.props.multiplayerSessions.length > 0 ?
                    <div className="openGames">
                    <div className="gamestable">
                        <div className="tableHead">{t('ACTIONS')}</div>
                        <div className="tableHead">{t('OPPONENT')}</div>
                        <div className="tableHead">{t('TURNS')}</div>
                        <div className="tableHead">{t('LAST_ACTION')}</div>
                        <div className="tableHead">{t('POTENTIAL_COINS')}</div>

                        {Object.assign([], this.props.multiplayerSessions).sort(this.sortByTimestamp).map((row, i) => {
                            let joinGameIcon = <HourglassEmpty onClick={() => this.props.enterMultiplayerGame(row.id)} />;
                            if (row.myTurn) {
                                joinGameIcon = <PlayArrow onClick={() => this.props.enterMultiplayerGame(row.id)} />;
                            }
                            return [
                                <div key={i} onMouseEnter={() => this.toggleClassList(i)} onMouseLeave={() => this.toggleClassList(i)} className={`row.${i} gameActions`}>{ joinGameIcon }<Cancel onClick={() => this.askSurrenderGame(row.id, row.opponent.name)} /><AccountCircle onClick={() => this.showPlayerProfile(row)} /></div>,
                                <div key={i+1} onClick={() => this.showPlayerProfile(row)} className={`row.${i}`} onMouseEnter={() => this.toggleClassList(i)} onMouseLeave={() => this.toggleClassList(i)}><span className="gamelabel">player</span><span>{row.opponent.name}</span></div>,
                                <div key={i+2} onClick={() => this.showPlayerProfile(row)} className={`row.${i}`} onMouseEnter={() => this.toggleClassList(i)} onMouseLeave={() => this.toggleClassList(i)}><span className="gamelabel">turns</span><span>{row.turns}</span></div>,
                                <div key={i+3} onClick={() => this.showPlayerProfile(row)} className={`row.${i}`} onMouseEnter={() => this.toggleClassList(i)} onMouseLeave={() => this.toggleClassList(i)}><span className="gamelabel">lastAction</span><span>{this.timeAgo(row.last_changed)}</span></div>,
                                <div onClick={() => this.showPlayerProfile(row)} onMouseEnter={() => this.toggleClassList(i)} onMouseLeave={() => this.toggleClassList(i)} className={`row.${i} tablefoot`} key={i+4}><span className="gamelabel">potential coins</span><span>{multiplayer.calculateCoinsFromTrackRecord([row.statistics], true)}</span></div>
                            ]
                        })}
                    </div></div> : 
                    <div className="no-sessions-info">
                        <h4>{t('MULTIPLAYER_INFO_HEADER')}</h4>
                        <p>{t('MULTIPLAYER_INFO_HEADER2')}</p>
                        <ul>
                            <li><Casino />{t('MULTIPLAYER_INFO_CASINO')}</li>
                            <li><People />{t('MULTIPLAYER_INFO_FRIENDS')}</li>
                            <li><Share />{t('MULTIPLAYER_INFO_SHARE')}</li>
                            <li><Search />{t('MULTIPLAYER_INFO_SEARCH')}</li>
                            <li><FormatListNumbered />{t('MULTIPLAYER_INFO_HIGHSCORE')}</li>
                        </ul>
                    </div> }
                </div> }
            </div>
        );
    }
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