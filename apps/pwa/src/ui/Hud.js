import React, { Component } from 'react';
import './Hud.css';
import { AssetLoadingViewContainer as AssetLoadingView } from '../AssetLoader';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { chooseField, chooseStart } from '../gameplay/GameActions';
import { GameStateTypes } from '../gameplay/GameplayReducer';
import { EntityType } from '../gameplay/GameEntities';
import Tooltip from './Tooltip';
import Actionbar from './Actionbar';
import InfoPanel from './InfoPanel';
import BuildingPalette from './BuildingPalette';
import AttackPalette from './AttackPalette';
import Tutorial from '../tutorial/Tutorial';
import Button from '@material-ui/core/Button';
import Fab from '@material-ui/core/Fab';
import StartIcon from '@material-ui/icons/SupervisorAccount';
import SvgIcon from '@material-ui/core/SvgIcon';
import Snackbar from '@material-ui/core/Snackbar';
import t from './Translation';
import InfoDialog from './InfoDialog';
import Settings from './dialogs/Settings';
import Jukebox from './Jukebox';
import IconButton from '@material-ui/core/IconButton';
import CloseIcon from '@material-ui/icons/Close';
import AddBox from '@material-ui/icons/AddBox';
import ScreenRotation from '@material-ui/icons/ScreenRotation';
import OfflineStore from '../OfflineStore';

class Hud extends Component {
    constructor(props) {
        super(props);
        this.state = {
            clickable: true,
            showTutorial: false,
            showiOSMessage: false
        }
    }

    componentDidMount() {
        this.props.onRef(this);

        let iOSDevice = /^(iPhone|iPad|iPod)/.test(navigator.platform);
        let isPwa = searchParams.get('app_runs_as') === 'pwa';
        if (iOSDevice && !isPwa) {
            OfflineStore.settingsStore.get('iOSMessage').then(iOSMessage => {
                if (typeof iOSMessage === 'undefined') {
                    this.setState({ showiOSMessage: true });
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

    showTurnMessage(message) {
        this.setState({ message: message });
        // estimate browser animation type
        let pivot = document.createElement("fakeelement");
        let animations = {
            "animation"      : "animationend",
            "OAnimation"     : "oAnimationEnd",
            "MozAnimation"   : "animationend",
            "WebkitAnimation": "webkitAnimationEnd"
        }
        let supportedAnimation = 'animation';

        for (let animation in animations) {
            if (typeof pivot.style[animation] !== 'undefined') {
                supportedAnimation = animations[animation];
            }
        }

        let textAnimation = document.getElementById('textAnimation');
        textAnimation.addEventListener(supportedAnimation, () => {
            this.setState({ message: undefined });
        });
        textAnimation.addEventListener('click', () => {
            this.setState({ message: undefined });
        });
    }

    startTutorial() {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        Jukebox.startMusic(Jukebox.SONGS.MAIN_THEME);
        this.setState({ showTutorial: true });
    }

    choose(option) {
        if (this.state.clickable) {
            Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
            if (option === 'START' && this.props.state === GameStateTypes.CHOOSE_FIELD_OR_START) {
                this.props.chooseStart({ issuer: this.props.game.players[0].id });
            } else if (option === 'LEFT_GAMEFIELD') {
                this.props.chooseField({ fieldIdx: 0, issuer: this.props.game.players[0].id });
            } else if (option === 'RIGHT_GAMEFIELD') {
                this.props.chooseField({ fieldIdx: 1, issuer: this.props.game.players[0].id });
            }
        }
    }

    isInitalStage() {
        return this.props.state === GameStateTypes.START ||
            this.props.state === GameStateTypes.CHOOSE_FIELD_OR_START ||
            this.props.state === GameStateTypes.CHOOSE_FIELD;
    }

    isTitleScreen() {
        return typeof this.props.state === 'undefined';
    }

    estimateButtonClasses() {
        let classNames = 'button'
        if (this.state.clickable && this.props.state === GameStateTypes.CHOOSE_FIELD_OR_START) {
            classNames += ' active';
        } else if (this.props.state === GameStateTypes.CHOOSE_FIELD) {
            if (this.props.game.currentPlayerIndex === 0) {
                classNames += ' selectedByOpponent';
            } else {
                classNames += ' selectedByPlayer';
            }
        }
        return classNames;
    }

    render() {
        let shareIcon = <SvgIcon fontSize="small">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50" enableBackground="new 0 0 50 50"><meta name="license" content="https://commons.wikimedia.org/wiki/Category:Expat/MIT_License" /><meta name="copyright" content="Copyright © 2014 Alexander Madyankin, Roman Shamin" /><path d="M30.3 13.7L25 8.4l-5.3 5.3-1.4-1.4L25 5.6l6.7 6.7z"/><path d="M24 7h2v21h-2z"/><path d="M35 40H15c-1.7 0-3-1.3-3-3V19c0-1.7 1.3-3 3-3h7v2h-7c-.6 0-1 .4-1 1v18c0 .6.4 1 1 1h20c.6 0 1-.4 1-1V19c0-.6-.4-1-1-1h-7v-2h7c1.7 0 3 1.3 3 3v18c0 1.7-1.3 3-3 3z"/></svg>
        </SvgIcon>
        let message = t[this.props.language].IOS_MESSAGE;

        let iOSMessage = <Snackbar
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left'}}
                open={this.state.showiOSMessage}
                className="iosMessage"
                onClose={() => {
                    this.setState({ showiOSMessage: false});
                    OfflineStore.settingsStore.set("iOSMessage", "hide next time");
                }}
                message={<span>{message.substring(0, message.indexOf('[0]'))}<ScreenRotation />{message.substring(message.indexOf('[0]') + 3, message.indexOf('[1]'))}{shareIcon}{message.substring(message.indexOf('[1]') + 3, message.indexOf('[2]'))}<AddBox />{message.substring(message.indexOf('[2]') + 3)}</span>}
                action={
                  <IconButton
                    key="close"
                    aria-label="Close"
                    color="inherit"
                    onClick={() => {
                        this.setState({ showiOSMessage: false});
                        OfflineStore.settingsStore.set("iOSMessage", "hide next time");
                    }}
                  ><CloseIcon />
                  </IconButton>
                }
              />


        let instagramIcon = <div id="socialIcons">
                                <Fab
                                  size="small"
                                  aria-label="instagram"
                                  onClick={() =>
                                    window.open("https://www.instagram.com/battlechoc/", "_blank")
                                  }
                                  id="instagramIcon"
                                >
                                <SvgIcon fontSize="small">
                                    <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Instagram icon</title><path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z"/></svg>
                                </SvgIcon>
                                </Fab>
                                <Fab
                                  size="small"
                                  aria-label="twitter"
                                  onClick={() =>
                                    window.open("https://twitter.com/battlechoc", "_blank")
                                  }
                                  id="twitterIcon"
                                >
                                <SvgIcon fontSize="small">
                                    <svg xmlns="http://www.w3.org/2000/svg" role="img" viewBox="0 0 24 24"><title>Twitter icon</title><path d="M23.954 4.569c-.885.389-1.83.654-2.825.775 1.014-.611 1.794-1.574 2.163-2.723-.951.555-2.005.959-3.127 1.184-.896-.959-2.173-1.559-3.591-1.559-2.717 0-4.92 2.203-4.92 4.917 0 .39.045.765.127 1.124C7.691 8.094 4.066 6.13 1.64 3.161c-.427.722-.666 1.561-.666 2.475 0 1.71.87 3.213 2.188 4.096-.807-.026-1.566-.248-2.228-.616v.061c0 2.385 1.693 4.374 3.946 4.827-.413.111-.849.171-1.296.171-.314 0-.615-.03-.916-.086.631 1.953 2.445 3.377 4.604 3.417-1.68 1.319-3.809 2.105-6.102 2.105-.39 0-.779-.023-1.17-.067 2.189 1.394 4.768 2.209 7.557 2.209 9.054 0 13.999-7.496 13.999-13.986 0-.209 0-.42-.015-.63.961-.689 1.8-1.56 2.46-2.548l-.047-.02z"/></svg>
                                </SvgIcon>
                                </Fab>
                            </div>;

        let showInGameMenu = !this.isInitalStage() && !this.isTitleScreen();
        let textAnimation = typeof this.state.message === 'undefined' ? undefined : <div id="textAnimation" className="zoom">{this.state.message}</div>
        return (
            <div className="hud">
                <Tooltip />
                <Settings endGame={this.props.endGame} onRef={settings => (this.settings = settings)} />
                <Actionbar showSettings={() => {
                    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                    this.settings.open();
                }} />
                <InfoDialog isVisible={this.isTitleScreen() && !this.state.showTutorial} />
                <AttackPalette isVisible={showInGameMenu} />
                <BuildingPalette isVisible={showInGameMenu} />
                <InfoPanel isVisible={showInGameMenu} />
                { textAnimation }
                { iOSMessage }
                {(() => {
                    if (this.state.showTutorial) {
                        return <Tutorial closeTutorial={() => {
                            Jukebox.stopMusic();
                            this.setState({ showTutorial: false })
                        }} />
                    }
                    else if (this.isTitleScreen()) {
                        let controls = [<Button key="0" color="primary" aria-label="new game" className="menuButton" variant="contained" onClick={() => this.props.prepareNewGameCallback(false)}>{t[this.props.language].NEW_GAME}</Button>];
                        if (this.props.resumeGamePossible === true) {
                            controls.push(<Button key="1" color="primary" aria-label="resume game" className="menuButton" variant="contained" onClick={() => this.props.prepareNewGameCallback(true)}>{t[this.props.language].RESUME_GAME}</Button>);
                        }
                        controls.push([<Button key="2" color="primary" aria-label="start tutorial" className="menuButton" variant="contained" onClick={() => this.startTutorial()}>{t[this.props.language].TUTORIAL}</Button>]);
                        return (
                            <div id="mainMenu">
                                <div className="headline">
                                    <span>battle</span><span>choc</span>
                                </div>
                                <img id="cannonTitlePage" className="foregroundEntity" alt="cannon field" src="images/cannonAtField.png" />
                                <img id="treeTitlePage" className="backgroundEntity" alt="cacao tree field" src="images/treeAtField.png" />
                                <img id="creamTitlePageTop" className="backgroundEntity" alt="creamy field top" src="images/creamAtField.png" />
                                <img id="creamTitlePageBottom" className="foregroundEntity" alt="creamy field bottom" src="images/creamAtField.png" />
                                <div className="titleMenu">
                                    { this.props.assetsReady ? controls : <AssetLoadingView /> }
                                </div>
                                { instagramIcon }
                            </div>
                        );
                    } else if (this.isInitalStage()) {
                        return (
                            <div className="choose">
                                <div className={(this.state.clickable ? 'active ' : null) + ' button'} onClick={() => this.choose('LEFT_GAMEFIELD')}>
                                    {(() => {
                                        if (typeof this.props.game.board !== 'undefined') {
                                            const creamedCells = this.props.game.board.fields[0].grid.filter(cell => cell.occupiedBy.includes(EntityType.CREAM));
                                            return <div className="creamedCellCount">
                                                <img alt="filled with cream" src="images/cream_preview.png" />
                                                <p>{creamedCells.length}</p>
                                            </div>
                                        }
                                    })()}
                                    <div className="fields">
                                        {(() => {
                                            if (typeof this.props.game.board !== 'undefined') {
                                                return this.props.game.board.fields[0].grid.map(
                                                    (cell, i) => {
                                                        if (cell.occupiedBy.includes(EntityType.CREAM)) {
                                                            return <div key={i} className={cell.previewStyle}>
                                                                <img className="cream" alt="filled with cream" src="images/cream_preview.png" />
                                                            </div>
                                                        } else {
                                                            return <div key={i} className={cell.previewStyle}></div>
                                                        }
                                                    }
                                                );
                                            }
                                        })()}
                                    </div>
                                </div>

                                <div className={this.estimateButtonClasses()} onClick={() => this.choose('START')}>
                                    <div className="stackedIcon"><div className="firstIcon">#1</div><StartIcon fontSize="large" /></div>
                                </div>

                                <div className={(this.state.clickable ? 'active ' : null) + ' button'} onClick={() => this.choose('RIGHT_GAMEFIELD')}>
                                    {(() => {
                                        if (typeof this.props.game.board !== 'undefined') {
                                            const creamedCells = this.props.game.board.fields[1].grid.filter(cell => cell.occupiedBy.includes(EntityType.CREAM));
                                            return <div className="creamedCellCount">
                                                <img alt="filled with cream" src="images/cream_preview.png" />
                                                <p>{creamedCells.length}</p>
                                            </div>
                                        }
                                    })()}
                                    <div className="fields">
                                        {(() => {
                                            if (typeof this.props.game.board !== 'undefined') {
                                                return this.props.game.board.fields[1].grid.map(
                                                    (cell, i) => {
                                                        if (cell.occupiedBy.includes(EntityType.CREAM)) {
                                                            return <div key={i} className={cell.previewStyle}>
                                                                <img className="cream" alt="filled with cream" src="images/cream_preview.png" />
                                                            </div>
                                                        } else {
                                                            return <div key={i} className={cell.previewStyle}></div>
                                                        }
                                                    }
                                                );
                                            }
                                        })()}
                                    </div>
                                </div>
                            </div>
                        );
                    }
                })()}
            </div>
        );
    }
}

Hud.propTypes = {
    prepareNewGameCallback: PropTypes.func.isRequired,
    endGame: PropTypes.func.isRequired
}

const mapStateToProps = state => ({
    game: state.gameplay.game,
    state: typeof state.gameplay.game === 'undefined' ? undefined : state.gameplay.game.state,
    language: state.ui.language,
    resumeGamePossible: state.ui.resumeGamePossible,
    assetsReady: state.ui.assetsReady
});

const mapDispatchToProps = {
    chooseField,
    chooseStart
};

const HudContainer = connect(
    mapStateToProps,
    mapDispatchToProps
)(Hud);

export default HudContainer;