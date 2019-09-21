import React, { Component } from 'react';
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

class MultiplayerScreen extends Component {
    constructor(props) {
        super(props);
        TimeAgo.addLocale(en);
        TimeAgo.addLocale(de);
        this.state = {
            showPlayerProfile: false,
            openGames: [
                {
                    'playerName': 'Sebastian',
                    'turns': 12,
                    'matchTime': 201000,
                    'lastAction': 1566153558102,
                    'potentialCoins': 246,
                    'level': 15,
                    'ranking': 129,
                    'winnings': 17,
                    'drawn': 0,
                    'losses': 8
                },
                {
                    'playerName': 'Caro',
                    'turns': 5,
                    'matchTime': 91800,
                    'lastAction': 1566153373262,
                    'potentialCoins': 49,
                    'level': 12,
                    'ranking': 231,
                    'winnings': 13,
                    'drawn': 1,
                    'losses': 9
                },
            ]
        }
    }

    componentDidMount() {
        this.props.onRef(this);
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
            player: profile
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
                    <DialogTitle>{this.state.player ? this.state.player.playerName : null}</DialogTitle>
                    <DialogContent>
                        {this.state.player ? <div className="statistics">
                            <p><span>{this.state.player.level}</span><PlusOne /></p>
                            <p><span>{this.state.player.ranking}</span><EmojiEvents /></p>
                            <p><span>{this.state.player.winnings}</span><ThumbUp /></p>
                            <p><span>{this.state.player.drawn}</span><ThumbsUpDown /></p>
                            <p><span>{this.state.player.losses}</span><ThumbDown /></p>
                        </div> : null}
                    </DialogContent>
                    <DialogActions>
                        { this.state.player && !this.state.openGames.map(game => game.playerName).includes(this.state.player.playerName) ? <Button onClick={() => {
                            Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                            this.setState({ showPlayerProfile: false });
                        }} color="primary">{t[this.props.language].START_GAME}</Button> : null }

                        <Button onClick={() => {
                            Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                            this.setState({ showPlayerProfile: false });
                        }} color="primary">{t[this.props.language].BUTTON_BACK}</Button>
                    </DialogActions>
                </Dialog>

                <div className="controls">
                    <div className="menuButton">{t[this.props.language].RANDOM_OPPONENT}</div>
                    <div className="menuButton">{t[this.props.language].SHARE_LINK}</div>
                    <div className="menuButton">{t[this.props.language].FRIENDS}</div>
                </div>
                <div className="openGames">
                    <div className="gamestable">
                        <div className="tableHead">{t[this.props.language].ACTIONS}</div>
                        <div className="tableHead">{t[this.props.language].PLAYER}</div>
                        <div className="tableHead">{t[this.props.language].TURNS}</div>
                        <div className="tableHead">{t[this.props.language].MATCH_TIME}</div>
                        <div className="tableHead">{t[this.props.language].LAST_ACTION}</div>
                        <div className="tableHead">{t[this.props.language].POTENTIAL_COINS}</div>

                        {this.state.openGames.map((row, i) => (
                            [
                                <div key={i} onClick={() => this.showPlayerProfile(row)} onMouseEnter={() => this.toggleClassList(i)} onMouseLeave={() => this.toggleClassList(i)} className={`row.${i} gameActions`}><PlayArrow /><Cancel /><AccountCircle /></div>,
                                <div key={i+1} onClick={() => this.showPlayerProfile(row)} className={`row.${i}`} onMouseEnter={() => this.toggleClassList(i)} onMouseLeave={() => this.toggleClassList(i)}><span className="gamelabel">player</span><span>{row.playerName}</span></div>,
                                <div key={i+2} onClick={() => this.showPlayerProfile(row)} className={`row.${i}`} onMouseEnter={() => this.toggleClassList(i)} onMouseLeave={() => this.toggleClassList(i)}><span className="gamelabel">turns</span><span>{row.turns}</span></div>,
                                <div key={i+3} onClick={() => this.showPlayerProfile(row)} className={`row.${i}`} onMouseEnter={() => this.toggleClassList(i)} onMouseLeave={() => this.toggleClassList(i)}><span className="gamelabel">match</span><span>{this.timeToString(row.matchTime)}</span></div>,
                                <div key={i+4} onClick={() => this.showPlayerProfile(row)} className={`row.${i}`} onMouseEnter={() => this.toggleClassList(i)} onMouseLeave={() => this.toggleClassList(i)}><span className="gamelabel">lastAction</span><span>{this.timeAgo(row.lastAction)}</span></div>,
                                <div onClick={() => this.showPlayerProfile(row)} onMouseEnter={() => this.toggleClassList(i)} onMouseLeave={() => this.toggleClassList(i)} className={`row.${i} tablefoot`} key={i+5}><span className="gamelabel">potential coins</span><span>{row.potentialCoins}</span></div>
                            ]
                        ))}
                    </div>
                </div>
            </div>
        );
    }
}

const mapStateToProps = state => ({
    game: state.gameplay.game,
    language: state.ui.language
});

const MultiplayerScreenContainer = connect(mapStateToProps)(MultiplayerScreen);
export default MultiplayerScreenContainer;