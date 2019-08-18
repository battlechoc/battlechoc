import React, { Component } from 'react';
import './Hud.css';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import OfflineStore from '../OfflineStore';
import { GameStateTypes } from '../gameplay/GameplayReducer';
import { Actionbar, InfoPanel, BuildingPalette, AttackPalette, GameStartSelection, SocialIcons, GameEndOverview } from './controls';
import { Jukebox, Translation as t } from './misc';
import { Info, Tooltip, Settings, AppleHint, SignInOrUp} from './dialogs';
import { CircularProgress, Button } from '@material-ui/core';
import Dialog from '@material-ui/core/Dialog';
import Typography from '@material-ui/core/Typography';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableHead from '@material-ui/core/TableHead';
import TablePagination from '@material-ui/core/TablePagination';
import TableRow from '@material-ui/core/TableRow';
import TableSortLabel from '@material-ui/core/TableSortLabel';
import TimeAgo from 'javascript-time-ago';
import en from 'javascript-time-ago/locale/en';
import de from 'javascript-time-ago/locale/de';
import { PlayArrow, Cancel, HourglassEmpty } from '@material-ui/icons';
import Icon from '@material-ui/core/Icon';

class Hud extends Component {
    constructor(props) {
        super(props);
        this.state = { 
            clickable: true,
            open: false,
            multiplayerScreen: false,
            openGames: [
                {
                    'playerName': 'Sebastian',
                    'playerId': 'W829ALK2',
                    'turns': 12,
                    'matchTime': 201000,
                    'lastAction': 1566153558102,
                    'potentialCoins': 246
                },
                {
                    'playerName': 'Caro',
                    'playerId': 'GH73ZEE9',
                    'turns': 5,
                    'matchTime': 91800,
                    'lastAction': 1566153373262,
                    'potentialCoins': 49
                }
            ]
        }
    }

    componentDidMount() {
        this.props.onRef(this);
        TimeAgo.addLocale(en);
        TimeAgo.addLocale(de);
    }

    unlockUi() {
        this.setState({ clickable: true });
    }

    lockUi() {
        this.setState({ clickable: false });
    }

    estimateStage() {
        const state = this.props.state;
        if (typeof state === 'undefined' && !this.state.multiplayerScreen) {
            return 'TITLE_SCREEN'
        } else if (state === GameStateTypes.START ||
            state === GameStateTypes.CHOOSE_FIELD_OR_START ||
            state === GameStateTypes.CHOOSE_FIELD) {
            return 'CHOOSE_MENU';
        } else if (this.state.multiplayerScreen) {
            return 'MULTIPLAYER_SCREEN';
        } else {
            return 'INGAME';
        }
    }

    openSettings = () => {
        OfflineStore.settingsStore.get('tutorialAlreadySeen').then(tutorialAlreadySeen => {
            Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
            this.settings.open(tutorialAlreadySeen);
        });
    }

    openSignInOrUp = () => {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        this.signInOrUp.open();
    }

    resumeOrStartGame = () => {
        if (this.props.resumeGamePossible) {
            this.setState({ open: true })
        } else {
            this.props.prepareNewGameCallback(false);
        }
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
        let timeSinceUpdate = timeAgo.format(millis);
        return timeSinceUpdate; 
    }

    render() {
        const stage = this.estimateStage();
        let textAnimation = typeof this.state.message === 'undefined' ? undefined : <div id="textAnimation" className="zoom">{this.state.message}</div>
        return (
            <div className={this.props.className}>
                <Tooltip />
                <Settings startTutorial={this.props.startTutorial} endGame={this.props.endGame} onRef={settings => (this.settings = settings)} />
                <SignInOrUp onRef={signInOrUp => (this.signInOrUp = signInOrUp)} />
                <Actionbar showSettings={this.openSettings} showSignInOrUp={this.openSignInOrUp} />
                { textAnimation }
                <AppleHint message={t[this.props.language].IOS_MESSAGE} />
                
                {(() => {
                    if (stage === 'TITLE_SCREEN') {
                        let controls = []
                        if (!this.props.multiplayerLandingPage) {
                            controls.push(<div key="0" className="menuButton" onClick={() => this.resumeOrStartGame()}>Singleplayer</div>);
                            controls.push(<div key="1" className="menuButton" onClick={() => this.setState({ multiplayerScreen: true })}>Multiplayer</div>);
                            controls.push(<div key="2" className="upcomming"><div className="disabled menuButton">Choclab</div><div className="ribbon">soon</div></div>);
                        } else {
                            controls.push(<Button key="3" color="primary" aria-label="join multiplayer" className="menuButton" variant="contained" onClick={this.props.joinMultiplayerGame}>{t[this.props.language].JOIN_MULTIPLAYER}</Button>);
                        }
                        return (
                            <div id="mainMenu">
                                {typeof this.props.playerInfos.stats.coins !== 'undefined' ? <div id="coins">
                                    <span>{ this.props.playerInfos.stats.coins }</span>
                                    <img src="images/coins.png" alt="choco coins" />
                                </div> : null}
                                <SocialIcons />
                                <div className="logo">
                                    <img alt="logo" src="images/logo.png?v=1.0" />
                                </div>
                                <div className="titleMenu">
                                    {this.props.assetsReady ? controls : null}
                                    <Dialog
                                        fullWidth={true}
                                        open={this.state.open}
                                        onClose={() => this.setState({ open: false })}
                                        aria-labelledby="resumeOrStartGame">
                                        <DialogTitle>Resume Game</DialogTitle>
                                        <DialogContent>
                                            <Typography>Do you want to start a new game or resume your last one?</Typography>
                                        </DialogContent>
                                        <DialogActions>
                                            <Button onClick={() => {
                                                Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                                this.setState({ open: false });
                                                this.props.prepareNewGameCallback(false);
                                            }} color="primary">New Game</Button>
                                            <Button onClick={() => {
                                                Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                                this.setState({ open: false });
                                                this.props.prepareNewGameCallback(true);
                                            }} color="primary">Resume</Button>
                                        </DialogActions>
                                    </Dialog>
                                </div>
                                <Info />
                            </div>
                        );
                    } else if (stage === 'CHOOSE_MENU') {
                        let waitingNotification = null;
                        if (typeof this.props.multiplayerWaiting !== 'undefined') {
                            waitingNotification = <div className="multiplayerNotification"><p>Wait for second player..</p><CircularProgress /></div>;
                        }
                        return (
                            <div className="chooseStage">
                                { waitingNotification }
                                <GameStartSelection clickable={this.state.clickable} />
                            </div>
                        );
                    } else if (stage === 'MULTIPLAYER_SCREEN') {
                        return (
                            <div id="multiplayer">
                                <div className="controls">
                                    <div className="menuButton">Random opponent</div>
                                    <div className="menuButton">Share your Link</div>
                                    <div className="menuButton">Friends</div>
                                </div>
                                <div className="openGames">
                                    <Table size="small" className="gameList">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>actions</TableCell>
                                                <TableCell>player</TableCell>
                                                <TableCell>turns</TableCell>
                                                <TableCell>match time</TableCell>
                                                <TableCell>last action</TableCell>
                                                <TableCell>potential coins</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {this.state.openGames.map(row => (
                                              <TableRow key={row.playerName}>
                                                    <TableCell><div className="actions"><PlayArrow /><Cancel /></div></TableCell>
                                                    <TableCell component="th" scope="row">
                                                    {row.playerName} ({row.playerId})
                                                    </TableCell>
                                                    <TableCell align="center">{row.turns}</TableCell>
                                                    <TableCell align="center">{this.timeToString(row.matchTime)}</TableCell>
                                                    <TableCell align="center">{this.timeAgo(row.lastAction)}</TableCell>
                                                    <TableCell align="center">{row.potentialCoins}</TableCell>
                                              </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                            );
                    } else {
                        return (
                            <div>
                                <AttackPalette />
                                <BuildingPalette />
                                <InfoPanel />
                                { this.props.overviewVisible ? <GameEndOverview finishGame={() => this.props.endGame()}/> : null }
                            </div>
                        )
                    }
                })()}
            </div>
        );
    }
}

Hud.propTypes = {
    prepareNewGameCallback: PropTypes.func.isRequired,
    startTutorial: PropTypes.func.isRequired,
    joinMultiplayerGame: PropTypes.func.isRequired,
    endGame: PropTypes.func.isRequired,
    multiplayerLandingPage: PropTypes.bool.isRequired,
    className: PropTypes.string.isRequired
}

const mapStateToProps = state => ({
    game: state.gameplay.game,
    state: typeof state.gameplay.game === 'undefined' ? undefined : state.gameplay.game.state,
    language: state.ui.language,
    overviewVisible: state.ui.overviewVisible,
    resumeGamePossible: state.ui.resumeGamePossible,
    assetsReady: state.ui.assetsReady,
    multiplayerWaiting: state.ui.multiplayerWaiting,
    playerInfos: state.ui.playerInfos
});

const HudContainer = connect(mapStateToProps)(Hud);

export default HudContainer;