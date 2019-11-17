import React, { Component } from 'react';
import PropTypes from 'prop-types';
import './MultiplayerScreen.css';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import TextField from '@material-ui/core/TextField';
import { Button } from '@material-ui/core';
import Fab from '@material-ui/core/Fab';
import CircularProgress from '@material-ui/core/CircularProgress';
import { Jukebox, Translation as t } from '../misc';
import { PersonAddDisabled, PersonAdd, PlayArrow, HourglassEmpty, Cancel, AccountCircle, EmojiEvents, ThumbUp, ThumbDown, ThumbsUpDown, PlusOne, SportsEsports, Delete } from '@material-ui/icons';
import { connect } from 'react-redux';
import TimeAgo from 'javascript-time-ago';
import en from 'javascript-time-ago/locale/en';
import de from 'javascript-time-ago/locale/de';
import { multiplayer } from '../../Multiplayer';
import withMobileDialog from '@material-ui/core/withMobileDialog';
import logger from '../../helper/logger';

class MultiplayerScreen extends Component {
    constructor(props) {
        super(props);
        TimeAgo.addLocale(en);
        TimeAgo.addLocale(de);
        this.state = {
            showPlayerProfile: false,
            showFriends: false,
            showSurrenderDialog: false,
            searchingRandomOpponent: false,
            showSearch: false,
            userSearchText: '',
            searchResults: []
        }
    }

    componentDidMount() {
        this.props.onRef(this);
        multiplayer.getMultiplayerSessions();
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

    showPlayerProfile = profile => {
        this.setState({ 
            showPlayerProfile: true,
            player: profile.opponent,
            profile: profile
        });
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
            showPlayerProfile: false,
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

    async findUser(query) {
        if (query !== '') {
            let results = await multiplayer.findUsers(query); 
            this.setState({searchResults: results});
        }
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

    render() {
        return (
            <div id="multiplayer">
                <Dialog
                    fullWidth={true}
                    fullScreen={this.props.fullScreen}
                    open={this.state.showSurrenderDialog}
                    onClose={() => this.setState({ showSurrenderDialog: false })}>
                    <DialogTitle>{t[this.props.language].SURRENDER_GAME}</DialogTitle>
                    <DialogContent>
                        <p>{t[this.props.language].SURRENDER_GAME_TEXT(this.state.surrenderOpponentName)}</p>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => {
                            Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                            this.setState({ showSurrenderDialog: false, surrenderGameId: undefined, surrenderOpponentName: undefined });
                            this.surrenderGame(this.state.surrenderGameId);
                        }}>{t[this.props.language].SURRENDER}</Button>
                        <Button onClick={() => {
                            Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                            this.setState({ showSurrenderDialog: false, surrenderGameId: undefined, surrenderOpponentName: undefined });
                        }} color="primary">{t[this.props.language].BUTTON_BACK}</Button>
                    </DialogActions>
                </Dialog>

                <Dialog
                    fullWidth={true}
                    fullScreen={this.props.fullScreen}
                    open={this.state.showPlayerProfile}
                    onClose={() => this.setState({ showPlayerProfile: false })}
                    aria-labelledby="playerProfile">
                    <DialogTitle>{this.state.player ? this.state.player.name : 'Chocnonymous'}</DialogTitle>
                    <DialogContent>
                        {this.state.player ? <div className="multiplayer-statistics">
                            <p><span>{this.state.player.level}</span><PlusOne /></p>
                            <p><span>{this.state.player.ranking}</span><EmojiEvents /></p>
                            <p><span>{this.state.player.winnings}</span><ThumbUp /></p>
                            <p><span>{this.state.player.drawn}</span><ThumbsUpDown /></p>
                            <p><span>{this.state.player.losses}</span><ThumbDown /></p>
                        </div> : null}
                    </DialogContent>
                    <DialogActions>
                        {(() => {
                            if (typeof this.props.multiplayerSessions !== 'undefined' && this.state.player) {
                                if (!this.props.multiplayerSessions.map(game => game.opponent.name).includes(this.state.player.name) && this.state.player.name !== this.props.account.username) {
                                    return <Button onClick={() => this.challengePlayer(this.state.player.name)} color="primary">{t[this.props.language].START_GAME}</Button>
                                } else if (typeof this.state.profile.id !== 'undefined') {
                                    return <Button onClick={() => {
                                                Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                                this.props.enterMultiplayerGame(this.state.profile.id);
                                                this.setState({ showPlayerProfile: false });
                                            }} color="primary">{t[this.props.language].JOIN_GAME}</Button>
                                }
                            }
                            return null;                           
                        })()}

                        {(() => {
                            if (typeof this.props.multiplayerSessions !== 'undefined' && this.state.player) {
                                if (!this.props.friends.map(friend => friend.username).includes(this.state.player.name)) {
                                    return <Button onClick={() => {
                                        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                        this.addFriend(this.state.player.name);
                                    }} color="primary" startIcon={<PersonAdd />}>{t[this.props.language].ADD_FRIEND}</Button>
                                } else {
                                    return <Button disabled={this.state.pendingFriendRequest === this.state.player.name} onClick={() => {
                                        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                        this.removeFriend(this.state.player.name);
                                    }} color="primary" startIcon={<PersonAddDisabled />}>{t[this.props.language].REMOVE_FRIEND}</Button>
                                }
                            }
                            return null;
                        })()}

                        <Button onClick={() => {
                            Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                            this.setState({ showPlayerProfile: false });
                        }} color="primary">{t[this.props.language].BUTTON_BACK}</Button>
                    </DialogActions>
                </Dialog>

                <Dialog
                    fullWidth={true}
                    fullScreen={this.props.fullScreen}
                    open={this.state.showFriends}
                    PaperProps={{ style: {backgroundColor: '#f5f5f5'}}}
                    onClose={() => this.setState({ showFriends: false })}
                    aria-labelledby="friendsList">
                    <DialogTitle>{t[this.props.language].FRIENDS}</DialogTitle>
                    <DialogContent>
                        <div id="friendsList">
                            {this.props.friends.length > 0 ? this.props.friends.sort().map((friend, i) => <div key={i} className="friendsRow">
                                    <div>{friend.username}</div>
                                    <div>
                                        <Fab size="small" disabled={this.state.pendingFriendRequest === friend.username || this.canNotChallenge(friend.username)} color="primary" aria-label="play" onClick={() => this.challengePlayer(friend.username)}><SportsEsports /></Fab>
                                        <Fab size="small" disabled={this.state.pendingFriendRequest === friend.username} color="primary" aria-label="delete" onClick={() => this.removeFriend(friend.username)} ><Delete /></Fab>
                                    </div>
                                </div>) : <p>{t[this.props.language].FRIENDS_INFO}</p> }
                        </div>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => {
                            Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                            this.setState({ showFriends: false });
                        }} color="primary">{t[this.props.language].BUTTON_BACK}</Button>                    
                    </DialogActions>
                </Dialog>

                <Dialog
                    fullWidth={true}
                    fullScreen={this.props.fullScreen}
                    open={this.state.showSearch}
                    PaperProps={{ style: {backgroundColor: '#f5f5f5'}}}
                    onClose={() => this.setState({ showSearch: false })}
                    aria-labelledby="searchFriends">
                    <DialogTitle>{t[this.props.language].SEARCH_PLAYERS}</DialogTitle>
                    <DialogContent>
                        <TextField
                            label="Name"
                            value={this.state.userSearchText}
                            inputProps={{ spellCheck: 'false' }}
                            InputLabelProps={{ style: {color: 'rgba(69, 123, 130, 0.8)' }}}
                            onChange={event => {
                                this.setState({userSearchText: event.target.value});
                                this.findUser(event.target.value);
                            }}
                            margin="normal"
                        /> 
                        <div id="friendsList">
                            {this.state.searchResults.length > 0 ? this.state.searchResults.map((user, i) => <div key={i} 
                                onClick={() => this.showPlayerProfile({ opponent: user })} className="friendsRow">
                                    <div>{user.name}</div>
                                </div>) : <p>{t[this.props.language].SEARCH_USER_INFO}</p> }
                        </div>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => {
                            Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                            this.setState({ showSearch: false });
                        }} color="primary">{t[this.props.language].BUTTON_BACK}</Button>                    
                    </DialogActions>
                </Dialog>

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
                <div className="openGames">
                    <div className="gamestable">
                        <div className="tableHead">{t[this.props.language].ACTIONS}</div>
                        <div className="tableHead">{t[this.props.language].OPPONENT}</div>
                        <div className="tableHead">{t[this.props.language].TURNS}</div>
                        <div className="tableHead">{t[this.props.language].LAST_ACTION}</div>
                        <div className="tableHead">{t[this.props.language].POTENTIAL_COINS}</div>

                        {typeof this.props.multiplayerSessions !== 'undefined' ? this.props.multiplayerSessions.sort(this.sortByTimestamp).map((row, i) => {
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
                </div>
            </div>
        );
    }
}

MultiplayerScreen.propTypes = {
    enterMultiplayerGame: PropTypes.func.isRequired,
    fullScreen: PropTypes.bool.isRequired
}

const mapStateToProps = state => ({
    game: state.gameplay.game,
    language: state.ui.language,
    multiplayerSessions: state.ui.multiplayerSessions,
    friends: state.ui.friends,
    account: state.ui.playerInfos.stats
});

const MultiplayerScreenContainer = connect(mapStateToProps)(MultiplayerScreen);
export default withMobileDialog({ breakpoint: 'md' })(MultiplayerScreenContainer);