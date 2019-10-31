import React, { Component } from 'react';
import PropTypes from 'prop-types';
import './MultiplayerScreen.css';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import { Button } from '@material-ui/core';
import { Jukebox, Translation as t } from '../misc';
import { PlayArrow, Cancel, AccountCircle, EmojiEvents, ThumbUp, ThumbDown, ThumbsUpDown, PlusOne } from '@material-ui/icons';
import { connect } from 'react-redux';
import TimeAgo from 'javascript-time-ago';
import en from 'javascript-time-ago/locale/en';
import de from 'javascript-time-ago/locale/de';
import { multiplayer } from '../../Multiplayer';

class MultiplayerScreen extends Component {
    constructor(props) {
        super(props);
        TimeAgo.addLocale(en);
        TimeAgo.addLocale(de);
        this.state = {
            showPlayerProfile: false,
        }
    }

    componentDidMount() {
        this.props.onRef(this);
        multiplayer.getMultiplayerSessions();
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

    render() {
        return (
            <div id="multiplayer">
                <Dialog
                    fullWidth={true}
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
                                if (!this.props.multiplayerSessions.map(game => game.opponent.name).includes(this.state.player.name)) {
                                    return <Button onClick={() => {
                                                Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                                multiplayer.challengePlayer(this.state.player.name);
                                                this.setState({ showPlayerProfile: false });
                                                multiplayer.getMultiplayerSessions().then(games => {
                                                    this.setState({ openGames:  games});
                                                });
                                            }} color="primary">{t[this.props.language].START_GAME}</Button>
                                } else {
                                    return <Button onClick={() => {
                                                Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                                this.props.enterMultiplayerGame(this.state.profile.id);
                                                this.setState({ showPlayerProfile: false });
                                            }} color="primary">{t[this.props.language].JOIN_GAME}</Button>
                                }
                            } else {
                                return null;
                            }
                        })()}

                        <Button onClick={() => {
                            Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                            this.setState({ showPlayerProfile: false });
                        }} color="primary">{t[this.props.language].BUTTON_BACK}</Button>
                    </DialogActions>
                </Dialog>

                <div className="controls">
                    <div className="menuButton">{t[this.props.language].RANDOM_OPPONENT}</div>
                    <div className="menuButton" onClick={() => {
                        multiplayer.createChallengeMeLink().then(link => {
                            console.log(link);
                            if (navigator.share) {
                                navigator.share({
                                    title: window.document.title,
                                    text: t[this.props.language].INVITATION,
                                    url: link,
                                }).catch((error) => console.log('error sharing multiplayer session', error));
                            } else {
                                let whatsappWindowRef = window.open();
                                whatsappWindowRef.location = 'https://api.whatsapp.com/send?text=' + encodeURIComponent(t[this.props.language].INVITATION + ' - ' + link);
                            }
                        });
                    }}>{t[this.props.language].SHARE_LINK}</div>
                    <div className="menuButton">{t[this.props.language].FRIENDS}</div>
                </div>
                <div className="openGames">
                    <div className="gamestable">
                        <div className="tableHead">{t[this.props.language].ACTIONS}</div>
                        <div className="tableHead">{t[this.props.language].OPPONENT}</div>
                        <div className="tableHead">{t[this.props.language].TURNS}</div>
                        <div className="tableHead">{t[this.props.language].LAST_ACTION}</div>
                        <div className="tableHead">{t[this.props.language].POTENTIAL_COINS}</div>

                        {typeof this.props.multiplayerSessions !== 'undefined' ? this.props.multiplayerSessions.map((row, i) => (
                            [
                                <div key={i} onMouseEnter={() => this.toggleClassList(i)} onMouseLeave={() => this.toggleClassList(i)} className={`row.${i} gameActions`}><PlayArrow onClick={() => this.props.enterMultiplayerGame(row.id)} /><Cancel /><AccountCircle onClick={() => this.showPlayerProfile(row)} /></div>,
                                <div key={i+1} onClick={() => this.showPlayerProfile(row)} className={`row.${i}`} onMouseEnter={() => this.toggleClassList(i)} onMouseLeave={() => this.toggleClassList(i)}><span className="gamelabel">player</span><span>{row.opponent.name}</span></div>,
                                <div key={i+2} onClick={() => this.showPlayerProfile(row)} className={`row.${i}`} onMouseEnter={() => this.toggleClassList(i)} onMouseLeave={() => this.toggleClassList(i)}><span className="gamelabel">turns</span><span>{row.turns}</span></div>,
                                <div key={i+3} onClick={() => this.showPlayerProfile(row)} className={`row.${i}`} onMouseEnter={() => this.toggleClassList(i)} onMouseLeave={() => this.toggleClassList(i)}><span className="gamelabel">lastAction</span><span>{this.timeAgo(row.last_changed)}</span></div>,
                                <div onClick={() => this.showPlayerProfile(row)} onMouseEnter={() => this.toggleClassList(i)} onMouseLeave={() => this.toggleClassList(i)} className={`row.${i} tablefoot`} key={i+4}><span className="gamelabel">potential coins</span><span>{multiplayer.calculateCoinsFromTrackRecord([row.statistics], true)}</span></div>
                            ]
                        )) : null}
                    </div>
                </div>
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
    multiplayerSessions: state.ui.multiplayerSessions
});

const MultiplayerScreenContainer = connect(mapStateToProps)(MultiplayerScreen);
export default MultiplayerScreenContainer;