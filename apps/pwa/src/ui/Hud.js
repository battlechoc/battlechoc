import React, { Component } from 'react';
import './Hud.css';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { GameStateTypes } from 'battlechoc-shared-functions';
import { showQuickMessage } from './UiActions';
import { Actionbar, InfoPanel, BuildingPalette, AttackPalette, GameStartSelection, SocialIcons, GameEndOverview } from './controls';
import { Jukebox, translate as t } from './misc';
import { Info, Tooltip, Settings, AccountOverview } from './dialogs';
import BattlechocDialog from './dialogs/BattlechocDialog';
import Fab from '@material-ui/core/Fab';
import CircularProgress from '@material-ui/core/CircularProgress';
import { KeyboardArrowLeft as ArrowBackIcon, Refresh, FormatListNumbered, Casino, People, Search, Share } from '@material-ui/icons';
import MultiplayerScreen from './pages/MultiplayerScreen';
import Choclab from './pages/Choclab';
import { multiplayer } from '../Multiplayer';
import { ServerRequest } from '../helper/settings';
import logger from '../helper/logger';
import firebase from '@firebase/app';
import { OptimizedImage } from '../helper/compatibility';

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
            waitingRoom: false,
            waitingRoomText: t('TRY_TO_JOIN_GAME'),
            choclabScreen: false,
            searchingRandomOpponent: false
        }
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
            this.setState({ waitingRoom: true, waitingRoomText: t('TRY_TO_SHOW_PLAYER_ACCOUNT') }, async () => {
                try {
                    while (!firebase.auth().currentUser) {
                        await this.sleep(100);
                    }
                    let response = await ServerRequest('get', '/user/' + this.props.challengedPlayer);
                    this.openAccountOverview(response.data[0]);
                } catch (error) {
                    if (error.response) {
                        if (error.response.status === 404) {
                            this.props.showQuickMessage({ text: t('WARNING_PLAYER_NOT_FOUND', this.props.challengedPlayer) });
                        } else {
                            logger.warn(error, error.response.toString());
                        }
                    } else {
                        logger.error(error);
                    }
                } finally {
                    this.setState({ waitingRoom: false });
                }
            });
        }

        if (typeof this.props.sessionId !== 'undefined') {
            this.setState({ waitingRoom: true, waitingRoomText: t('TRY_TO_JOIN_GAME') }, async () => {
                try {
                    let sessions = undefined;
                    let retry = false;
                    while (typeof sessions === 'undefined') {
                        if (retry) {
                            await this.sleep(250);
                        }
                        sessions = await multiplayer.getMultiplayerSessions(null, this.props.sessionId);
                        retry = true;
                    }

                    if (sessions.length > 0) {
                        this.joinGame(sessions[0].id);
                    } else {
                        logger.warn(`${this.props.sessionId} is not a session of this player`);
                        this.props.showQuickMessage({ text: t('WARNING_GAME_NOT_JOINABLE_VIA_URL') });
                    }
                } catch (error) {
                    logger.warn(error);
                    this.props.showQuickMessage({ text: t('ERROR_GAME_NOT_JOINABLE_VIA_URL') });
                } finally {
                    this.setState({ waitingRoom: false });
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
        if (typeof state === 'undefined' && !this.state.multiplayerScreen && !this.state.choclabScreen && !this.state.challengedProfile && !this.state.waitingRoom) {
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
        } else if (this.state.waitingRoom) {
            return 'WAITING_ROOM';
        } else {
            return 'INGAME';
        }
    }

    openSettings = () => {        
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        this.setState({ openSettings: true });
    }

    openAccountOverview = playerAccount => {
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
        this.unlockUi();
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

    refreshSessions = () => {
        multiplayer.getMultiplayerSessions(() => this.props.showQuickMessage({ text: t('SESSION_REFRESH_FAILED')}));
    }

    createProfileLink = () => {
        multiplayer.createChallengeMeLink().then(link => {
            if (navigator.share) {
                navigator.share({
                    title: window.document.title,
                    text: t('INVITATION'),
                    url: link,
                }).catch((error) => logger.info('error sharing multiplayer session', error));
            } else {
                let whatsappWindowRef = window.open();
                whatsappWindowRef.location = 'https://api.whatsapp.com/send?text=' + encodeURIComponent(t('INVITATION') + ' - ' + link);
            }
        });
    }

    searchRandomOpponent = () => {
        if (!this.state.searchingRandomOpponent) {
            this.setState({ searchingRandomOpponent: true }, async () => {
                try {
                    let player = await multiplayer.findRandomPlayer();
                    this.multiplayerScreen.showPlayerProfile({ opponent: player });
                } catch (error) {
                    logger.warn(error.toString());
                } finally {
                    this.setState({ searchingRandomOpponent: false });
                }
            });
        }
    }

    render() {
        const stage = this.estimateStage();
        return (
            <div className={this.state.multiplayerScreen ? 'scrollable ' + this.props.className : this.props.className}>
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
                                color="primary"
                                className="icon"
                                onClick={() => this.setState({ choclabScreen: false })}>
                                <ArrowBackIcon />
                            </Fab>
                        </div>
                    } else if (stage === 'MULTIPLAYER_SCREEN') {
                        return <div className="actionbar" style={{ width: '100%', position: 'relative', marginBottom: '5vh' }}>
                            <Fab
                                size="small"
                                color="primary"
                                className="icon"
                                onClick={() => this.setState({ multiplayerScreen: false })}>
                                <ArrowBackIcon />
                            </Fab>
                            <Fab
                                size="small"
                                color="primary"
                                className={ this.props.sessionRefreshActions > 0 ? 'rotating icon' : 'icon' }
                                onClick={() => this.refreshSessions() }>
                                <Refresh />
                            </Fab>
                            <div style={{ flexGrow: 1 }} />
                            <Fab
                                size="small"
                                color="primary"
                                className="icon"
                                onClick={() => this.multiplayerScreen.openHighscorePage() }>
                                <FormatListNumbered />
                            </Fab>
                            <Fab
                                size="small"
                                color="primary"
                                className="icon"
                                onClick={this.searchRandomOpponent}>
                                { this.state.searchingRandomOpponent ? <CircularProgress style={{ color: 'white' }} size={18} /> : <Casino /> }
                            </Fab>
                            <Fab
                                size="small"
                                color="primary"
                                className="icon"
                                onClick={() => this.multiplayerScreen.openFriendsPage()}>
                                <People />
                            </Fab>
                            <Fab
                                size="small"
                                color="primary"
                                className="icon"
                                onClick={this.createProfileLink}>
                                <Share />
                            </Fab>
                            <Fab
                                size="small"
                                color="primary"
                                className="icon"
                                style={{ marginRight: 5 }}
                                onClick={() => this.multiplayerScreen.openSearchPage()}>
                                <Search />
                            </Fab>
                        </div>
                    } else if (stage === 'CHALLENGE_SCREEN') {
                        return <div className="actionbar">
                            <Fab
                                size="small"
                                color="primary"
                                className="icon"
                                onClick={() => this.setState({ challengedProfile: undefined })}>
                                <ArrowBackIcon />
                            </Fab>
                        </div>
                    } else if (stage === 'WAITING_ROOM') {
                        return null;
                    } else {
                        return <Actionbar endGame={this.props.endGame} showSettings={this.openSettings} showSignInOrUp={this.openAccountOverview} />
                    }
                })()}

                {(() => {
                    if (stage === 'TITLE_SCREEN') {
                        let controls = []

                        const playername = this.props.playerInfos.stats.username;
                        const score = this.props.playerInfos.stats.score
                        const hideOptions = typeof playername === 'undefined' || playername === 'Chocnonymous' || score < 1000;

                        controls.push(<div key="0" className="menuButton" onClick={() => this.resumeOrStartGame()}>{typeof playername === 'undefined' || playername === 'Chocnonymous' ? t('NEW_GAME') : t('MAIN_MENU_SINGLEPLAYER')}</div>);
                        
                        if (!hideOptions) {
                            controls.push(<div key="1" className="menuButton" onClick={() => this.setState({ multiplayerScreen: true })}>{t('MAIN_MENU_MULTIPLAYER')}</div>);
                            controls.push(<div key="2" className="menuButton" onClick={() => this.setState({ choclabScreen: true })}>{t('MAIN_MENU_CHOCLAB')}</div>);
                        }

                        return (
                            <div id="mainMenu">
                                {typeof this.props.playerInfos.stats.coins !== 'undefined' ? <div id="chocolate-coins">
                                    <span>{this.props.playerInfos.stats.coins}</span>
                                    <OptimizedImage src="/images/coins.png" alt="choco coins" />
                                </div> : null}
                                <SocialIcons />
                                <div className="logo">
                                    <OptimizedImage src="/images/logo.png" alt="battlechoc logo" />
                                </div>
                                <div className="titleMenu">
                                    {this.props.assetsReady ? controls : null}
                                    <BattlechocDialog
                                        open={this.state.open}
                                        close={() => this.setState({ open: false })}
                                        title={t('HUD_RESUME_GAME')}>
                                        <div className="resumeGameDialog">
                                            <p>{t('HUD_ASK_NEW_OR_RESUME')}</p>
                                            <div className="actions">
                                                <div className="menuButton" onClick={() => {
                                                    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                                    this.setState({ open: false }, () => this.props.prepareNewGameCallback(true));
                                                }}>{t('HUD_RESUME_GAME')}</div>
                                                <div className="menuButton" onClick={() => {
                                                    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                                    this.setState({ open: false }, () => this.props.prepareNewGameCallback(false));
                                                }}>{t('HUD_NEW_GAME')}</div>
                                            </div>
                                        </div>
                                    </BattlechocDialog>
                                </div>
                                <Info openInfo={this.props.openInfo} />
                            </div>
                        );
                    } else if (stage === 'CHOOSE_MENU') {
                        return (
                            <div className="chooseStage">
                                <Tooltip 
                                    state={this.props.state} 
                                    currentPlayerName={this.props.game.players[multiplayer.localPlayerIndex].name}
                                    tappedBuilding={this.props.tappedBuilding}
                                    selectedAttack={this.props.selectedAttack}
                                    level={this.props.game.players[multiplayer.localPlayerIndex].level}
                                    playerTurn={multiplayer.isLocalPlayer(this.props.game.currentPlayerIndex)} />
                                <GameStartSelection clickable={this.state.clickable} />
                            </div>
                        );
                    } else if (stage === 'MULTIPLAYER_SCREEN') {
                        return <MultiplayerScreen openAccountOverview={this.openAccountOverview} enterMultiplayerGame={this.joinGame} onRef={multiplayerScreen => this.multiplayerScreen = multiplayerScreen}/>
                    } else if (stage === 'CHOCLAB_SCREEN') {
                        return <Choclab />
                    } else if (stage === 'WAITING_ROOM') {
                        return <div className="waiting-room"><p>{ this.state.waitingRoomText }</p><CircularProgress /></div>
                    } else {
                        let player = this.props.game.players[multiplayer.localPlayerIndex];
                        return (
                            <div>
                                <Tooltip 
                                    state={this.props.state} 
                                    currentPlayerName={player.name}
                                    tappedBuilding={this.props.tappedBuilding}
                                    selectedAttack={this.props.selectedAttack}
                                    level={player.level}
                                    playerTurn={multiplayer.isLocalPlayer(this.props.game.currentPlayerIndex)} />
                                <AttackPalette />
                                <BuildingPalette />
                                <InfoPanel players={this.props.game.players} />
                                {this.props.overviewVisible ? <GameEndOverview player={player} winners={this.props.game.winners} finishGame={coins => this.props.endGame(coins)} /> : null}
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
    overviewVisible: state.ui.overviewVisible,
    resumeGamePossible: state.ui.resumeGamePossible,
    assetsReady: state.ui.assetsReady,
    playerInfos: state.ui.playerInfos,
    tappedBuilding: state.ui.tappedBuilding,
    selectedAttack: state.ui.selectedAttack,
    sessionRefreshActions: state.ui.sessionRefreshActions
});

const mapDispatchToProps = {
    showQuickMessage
};

const HudContainer = connect(
    mapStateToProps,
    mapDispatchToProps
)(Hud);

export default HudContainer;