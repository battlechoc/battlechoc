import React, { Component } from 'react';
import './Hud.css';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { GameStateTypes } from '../gameplay/GameplayReducer';
import { Actionbar, InfoPanel, BuildingPalette, AttackPalette, GameStartSelection, SocialIcons, GameEndOverview } from './controls';
import { Jukebox, Translation as t } from './misc';
import { Info, Tooltip, Settings, AppleHint, SignInOrUp, AccountInfos } from './dialogs';
import { CircularProgress, Button } from '@material-ui/core';

class Hud extends Component {
    constructor(props) {
        super(props);
        this.state = { 
            clickable: true
        }
    }

    componentDidMount() {
        this.props.onRef(this);
    }

    unlockUi() {
        this.setState({ clickable: true });
    }

    lockUi() {
        this.setState({ clickable: false });
    }

    estimateStage() {
        const state = this.props.state;
        if (typeof state === 'undefined') {
            return 'TITLE_SCREEN'
        } else if (state === GameStateTypes.START ||
            state === GameStateTypes.CHOOSE_FIELD_OR_START ||
            state === GameStateTypes.CHOOSE_FIELD) {
            return 'CHOOSE_MENU';
        } else {
            return 'INGAME';
        }
    }

    openSettings = () => {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        this.settings.open();
    }

    openSignInOrUp = () => {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        this.signInOrUp.open();
    }

    openAccountInfos = () => {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        this.accountInfos.open();
    }

    closeTutorial = () => {
        Jukebox.stopMusic();
        this.setState({ tutorial: false })
    }

    render() {
        const stage = this.estimateStage();
        let textAnimation = typeof this.state.message === 'undefined' ? undefined : <div id="textAnimation" className="zoom">{this.state.message}</div>
        return (
            <div className={this.props.className}>
                <Tooltip />
                <Settings endGame={this.props.endGame} onRef={settings => (this.settings = settings)} />
                <SignInOrUp onRef={signInOrUp => (this.signInOrUp = signInOrUp)} />
                <AccountInfos onRef={accountInfos => (this.accountInfos = accountInfos)} />
                <Actionbar showSettings={this.openSettings} showSignInOrUp={this.openSignInOrUp} showAccountInfos={this.openAccountInfos} />
                { textAnimation }
                <AppleHint message={t[this.props.language].IOS_MESSAGE} />
                
                {(() => {
                    if (stage === 'TITLE_SCREEN') {
                        let controls = []
                        if (!this.props.multiplayerLandingPage) {
                            controls.push(<Button key="0" color="primary" aria-label="new game" className="menuButton" variant="contained" onClick={() => this.props.prepareNewGameCallback(false)}>{t[this.props.language].NEW_GAME}</Button>);
                            if (this.props.resumeGamePossible === true) {
                                controls.push(<Button key="1" color="primary" aria-label="resume game" className="menuButton" variant="contained" onClick={() => this.props.prepareNewGameCallback(true)}>{t[this.props.language].RESUME_GAME}</Button>);
                            }
                            controls.push(<Button key="2" color="primary" aria-label="start tutorial" className="menuButton" variant="contained" onClick={() => this.props.startTutorial()}>{t[this.props.language].TUTORIAL}</Button>);
                        } else {
                            controls.push(<Button key="3" color="primary" aria-label="join multiplayer" className="menuButton" variant="contained" onClick={this.props.joinMultiplayerGame}>{t[this.props.language].JOIN_MULTIPLAYER}</Button>);
                        }
                        return (
                            <div id="mainMenu">
                                {this.props.coins ? <div id="coins">
                                    <span>{ this.props.coins }</span>
                                    <img src="images/coins.png" alt="choco coins" />
                                </div> : null}
                                <SocialIcons />
                                <div className="logo">
                                    <img alt="logo" src="images/logo.png?v=1.0" />
                                </div>
                                <img id="cannonTitlePage" className="foregroundEntity" alt="cannon field" src="images/cannonAtField.png" />
                                <img id="creamTitlePageBottom" className="foregroundEntity" alt="creamy field bottom" src="images/creamAtField.png" />
                                <div className="titleMenu">
                                    {this.props.assetsReady ? controls : null}
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
    className: PropTypes.string.isRequired,
    coins: PropTypes.number
}

const mapStateToProps = state => ({
    game: state.gameplay.game,
    state: typeof state.gameplay.game === 'undefined' ? undefined : state.gameplay.game.state,
    language: state.ui.language,
    overviewVisible: state.ui.overviewVisible,
    resumeGamePossible: state.ui.resumeGamePossible,
    assetsReady: state.ui.assetsReady,
    multiplayerWaiting: state.ui.multiplayerWaiting
});

const HudContainer = connect(mapStateToProps)(Hud);

export default HudContainer;