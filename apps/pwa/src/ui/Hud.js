import React, { Component } from 'react';
import './Hud.css';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { GameStateTypes } from '../gameplay/GameplayReducer';
import { showQuickMessage } from './UiActions';
import { Actionbar, InfoPanel, BuildingPalette, AttackPalette, GameStartSelection, SocialIcons, GameEndOverview } from './controls';
import { Jukebox, Translation as t } from './misc';
import { Info, Tooltip, Settings, AppleHint, AccountOverview } from './dialogs';
import { CircularProgress, Button } from '@material-ui/core';
import Dialog from '@material-ui/core/Dialog';
import Typography from '@material-ui/core/Typography';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import Fab from '@material-ui/core/Fab';
import { KeyboardArrowLeft as ArrowBackIcon } from '@material-ui/icons';
import MultiplayerScreen from './pages/MultiplayerScreen';
import Choclab from './pages/Choclab';
import { multiplayer } from '../Multiplayer';
import { ServerRequest } from '../helper/settings';
import logger from '../helper/logger';
import firebase from '@firebase/app';

class Hud extends Component {
    constructor(props) {
        super(props);
        this.state = {
            clickable: true,
            open: false,
            openInfo: false,
            openSettings: false,
            showAccountOverview: false,
            upgradeMessageOpen: false,
            multiplayerScreen: false,
            choclabScreen: false
        }
        this.signInOrUp = React.createRef();
    }

    handleFetchError(response) {
        if (!response.ok) {
            throw Error(response.statusText);
        }
        return response.json();
    }

    sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    componentDidMount() {
        this.props.onRef(this);

        if (typeof this.props.challengedPlayer !== 'undefined') {
            this.setState({ multiplayerScreen: true }, async () => {
                try {
                    while (!firebase.auth().currentUser) {
                        await this.sleep(100);
                    }
                    let response = await ServerRequest('get', '/user/' + this.props.challengedPlayer);
                    this.multiplayerScreen.showPlayerProfile({ opponent: response.data });
                } catch (error) {
                    if (error.response) {
                        if (error.response.status === 404) {
                            this.props.showQuickMessage({ text: t[this.props.language].WARNING_PLAYER_NOT_FOUND(this.props.challengedPlayer) });
                        } else {
                            logger.warn(error, error.response.toString());
                        }
                    } else {
                        logger.error(error);
                    }
                }
            });
        }

        if (typeof this.props.sessionId !== 'undefined') {
            this.setState({ multiplayerScreen: true }, async () => {
                try {
                    let sessions = undefined;
                    while (typeof sessions === 'undefined') {
                        sessions = await multiplayer.getMultiplayerSessions();
                        await this.sleep(250);
                    }
                    this.multiplayerScreen.tryToJoinGame(this.props.sessionId, sessions);
                } catch (error) {
                    logger.warn(error);
                }
            });
        }
    }

    unlockUi() {
        this.setState({ clickable: true });
    }

    lockUi() {
        this.setState({ clickable: false });
    }

    estimateStage() {
        const state = this.props.state;
        if (typeof state === 'undefined' && !this.state.multiplayerScreen && !this.state.choclabScreen && !this.state.challengedProfile) {
            return 'TITLE_SCREEN'
        } else if (state === GameStateTypes.START ||
            state === GameStateTypes.CHOOSE_FIELD_OR_START ||
            state === GameStateTypes.CHOOSE_FIELD) {
            return 'CHOOSE_MENU';
        } else if (this.state.multiplayerScreen) {
            return 'MULTIPLAYER_SCREEN';
        } else if (this.state.choclabScreen) {
            return 'CHOCLAB_SCREEN';
        } else if (this.state.challengedProfile) {
            return 'CHALLENGE_SCREEN';
        } else {
            return 'INGAME';
        }
    }

    openSettings = () => {        
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        this.setState({ openSettings: true });
    }

    openAccountOverview = (playerAccount) => {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        this.setState({ 
            showAccountOverview: true,
            playerAccount: playerAccount
        });
    }

    closeAccountOverview = () => {
        this.setState({ showAccountOverview: false});
    }

    resumeOrStartGame = () => {
        if (this.props.resumeGamePossible) {
            this.setState({ open: true })
        } else {
            this.props.prepareNewGameCallback(false);
        }
    }

    joinGame = sessionId => {
        this.setState({ multiplayerScreen: false, choclabScreen: false });
        this.props.enterMultiplayerGame(sessionId);
    }

    render() {
        const stage = this.estimateStage();
        let textAnimation = typeof this.state.message === 'undefined' ? undefined : <div id="textAnimation" className="zoom">{this.state.message}</div>
        return (
            <div className={this.props.className}>
                <Tooltip />
                <Settings startTutorial={this.props.startTutorial} surrender={this.props.surrender} open={this.state.openSettings} close={() => this.setState({openSettings: false})} />
                <AccountOverview
                    challengePlayer={name => this.multiplayerScreen.challengePlayer(name)}
                    addFriend={async friend => await this.multiplayerScreen.addFriend(friend)} 
                    removeFriend={async friend => await this.multiplayerScreen.removeFriend(friend)} 
                    joinGame={this.joinGame} playerAccount={this.state.playerAccount} open={this.state.showAccountOverview} close={this.closeAccountOverview} />
                {(() => {
                    if (stage === 'CHOCLAB_SCREEN') {
                        return <div className="actionbar">
                            <Fab
                                size="small"
                                key="4"
                                color="primary"
                                className="icon"
                                onClick={() => this.setState({ choclabScreen: false })}>
                                <ArrowBackIcon />
                            </Fab>
                        </div>
                    } else if (stage === 'MULTIPLAYER_SCREEN') {
                        return <div className="actionbar">
                            <Fab
                                size="small"
                                key="4"
                                color="primary"
                                className="icon"
                                onClick={() => this.setState({ multiplayerScreen: false })}>
                                <ArrowBackIcon />
                            </Fab>
                        </div>
                    } else if (stage === 'CHALLENGE_SCREEN') {
                        return <div className="actionbar">
                            <Fab
                                size="small"
                                key="4"
                                color="primary"
                                className="icon"
                                onClick={() => this.setState({ challengedProfile: undefined })}>
                                <ArrowBackIcon />
                            </Fab>
                        </div>
                    } else {
                        return <Actionbar endGame={this.props.endGame} showSettings={this.openSettings} showSignInOrUp={this.openAccountOverview} />
                    }
                })()}

                {textAnimation}
                <AppleHint message={t[this.props.language].IOS_MESSAGE} />

                {(() => {
                    if (stage === 'TITLE_SCREEN') {
                        let controls = []

                        let playername = this.props.playerInfos.stats.username;
                        let hideOptions = typeof playername === 'undefined' || playername === 'Chocnonymous';

                        controls.push(<div key="0" className="menuButton" onClick={() => this.resumeOrStartGame()}>{hideOptions ? t[this.props.language].NEW_GAME : 'Singleplayer'}</div>);
                        
                        if (!hideOptions) {
                            controls.push(<div key="1" className="menuButton" onClick={() => this.setState({ multiplayerScreen: true })}>Multiplayer</div>);
                            controls.push(<div key="2" className="menuButton" onClick={() => this.setState({ choclabScreen: true })}>Choclab</div>);
                        }
                        return (
                            <div id="mainMenu">
                                {typeof this.props.playerInfos.stats.coins !== 'undefined' ? <div id="coins">
                                    <span>{this.props.playerInfos.stats.coins}</span>
                                    <img src="/images/coins.png" alt="choco coins" />
                                </div> : null}
                                <SocialIcons />
                                <div className="logo">
                                    <img alt="logo" src="/images/logo.png?v=1.0" />
                                </div>
                                <div className="titleMenu">
                                    {this.props.assetsReady ? controls : null}
                                    <Dialog
                                        fullWidth={true}
                                        open={this.state.open}
                                        onClose={() => this.setState({ open: false })}
                                        aria-labelledby="resumeOrStartGame">
                                        <DialogTitle>{t[this.props.language].HUD_RESUME_GAME}</DialogTitle>
                                        <DialogContent>
                                            <Typography>{t[this.props.language].HUD_ASK_NEW_OR_RESUME}</Typography>
                                        </DialogContent>
                                        <DialogActions>
                                            <Button onClick={() => {
                                                Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                                this.setState({ open: false });
                                                this.props.prepareNewGameCallback(false);
                                            }} color="primary">{t[this.props.language].HUD_NEW_GAME}</Button>-
                                            <Button onClick={() => {
                                                Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                                this.setState({ open: false });
                                                this.props.prepareNewGameCallback(true);
                                            }} color="primary">{t[this.props.language].HUD_RESUME_GAME}</Button>
                                        </DialogActions>
                                    </Dialog>
                                </div>
                                <Info language={this.props.language} openInfo={this.props.openInfo} />
                            </div>
                        );
                    } else if (stage === 'CHOOSE_MENU') {
                        let waitingNotification = null;
                        if (typeof this.props.multiplayerWaiting !== 'undefined') {
                            waitingNotification = <div className="multiplayerNotification"><p>{t[this.props.language].HUD_WAITING_FOR_PLAYER}</p><CircularProgress /></div>;
                        }
                        return (
                            <div className="chooseStage">
                                {waitingNotification}
                                <GameStartSelection clickable={this.state.clickable} />
                            </div>
                        );
                    } else if (stage === 'MULTIPLAYER_SCREEN') {
                        return <MultiplayerScreen openAccountOverview={this.openAccountOverview} enterMultiplayerGame={this.joinGame} onRef={multiplayerScreen => this.multiplayerScreen = multiplayerScreen}/>
                    } else if (stage === 'CHOCLAB_SCREEN') {
                        return <Choclab />
                    } else {
                        return (
                            <div>
                                <AttackPalette />
                                <BuildingPalette />
                                <InfoPanel players={this.props.game.players} />
                                {this.props.overviewVisible ? <GameEndOverview finishGame={() => this.props.endGame()} /> : null}
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
    enterMultiplayerGame: PropTypes.func.isRequired,
    startTutorial: PropTypes.func.isRequired,
    endGame: PropTypes.func.isRequired,
    surrender: PropTypes.func.isRequired,
    challengedPlayer: PropTypes.string,
    className: PropTypes.string.isRequired,
    sessionId: PropTypes.string
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

const mapDispatchToProps = {
    showQuickMessage
};

const HudContainer = connect(
    mapStateToProps,
    mapDispatchToProps
)(Hud);

export default HudContainer;