import React, { Component } from 'react';
import { connect } from 'react-redux';
import './App.css';
import Jukebox from './ui/Jukebox';
import t from './ui/Translation';
import OfflineStore from './OfflineStore';
import Rules from './gameplay/Rules';
import { multiplayer } from './Multiplayer';
import { AttackType, EntityType } from './gameplay/GameEntities';
import { build, attack, finishBuildPhase, chooseStart, chooseField, startGame, resumeGame, joinGame, finishGame, createBoard, finishTurn, endGame } from './gameplay/GameActions';
import { changeLanguage, selectAttack, gameResumeable } from './ui/UiActions';
import { Augustus } from './gameplay/Player';
import { GameTransitions, getGameTransition } from './gameplay/GameTransitions';
import { GameStateTypes } from './gameplay/GameplayReducer';
import { BattlechocError } from './gameplay/Errors';
import { createPlayer, PlayerType } from './gameplay/Player';
import { gameplayLog } from './gameplay/GamePlayLogger';
import Scene from './3d/Scene';
import Hud from './ui/Hud';

class App extends Component {
    constructor(props) {
        super(props);
        let multiplayerSessionId = window.location.search.split("sessionid=")[1];
        this.state = { 
            multiplayerLandingPage:  typeof multiplayerSessionId !== 'undefined',
            multiplayerSessionId: multiplayerSessionId
        }
        let query = window.location.search.substring(1)
        if(query.length) {
           if(typeof window.history !== 'undefined' && typeof window.history.pushState !== 'undefined') {
                window.history.pushState({}, document.title, window.location.pathname);
           }
        }
    }

    componentWillMount() {
        let browserLanguage = 'en';
        if (navigator.userLanguage) {
            browserLanguage = navigator.userLanguage.substr(0, 2);
        } else if (navigator.language) {
            browserLanguage = navigator.language.substr(0, 2);
        }

        OfflineStore.settingsStore.get('language').then(language => {
            if (typeof language !== 'undefined') {
                this.props.changeLanguage(language);
            } else {
                this.props.changeLanguage(browserLanguage);
            }
        });
    }

    componentDidMount() {
        OfflineStore.hasGameToResume().then((resumeable) => {
            this.props.gameResumeable(resumeable);
        });

        if (this.props.language !== 'en') {
            document.querySelector('meta[name="description"]').setAttribute("content", t[this.props.language].META_DESCRIPTION);
            document.querySelector('meta[name="keywords"]').setAttribute("content", t[this.props.language].META_KEYWORDS);
        }

        window.onfocus = () => Jukebox.playMusic();
        window.onblur = () => Jukebox.pauseMusic();
    }

    handleError = error => {
        if (error instanceof BattlechocError) {
            console.warn(error);
        } else {
            throw error;
        }
    }

    componentWillReceiveProps(nextProps) {
        multiplayer.refreshGameState(nextProps.game);
        const gameTransition = getGameTransition(this.props.game, nextProps.game);

        let gameStopped = typeof this.props.game !== 'undefined' ? !this.props.game.isRunning : false;
        if (typeof this.props.game !== 'undefined' && typeof nextProps.game !== 'undefined') {
            if (this.props.game.isRunning === true && nextProps.game.isRunning === false) {
                gameStopped = true;
                setTimeout(() => {
                    if (nextProps.game.winners.length === 1) {
                        if (multiplayer.isLocalPlayer(nextProps.game.winners[0].idx)) {
                            this.hud.showTurnMessage(t[this.props.language].MESSAGE_WIN_GAME);
                        } else {
                            this.hud.showTurnMessage(t[this.props.language].MESSAGE_LOST_GAME);
                        }
                    } else if (nextProps.game.winners.length === 2) {
                        this.hud.showTurnMessage(t[this.props.language].MESSAGE_DRAW_GAME);
                    }
                    setTimeout(() => this.endGame(), 2000);
                }, 2000);
            }
        }

        if (gameTransition === GameTransitions.GAME_FINISHED) {
            this.scene.clear();
            this.props.gameResumeable(false);
            OfflineStore.gamestateStore.clear();
        }

        if (typeof this.scene !== 'undefined') {
            if (typeof this.scene.playerGameField !== 'undefined') {
                if (nextProps.selectedBuilding === EntityType.FRUIT_CANNON && this.props.selectedBuilding !== EntityType.FRUIT_CANNON) {
                    this.scene.dimLight();
                    this.scene.playerGameField.highlightCannons();
                } else if (nextProps.selectedBuilding !== EntityType.FRUIT_CANNON && this.props.selectedBuilding === EntityType.FRUIT_CANNON) {
                    this.scene.resetLight();
                    this.scene.playerGameField.highlightCannons(true);
                }
            }
        }

        if (!gameStopped) {
            if (typeof this.props.game !== 'undefined' && typeof nextProps.game !== 'undefined' && typeof OfflineStore.gamestateStore !== 'undefined' &&
                (nextProps.game.state === GameStateTypes.BUILD_PHASE || nextProps.game.state === GameStateTypes.ATTACK_PHASE) && (multiplayer.isLocalPlayer(nextProps.game.currentPlayerIndex) === true)) {

                OfflineStore.saveCurrentGame(nextProps.game).then(() => {
                    this.props.gameResumeable(true).catch(this.handleError);
                });
            }
            if (nextProps.game !== undefined && (nextProps.game.state === GameStateTypes.BUILD_PHASE || nextProps.game.state === GameStateTypes.ATTACK_PHASE)) {
                const winners = Rules.determineWinner(nextProps.game);
                if (typeof winners !== 'undefined') {
                    this.props.endGame(winners)
                }
            }

            if (this.props.selectedBuilding === EntityType.FRUIT_CANNON && typeof this.scene !== 'undefined' && typeof this.scene.playerGameField !== 'undefined' && typeof nextProps.game !== 'undefined' && (nextProps.game.state !== GameStateTypes.BUILD_PHASE || multiplayer.isLocalPlayer(nextProps.game.currentPlayerIndex) === false ||
                nextProps.game.players[multiplayer.localPlayerIndex].buildings === 0 || nextProps.selectedBuilding !== EntityType.FRUIT_CANNON)) {
                this.scene.resetLight();
                this.scene.playerGameField.highlightCannons(true);
            }

            if (gameTransition === GameTransitions.OPPONENT_HAS_CHOSEN_START) {
                this.hud.unlockUi();
                this.colorStartButton = 1;
            } else if (gameTransition === GameTransitions.OPPONENT_STARTS_GAME) {
                if (this.opponent.player.type === PlayerType.AUGUSTUS_GLOOP) {
                    this.opponent.simulateChooseFieldOrStartDecision();
                }
            } else if (gameTransition === GameTransitions.PLAYER_HAS_CHOSEN_START) {
                if (this.opponent.player.type === PlayerType.AUGUSTUS_GLOOP) {
                    this.opponent.simulateChooseFieldDecision();
                }
            } else if (gameTransition === GameTransitions.PLAYER_INITAL_PLACEMENT) {
                this.scene.startGame(false, nextProps.game);
            } else if (gameTransition === GameTransitions.OPPONENT_INITAL_PLACEMENT) {
                this.scene.startGame(false, nextProps.game);
                if (this.opponent.player.type === PlayerType.AUGUSTUS_GLOOP) {
                    this.opponent.simulateInitialPlacement(this.scene.opponentGameField);
                }
            } else if (gameTransition === GameTransitions.PLAYER_FINISHED_INITIAL_PLACEMENT) {
                if (this.opponent.player.type === PlayerType.AUGUSTUS_GLOOP) {
                    this.opponent.simulateInitialPlacement(this.scene.opponentGameField);
                }
            } else if (gameTransition === GameTransitions.PLAYER_BUILD_PHASE) {
                this.scene.triggerCacaoInfo();
            } else if (gameTransition === GameTransitions.PLAYER_ATTACK_PHASE) {
                const attacks = [AttackType.BUNNY, AttackType.TRUFFLE, AttackType.HOT_CHOCOLATE, AttackType.FRUIT];
                let availableAttackType = undefined;
                for (var attackType in attacks) {
                    if (nextProps.game.players[multiplayer.localPlayerIndex].attacks[attacks[attackType]] > 0) {
                        availableAttackType = attacks[attackType];
                        break;
                    }
                }
                if (typeof availableAttackType !== 'undefined') {
                    setTimeout(() => this.props.selectAttack(attacks[attackType]).catch(this.handleError), 200);
                }
            } else if (gameTransition === GameTransitions.OPPONENT_BUILD_PHASE) {
                if (this.opponent.player.type === PlayerType.AUGUSTUS_GLOOP) {
                    this.opponent.simulateBuildPhase(this.scene.opponentGameField);
                }
            } else if (gameTransition === GameTransitions.OPPONENT_ATTACK_PHASE) {
                if (this.opponent.player.type === PlayerType.AUGUSTUS_GLOOP) {
                    this.opponent.simulateAttackPhase(this.scene.opponentGameField, this.scene.playerGameField);
                }
            } else if (gameTransition === GameTransitions.ATTACKS_DEPLETED) {
                setTimeout(() => this.props.finishTurn({ issuer: this.props.game.players[multiplayer.localPlayerIndex].id }).catch(this.handleError), 3000);
            } else if (gameTransition === GameTransitions.PLAYER_JOINED) {
                this.opponent.player = {
                    player: nextProps.game.players[1]
                };
            }
        }
    }

    joinMultiplayerGame = () => {
        multiplayer.joinGameSession(this.state.multiplayerSessionId, { build: this.props.build, attack: this.props.attack, finishTurn: this.props.finishTurn, finishBuildPhase: this.props.finishBuildPhase, chooseStart: this.props.chooseStart, chooseField: this.props.chooseField })
        .then(session => {    
            console.dir(session);
            this.prepareNewGame(true, true, session.game);
        });
        this.hud.lockUi();
    }

    prepareNewGame = async (resumeGame, joinMultiplayer, multiplayerGameState) => {
        Jukebox.startMusic(Jukebox.SONGS.MAIN_THEME);
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        gameplayLog.clear();

        const searchParams = new URLSearchParams(window.location.search);
        const isPwa = searchParams.get('app_runs_as') === 'pwa';
        let isAndroid = /Android/i.test(navigator.userAgent);

        if (!isPwa) {
            try {
                await document.documentElement.requestFullscreen();
                if (isAndroid) {
                    await window.screen.orientation.lock('landscape');
                }
            } catch (error) {
                console.log(error.name + ': ' + error.message);
            }
        }

        if (joinMultiplayer === true && typeof multiplayerGameState !== 'undefined') {
            this.props.joinGame(multiplayerGameState).then(() => {
                this.opponent = { player: this.props.game.players[0] };
            });
        } else {
            OfflineStore.getResumeableGame().then((resumeableGame) => {
                this.opponent = new Augustus({
                    chooseStart: this.props.chooseStart,
                    chooseField: this.props.chooseField,
                    build: this.props.build,
                    attack: this.props.attack,
                    finishTurn: this.props.finishTurn,
                    finishBuildPhase: this.props.finishBuildPhase
                });

                if (typeof resumeableGame !== 'undefined' && resumeGame) {
                    this.props.resumeGame(resumeableGame).then(() => {
                        this.opponent.player = resumeableGame.players[1];
                        this.opponent.connectGamestate(() => this.props.game);
                        this.scene.startGame(true, this.props.game);
                    });
                } else {
                    let players = [
                        createPlayer("Charlie Bucket", PlayerType.HUMAN),
                        createPlayer("Augustus Gloop", PlayerType.AUGUSTUS_GLOOP)
                    ];

                    this.props.startGame(players).then(() => {
                        this.opponent.type = Augustus.randomizeType();
                        this.opponent.connectGamestate(() => this.props.game);

                        setTimeout(() => {
                            this.props.createBoard({
                                boardSize: { rows: 8, cols: 8 },
                                boardSeed: 42
                            });
                        }, 1000);
                    });
                }
            });
        }
    }

    endGame() {
        setTimeout(() => {
            Jukebox.stopMusic();
            this.setState({
                multiplayerLandingPage: undefined,
                multiplayerSessionId: undefined
            })
            this.props.finishGame();
        }, 1000);
    }

    render() {
        return (
            <div className="app">
                {this.props.assetsReady ? <div id="clouds"></div> : null}
                {typeof this.props.game !== 'undefined' ? <Scene onRef={scene => this.scene = scene} /> : null}
                <Hud prepareNewGameCallback={this.prepareNewGame}
                     multiplayerLandingPage={this.state.multiplayerLandingPage}
                     joinMultiplayerGame={this.joinMultiplayerGame}
                     endGame={() => this.endGame()}
                     onRef={hud => this.hud = hud} />
            </div>
        );
    }
}

const mapStateToProps = state => ({
    game: state.gameplay.game,
    language: state.ui.language,
    assetsReady: state.ui.assetsReady,
    selectedBuilding: state.ui.selectedBuilding
});

const mapDispatchToProps = {
    chooseStart,
    chooseField,
    startGame,
    endGame,
    joinGame,
    build,
    attack,
    resumeGame,
    createBoard,
    finishTurn,
    finishBuildPhase,
    finishGame,
    changeLanguage,
    selectAttack,
    gameResumeable
};

const AppContainer = connect(
    mapStateToProps,
    mapDispatchToProps
)(App);

export default AppContainer;