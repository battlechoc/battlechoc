import React, { Component } from 'react';
import './Hud.css';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import OfflineStore from '../OfflineStore';
import { GameStateTypes } from '../gameplay/GameplayReducer';
import { getEntityDescriptor } from '../gameplay/GameEntities';
import { increaseLevel } from '../gameplay/GameActions';
import { Actionbar, InfoPanel, BuildingPalette, AttackPalette, GameStartSelection, SocialIcons, GameEndOverview, ChoclabPalette } from './controls';
import { Jukebox, Translation as t } from './misc';
import { Info, Tooltip, Settings, AppleHint, SignInOrUp} from './dialogs';
import { CircularProgress, Button } from '@material-ui/core';
import Dialog from '@material-ui/core/Dialog';
import Typography from '@material-ui/core/Typography';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import TimeAgo from 'javascript-time-ago';
import en from 'javascript-time-ago/locale/en';
import de from 'javascript-time-ago/locale/de';
import { PlayArrow, Cancel } from '@material-ui/icons';
import MeshPreview from '../3d/MeshPreview';
import Fab from '@material-ui/core/Fab';
import { KeyboardArrowLeft as ArrowBackIcon, AddBox } from '@material-ui/icons';

class Hud extends Component {
    constructor(props) {
        super(props);
        this.state = { 
            clickable: true,
            open: false,
            multiplayerScreen: false,
            choclabScreen: false,
            selectedEntity: null,
            openGames: [
                {
                    'playerName': 'Sebastian',
                    'turns': 12,
                    'matchTime': 201000,
                    'lastAction': 1566153558102,
                    'potentialCoins': 246
                },
                {
                    'playerName': 'Caro',
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
        if (typeof state === 'undefined' && !this.state.multiplayerScreen && !this.state.choclabScreen) {
            return 'TITLE_SCREEN'
        } else if (state === GameStateTypes.START ||
            state === GameStateTypes.CHOOSE_FIELD_OR_START ||
            state === GameStateTypes.CHOOSE_FIELD) {
            return 'CHOOSE_MENU';
        } else if (this.state.multiplayerScreen) {
            return 'MULTIPLAYER_SCREEN';
        } else if (this.state.choclabScreen) {
            return 'CHOCLAB_SCREEN';
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
                { (() => {
                    if (stage === 'CHOCLAB_SCREEN') {
                        return  <div className="actionbar">
                                    <Fab
                                        size="small"
                                        key="4"
                                        color="primary"
                                        aria-label="back"
                                        className="icon"
                                        onClick={() => this.setState({choclabScreen: false})}>
                                        <ArrowBackIcon />
                                    </Fab>
                                </div>
                    } else if (stage === 'MULTIPLAYER_SCREEN') {
                        return  <div className="actionbar">
                                    <Fab
                                        size="small"
                                        key="4"
                                        color="primary"
                                        aria-label="back"
                                        className="icon"
                                        onClick={() => this.setState({multiplayerScreen: false})}>
                                        <ArrowBackIcon />
                                    </Fab>
                                </div>
                    } else {
                        return <Actionbar showSettings={this.openSettings} showSignInOrUp={this.openSignInOrUp} />
                    }
                })() }

                { textAnimation }
                <AppleHint message={t[this.props.language].IOS_MESSAGE} />
                
                {(() => {
                    if (stage === 'TITLE_SCREEN') {
                        let controls = []
                        if (!this.props.multiplayerLandingPage) {
                            controls.push(<div key="0" className="menuButton" onClick={() => this.resumeOrStartGame()}>Singleplayer</div>);
                            controls.push(<div key="1" className="menuButton" onClick={() => this.setState({ multiplayerScreen: true })}>Multiplayer</div>);
                            controls.push(<div key="2" className="menuButton" onClick={() => this.setState({ choclabScreen: true })}>Choclab</div>);
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
                                    <div className="gamestable">
                                        <div className="tableHead">actions</div>
                                        <div className="tableHead">player</div>
                                        <div className="tableHead">turns</div>
                                        <div className="tableHead">match time</div>
                                        <div className="tableHead">last action</div>
                                        <div className="tableHead">potential coins</div>

                                        {this.state.openGames.map((row, i) => (
                                            [
                                                <div key={i} className="gameActions"><PlayArrow /><Cancel /></div>,
                                                <div key={i+1}><span className="gamelabel">player</span><span>{row.playerName}</span></div>,
                                                <div key={i+2}><span className="gamelabel">turns</span><span>{row.turns}</span></div>,
                                                <div key={i+3}><span className="gamelabel">match</span><span>{this.timeToString(row.matchTime)}</span></div>,
                                                <div key={i+4}><span className="gamelabel">lastAction</span><span>{this.timeAgo(row.lastAction)}</span></div>,
                                                <div className="tablefoot" key={i+5}><span className="gamelabel">potential coins</span><span>{row.potentialCoins}</span></div>
                                            ]
                                        ))}
                                    </div>
                                </div>
                            </div>
                            );
                    } else if (stage === 'CHOCLAB_SCREEN') {
                        return (
                            <div id="choclab">
                                {typeof this.props.playerInfos.stats.coins !== 'undefined' ? <div id="coins">
                                    <span>{ this.props.playerInfos.stats.coins }</span>
                                    <img src="images/coins.png" alt="choco coins" />
                                </div> : null}
                                <MeshPreview onRef={meshPreview => this.meshPreview = meshPreview}/>
                                <div className="entityStats">
                                    { this.state.selectedEntity ? this.state.selectedEntity.style.map(attribute => {
                                        let values = this.state.selectedEntity[attribute.name]();
                                        let percentage = (values[0] / values[1]) * 100;
                                        return (
                                            <div className="progress" key={attribute.name}>
                                                <div className="label"><span>{ attribute.displayName }</span><span>{ Math.round(values[0]) }</span></div>
                                                <div>
                                                    <div className={attribute.color} style={{ width: percentage + '%'}}></div>
                                                    <AddBox onClick={() => {
                                                        this.props.increaseLevel({
                                                            'entity': this.state.selectedEntityType,
                                                            'attribute': attribute.name
                                                        }).then(() => this.setState({ "selectedEntity": getEntityDescriptor(this.state.selectedEntityType, this.props.level) }));
                                                    }} />
                                                </div>
                                            </div>
                                        )
                                    })  : null }
                                </div>
                                <ChoclabPalette selectEntity={entity => {
                                    this.setState({ selectedEntity: getEntityDescriptor(entity, this.props.level) });
                                    this.setState({ selectedEntityType: entity });
                                    this.meshPreview.loadMesh(entity);
                                }} />
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
    level: state.gameplay.level,
    state: typeof state.gameplay.game === 'undefined' ? undefined : state.gameplay.game.state,
    language: state.ui.language,
    overviewVisible: state.ui.overviewVisible,
    resumeGamePossible: state.ui.resumeGamePossible,
    assetsReady: state.ui.assetsReady,
    multiplayerWaiting: state.ui.multiplayerWaiting,
    playerInfos: state.ui.playerInfos
});

const mapDispatchToProps = {
    increaseLevel
};

const HudContainer = connect(
    mapStateToProps,
    mapDispatchToProps
)(Hud);

export default HudContainer;