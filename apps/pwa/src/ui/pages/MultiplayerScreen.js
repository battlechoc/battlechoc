import React, { Component } from 'react';
import PropTypes from 'prop-types';
import './MultiplayerScreen.css';
import TextField from '@material-ui/core/TextField';
import CircularProgress from '@material-ui/core/CircularProgress';
import { Jukebox, Translation as t } from '../misc';
import Axios from 'axios';
import { showQuickMessage } from '../UiActions';
import { PlayArrow, HourglassEmpty, Cancel, AccountCircle } from '@material-ui/icons';
import { connect } from 'react-redux';
import TimeAgo from 'javascript-time-ago';
import en from 'javascript-time-ago/locale/en';
import de from 'javascript-time-ago/locale/de';
import { multiplayer } from '../../Multiplayer';
import { ServerRequest } from '../../helper/settings';
import logger from '../../helper/logger';
import BattlechocDialog from '../dialogs/BattlechocDialog';
import PlayerList from '../controls/PlayerList';
import { NoHealthyInternetConnectionError } from '../../gameplay/Errors';

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
            badInternetConnection: false
        }
        this.source = Axios.CancelToken.source();
        this.inputRef = React.createRef();
        this.requestRunning = false;
    }

    componentDidMount() {
        this.props.onRef(this);
        multiplayer.getMultiplayerSessions(() => this.props.showQuickMessage({ text: t[this.props.language].SESSION_REFRESH_FAILED}));
        multiplayer.fetchFriendsList();
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

        if (this.props.language === 'de') {
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

    tryToJoinGame = async (sessionId, sessions) => {
        if (sessions.map(session => session.id).includes(sessionId)) {
            this.props.enterMultiplayerGame(sessionId);
        } else {
            logger.warn('unknown session id for joining');
        }
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
                        let users = response.data;
                        users.forEach(user => {
                            if (typeof user.level === 'string') {
                                user.level = 1;
                            }
                        });
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

    render() {
        return (
            <div id="multiplayer">
                <BattlechocDialog
                    open={this.state.showSurrenderDialog}
                    close={() => this.setState({ showSurrenderDialog: false })}
                    title={t[this.props.language].SURRENDER_GAME}>
                    <div className="surrenderDialog">
                        <p>{t[this.props.language].SURRENDER_GAME_TEXT(this.state.surrenderOpponentName)}</p>
                        <div className="menuButton" onClick={() => {
                            Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                            this.setState({ showSurrenderDialog: false, surrenderGameId: undefined, surrenderOpponentName: undefined });
                            this.surrenderGame(this.state.surrenderGameId);
                        }}>{t[this.props.language].SURRENDER}</div>
                    </div>
                </BattlechocDialog>

                <BattlechocDialog
                    open={this.state.showFriends}
                    close={() => this.setState({ showFriends: false })}
                    title={t[this.props.language].FRIENDS}>
                    <PlayerList 
                        players={this.props.friends} 
                        removeFriend={this.removeFriend}
                        challenge={this.challengePlayer}
                        showProfile={this.showPlayerProfile}
                        sessions={this.props.multiplayerSessions} />
                </BattlechocDialog>

                <BattlechocDialog
                    open={this.state.showSearch}
                    close={() => this.setState({ showSearch: false })}
                    title={t[this.props.language].SEARCH_PLAYERS}>
                    <div className="playerSearchDialog">
                        <TextField
                            label="Name"
                            value={this.state.userSearchText}
                            error={this.state.badInternetConnection && !this.state.waitForResponse}
                            helperText={this.state.badInternetConnection && !this.state.waitForResponse ? t[this.props.language].NO_HEALTHY_INTERNET : ''}
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

                <div className="controls">
                    <div className={(this.state.searchingRandomOpponent ? "disabled " : "") + "menuButton"} onClick={() => {
                        if (!this.state.searchingRandomOpponent) {
                            this.setState({ searchingRandomOpponent: true }, async () => {
                                try {
                                    let player = await multiplayer.findRandomPlayer();
                                    this.showPlayerProfile({ opponent: player });
                                } catch (error) {
                                    logger.warn(error.toString());
                                } finally {
                                    this.setState({ searchingRandomOpponent: false });
                                }
                            });
                        } 
                    }} >{this.state.searchingRandomOpponent ? <CircularProgress style={{ filter: 'brightness(1.5)', height: '1rem'}} size={18} /> : t[this.props.language].RANDOM_OPPONENT}</div>
                    <div className="menuButton" onClick={() => {
                        multiplayer.createChallengeMeLink().then(link => {
                            if (navigator.share) {
                                navigator.share({
                                    title: window.document.title,
                                    text: t[this.props.language].INVITATION,
                                    url: link,
                                }).catch((error) => logger.info('error sharing multiplayer session', error));
                            } else {
                                let whatsappWindowRef = window.open();
                                whatsappWindowRef.location = 'https://api.whatsapp.com/send?text=' + encodeURIComponent(t[this.props.language].INVITATION + ' - ' + link);
                            }
                        });
                    }}>{t[this.props.language].SHARE_LINK}</div>
                    <div className="menuButton" onClick={() => {
                        this.setState({ showFriends: true })
                    }}>{t[this.props.language].FRIENDS}</div>
                    <div className="menuButton" onClick={() => {
                        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                        this.setState({ showSearch: true });
                    }}>{t[this.props.language].SEARCH_PLAYERS}</div>
                </div>
                
                { this.props.sessionRefreshActions > 0 ? <CircularProgress /> : <div className="openGames">
                    <div className="gamestable">
                        <div className="tableHead">{t[this.props.language].ACTIONS}</div>
                        <div className="tableHead">{t[this.props.language].OPPONENT}</div>
                        <div className="tableHead">{t[this.props.language].TURNS}</div>
                        <div className="tableHead">{t[this.props.language].LAST_ACTION}</div>
                        <div className="tableHead">{t[this.props.language].POTENTIAL_COINS}</div>

                        {typeof this.props.multiplayerSessions !== 'undefined' ? Object.assign([], this.props.multiplayerSessions).sort(this.sortByTimestamp).map((row, i) => {
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
                        }) : null}
                    </div>
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
    language: state.ui.language,
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