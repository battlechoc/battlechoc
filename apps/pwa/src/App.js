import React, { Component, Suspense } from 'react';
import { connect } from 'react-redux';
import './App.css';
import { Jukebox, translate as t, keys as tr, setCurrentLanguage } from './ui/misc';
import OfflineStore from './OfflineStore';
import { multiplayer } from './Multiplayer';
import { Rules, GameStateTypes, createPlayer, PlayerType, BattlechocError, AttackType, EntityType, isDonut } from 'battlechoc-shared-functions';
import { build, attack, finishBuildPhase, chooseStart, chooseField, startGame, resumeGame, joinGame, finishGame, createBoard, finishTurn, endGame } from './gameplay/GameActions';
import { stopSessionRefresh, startSessionRefresh, hideQuickMessage, showQuickMessage, startTutorial, stopTutorial, showOverview, resetUi, selectAttack, gameResumeable, loadUiState, updatePlayerStats, updateMultiplayerSessions, loadFriendsList, setPlayerRank, notifyPlayerSignedIn, tapBuilding, selectBuilding, toggleDonutHighlighting } from './ui/UiActions';
import Augustus from './gameplay/Augustus';
import Violet from './gameplay/Violet';
import { GameTransitions, getGameTransition } from './gameplay/GameTransitions';
import { gameplayLog } from './gameplay/GamePlayLogger';
import BuildFactoryTestSituation from './situations/tests/BuildFactoryTest';
import FactoryExtensionTest from './situations/tests/FactoryExtensionTest';
import Hud from './ui/Hud';
import uuidv4 from 'uuid/v4';
import Tutorial from './tutorial/Tutorial';
import QuickMessage from './ui/dialogs/QuickMessage';
import logger from './helper/logger';
import { TutorialSituations } from './situations/tutorial/';
const Scene = React.lazy(() => import('./3d/Scene'));

class App extends Component {
    constructor(props) {
        super(props);
        let path = window.location.pathname;
        let openInfo = false;
        if (path === '/privacy-policy') {
            openInfo = true;
        } else if (/^(\/[a-zA-Z][a-zA-Z0-9_]{2,15})$/.test(path)) {
            var player = path.slice(1);
        } else if (path.startsWith('/situation/')) {
            var situation = path.replace('/situation/', '').slice(0, 32);
        } else if (path.startsWith('/session/')) {
            var session = path.replace('/session/', '').slice(0, 20);
        }

        if (path !== '/') {
            window.history.pushState({}, null, window.location.origin);
        }

        this.timeouts = [];
        this.state = {
            player: player,
            situation: situation,
            session: session,
            openInfo: openInfo
        };
    }

    detonateAtPosition = (row, col, playerField = true) => {
        try {
            const position = { row: row, col: col };
            let playerIndex = multiplayer.localPlayerIndex;
            if (!playerField) {
                playerIndex = 1 - playerIndex;
                position.row -= this.scene.opponentGameFieldDistance;
                position.col += this.scene.opponentGameFieldDistance;
            }

            this.scene.detonateAtPosition(row, col, playerField);
            const playerBoard = this.props.game.board.fields[this.props.game.players[playerIndex].fieldIndex]
            const selectedCell = playerBoard.grid[row * this.props.game.board.size.cols + col];

            if (selectedCell.occupiedBy.filter(entity => entity.type !== EntityType.CREAM && !isDonut(entity.type)).length > 0 || selectedCell.shielded) {
                let entity = selectedCell.occupiedBy.filter(entity => !isDonut(entity.type))[0];

                const entitiesWithHp = selectedCell.occupiedBy.filter(entity => entity.type !== EntityType.CREAM && !isDonut(entity.type));
                if (entitiesWithHp.length > 0) {
                    entity = entitiesWithHp[0];
                }

                this.scene.showEnergyBar(entity, position, playerField);
            } else {
                this.scene.hideEnergyBar(null, position);
            }
        } catch (error) {
            logger.warn(error);
        }
    }

    componentDidMount() {
        multiplayer.registerCallbacks({
            updatePlayerStats: this.props.updatePlayerStats,
            updateMultiplayerSessions: this.props.updateMultiplayerSessions,
            loadFriendsList: this.props.loadFriendsList,
            setPlayerRank: this.props.setPlayerRank,
            notifyPlayerSignedIn: this.props.notifyPlayerSignedIn,
            stopSessionRefresh: this.props.stopSessionRefresh,
            startSessionRefresh: this.props.startSessionRefresh,
            showQuickMessage: this.props.showQuickMessage,
            detonateAtPosition: this.detonateAtPosition
        });

        let browserLanguage = 'en';
        if (navigator.userLanguage) {
            browserLanguage = navigator.userLanguage.substr(0, 2);
        } else if (navigator.language) {
            browserLanguage = navigator.language.substr(0, 2);
        }

        OfflineStore.settingsStore.get('language').then(language => {
            if (typeof language !== 'undefined') {
                setCurrentLanguage(language);
                this.forceUpdate();
            } else {
                setCurrentLanguage(browserLanguage);
                this.forceUpdate();
            }
        });

        OfflineStore.playerStore.get('multiplayerSessions').then(multiplayerSessions => {
            if (typeof multiplayerSessions !== 'undefined') {
                this.props.updateMultiplayerSessions(multiplayerSessions);
            }
        });

        OfflineStore.playerStore.get('friends').then(friends => {
            if (typeof friends !== 'undefined') {
                this.props.loadFriendsList(friends);
            }
        });

        OfflineStore.hasGameToResume().then((resumeable) => {
            this.props.gameResumeable(resumeable);
        });

        if (this.props.language !== 'en') {
            document.querySelector('meta[name="description"]').setAttribute("content", t(tr.META_DESCRIPTION));
            document.querySelector('meta[name="keywords"]').setAttribute("content", t(tr.META_KEYWORDS));
        }

        window.onfocus = () => Jukebox.playMusic();
        window.onblur = () => Jukebox.pauseMusic();

        multiplayer.fetchPlayerStats(this.props.updatePlayerStats);

        let iOSDevice = /^(iPhone|iPad|iPod)/.test(navigator.platform);
        let isFullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
        let isPWA = window.matchMedia('(display-mode: fullscreen)').matches;

        if (iOSDevice && !isFullscreen && !isPWA) {
            OfflineStore.settingsStore.get('iOSMessage').then(iOSMessage => {
                if (typeof iOSMessage === 'undefined') {
                    this.props.showQuickMessage({ text: t(tr.IOS_MESSAGE), variant: 'apple-pwa-hint' });
                    OfflineStore.settingsStore.set("iOSMessage", "hide next time");
                }
            });
        }
    }

    handleError = error => {
        if (error instanceof BattlechocError) {
            logger.warn(error);
        } else {
            throw error;
        }
    }

    calculateHandicap = score => {
        if (score < 1) {
            return 4;
        } else if (score < 200) {
            return 3;
        } else if (score < 500) {
            return 2;
        } else if (score < 1000) {
            return 1;
        } else {
            return 0;
        }
    }

    availableTutorials = () => {
        const tutorials = [
            TutorialSituations.BATTLECHOC_INTRO,
            TutorialSituations.FACTORY,
            TutorialSituations.CACAO_TREE,
            TutorialSituations.RUM_TRUFFLE_CANNON,
            TutorialSituations.CREAM
        ];

        const score = this.props.playerInfos.stats.score;
        if (score > 1000) {
            tutorials.push(TutorialSituations.FACTORY_EXTENSION);
            tutorials.push(TutorialSituations.EASTER_BUNNY);
            tutorials.push(TutorialSituations.XMAS_FACTORY);
            tutorials.push(TutorialSituations.HOT_CHOCOLATE_BALLISTA);
            tutorials.push(TutorialSituations.CHOCOLATE_FOUNTAIN);
            tutorials.push(TutorialSituations.FRUIT_CANNON);
            tutorials.push(TutorialSituations.DONUT_FACTORY);
            tutorials.push(TutorialSituations.DONUTS);
        } else if (score > 500) {
            tutorials.push(TutorialSituations.FACTORY_EXTENSION);
            tutorials.push(TutorialSituations.EASTER_BUNNY);
            tutorials.push(TutorialSituations.XMAS_FACTORY);
            tutorials.push(TutorialSituations.HOT_CHOCOLATE_BALLISTA);
            tutorials.push(TutorialSituations.CHOCOLATE_FOUNTAIN);
            tutorials.push(TutorialSituations.FRUIT_CANNON);
        } else if (score > 200) {
            tutorials.push(TutorialSituations.FACTORY_EXTENSION);
            tutorials.push(TutorialSituations.EASTER_BUNNY);
            tutorials.push(TutorialSituations.XMAS_FACTORY);
            tutorials.push(TutorialSituations.HOT_CHOCOLATE_BALLISTA);
        } else if (score > 0) {
            tutorials.push(TutorialSituations.FACTORY_EXTENSION);
        }

        return tutorials;
    }

    async loadSituation(situation) {
        if (this.props.tutorial) {
            this.opponent = new Violet({
                finishTurn: this.props.finishTurn,
                finishBuildPhase: this.props.finishBuildPhase,
                attack: this.props.attack
            });
        } else {
            this.opponent = new Augustus({
                chooseStart: this.props.chooseStart,
                chooseField: this.props.chooseField,
                build: this.props.build,
                attack: this.props.attack,
                finishTurn: this.props.finishTurn,
                finishBuildPhase: this.props.finishBuildPhase
            }, this.calculateHandicap(this.props.playerInfos.stats.score));
        }

        if (typeof this.props.game !== 'undefined') {
            this.timeouts.forEach(timeoutId => clearTimeout(timeoutId));
            this.scene.clear();
            await this.props.finishGame();
            await this.props.resetUi();
        }

        await this.props.resumeGame(situation.gameplay);
        this.opponent.player = this.props.game.players[1];
        this.opponent.connectGamestate(() => this.props.game, timeout => this.timeouts.push(timeout));
        await this.props.loadUiState(situation.ui);
        this.setState({ situation: undefined }, () => {
            if (![GameStateTypes.START, GameStateTypes.CHOOSE_FIELD_OR_START, GameStateTypes.CHOOSE_FIELD].includes(this.props.game.state)) {
                this.scene.startGame(this.props.game, false);
            }
        });
    }

    componentDidUpdate(prevProps) {
        if (!prevProps.assetsReady && this.props.assetsReady) {
            if (this.state.situation === 'd41d8cd98f00b204e9800998ecf8427e') {
                this.loadSituation(BuildFactoryTestSituation);
            } else if (this.state.situation === '2042050de74e855affdb312da85badbf') {
                this.loadSituation(FactoryExtensionTest);
            }
        }

        multiplayer.refreshGameState(this.props.game);
        const gameTransition = getGameTransition(prevProps.game, this.props.game);

        let gameStopped = typeof this.props.game !== 'undefined' ? !this.props.game.isRunning : false;
        if (typeof this.props.game !== 'undefined' && typeof prevProps.game !== 'undefined') {
            if (prevProps.game.isRunning && !this.props.game.isRunning) {
                gameStopped = true;
                if (!this.props.tutorial) {
                    let timeoutId = setTimeout(() => this.showOverview(), 2000);
                    this.timeouts.push(timeoutId);
                } else {
                    let timeoutId = setTimeout(() => this.endGame(), 2000);
                    this.timeouts.push(timeoutId);
                }
            }
        }

        if (typeof this.scene !== 'undefined') {
            if (typeof this.scene.playerGameField !== 'undefined') {
                if (this.props.selectedBuilding === EntityType.FRUIT_CANNON && prevProps.selectedBuilding !== EntityType.FRUIT_CANNON) {
                    this.scene.highlightCannons();
                } else if (this.props.selectedBuilding !== EntityType.FRUIT_CANNON && prevProps.selectedBuilding === EntityType.FRUIT_CANNON) {
                    this.scene.highlightCannons(false);
                }
            }
        }

        if (!gameStopped) {
            if (typeof prevProps.game !== 'undefined' && typeof this.props.game !== 'undefined' && typeof OfflineStore.gamestateStore !== 'undefined' &&
                (this.props.game.state === GameStateTypes.BUILD_PHASE || this.props.game.state === GameStateTypes.ATTACK_PHASE) && (multiplayer.isLocalPlayer(this.props.game.currentPlayerIndex))) {

                const isSingleplayerGame = this.props.game.players.filter(player => player.type === PlayerType.AUGUSTUS_GLOOP).length > 0;

                if (!prevProps.tutorial && isSingleplayerGame) {
                    let resumeableGame = {};
                    resumeableGame.gameplay = this.props.game;
                    resumeableGame.ui = this.props.ui;
                    OfflineStore.saveCurrentGame(resumeableGame).then(() => {
                        prevProps.gameResumeable(true).catch(this.handleError);
                    });
                }
            }
            if (this.props.game !== undefined && (this.props.game.state === GameStateTypes.BUILD_PHASE || this.props.game.state === GameStateTypes.ATTACK_PHASE)) {
                const winners = Rules.determineWinner(this.props.game);
                if (typeof winners !== 'undefined') {
                    prevProps.endGame({
                        winners: winners,
                        issuer: this.props.game.players[multiplayer.localPlayerIndex].id
                    });
                }
            }

            const opponentType = typeof prevProps.game !== 'undefined' ? prevProps.game.players[1 - multiplayer.localPlayerIndex].type : undefined;

            if (prevProps.selectedBuilding === EntityType.FRUIT_CANNON && typeof this.scene !== 'undefined' && typeof this.scene.playerGameField !== 'undefined' && typeof this.props.game !== 'undefined' && (this.props.game.state !== GameStateTypes.BUILD_PHASE || !multiplayer.isLocalPlayer(this.props.game.currentPlayerIndex) ||
                this.props.game.players[multiplayer.localPlayerIndex].buildings === 0 || this.props.selectedBuilding !== EntityType.FRUIT_CANNON)) {
                this.scene.highlightCannons(false);
            }

            if (!prevProps.donutHighlighting && this.props.donutHighlighting) {
                this.scene.highlightDonuts();
            }

            if (prevProps.donutHighlighting && !this.props.donutHighlighting) {
                this.scene.highlightDonuts(false);
            }

            if (this.props.donutHighlighting &&
                (multiplayer.isLocalPlayer(prevProps.game.currentPlayerIndex) !== multiplayer.isLocalPlayer(this.props.game.currentPlayerIndex)
                    || (prevProps.game.state === GameStateTypes.BUILD_PHASE && this.props.game.state === GameStateTypes.ATTACK_PHASE))) {
                this.props.toggleDonutHighlighting(false);
            }

            if (this.props.tutorial) {
                return;
            }

            const opponentIsNpc = opponentType === PlayerType.AUGUSTUS_GLOOP;

            if (gameTransition === GameTransitions.OPPONENT_STARTS_GAME && opponentIsNpc) {
                this.opponent.simulateChooseFieldOrStartDecision();
            } else if (gameTransition === GameTransitions.PLAYER_HAS_CHOSEN_START && opponentIsNpc) {
                this.opponent.simulateChooseFieldDecision();
            } else if (gameTransition === GameTransitions.PLAYER_INITAL_PLACEMENT) {
                this.scene.startGame(this.props.game);
            } else if (gameTransition === GameTransitions.OPPONENT_INITAL_PLACEMENT) {
                this.scene.startGame(this.props.game);
                if (opponentIsNpc) {
                    this.opponent.simulateInitialPlacement();
                }
            } else if (gameTransition === GameTransitions.PLAYER_FINISHED_INITIAL_PLACEMENT && opponentIsNpc) {
                this.opponent.simulateInitialPlacement();
            } else if (gameTransition === GameTransitions.PLAYER_BUILD_PHASE) {
                this.scene.triggerCacaoInfo();
            } else if (gameTransition === GameTransitions.PLAYER_ATTACK_PHASE) {
                const attacks = [AttackType.BUNNY, AttackType.TRUFFLE, AttackType.HOT_CHOCOLATE, AttackType.FRUIT];
                let availableAttackType = undefined;
                for (var attackType in attacks) {
                    if (this.props.game.players[multiplayer.localPlayerIndex].attacks[attacks[attackType]] > 0) {
                        availableAttackType = attacks[attackType];
                        break;
                    }
                }
                if (typeof availableAttackType !== 'undefined') {
                    let timeoutId = setTimeout(() => prevProps.selectAttack(attacks[attackType]).catch(this.handleError), 200);
                    this.timeouts.push(timeoutId);
                }
            } else if (gameTransition === GameTransitions.OPPONENT_BUILD_PHASE) {
                if (opponentIsNpc || opponentType === PlayerType.VIOLET_BEAUREGARDE) {
                    this.opponent.simulateBuildPhase();
                }
            } else if (gameTransition === GameTransitions.OPPONENT_ATTACK_PHASE) {
                if (opponentIsNpc || opponentType === PlayerType.VIOLET_BEAUREGARDE) {
                    this.opponent.simulateAttackPhase(this.detonateAtPosition, donut => this.scene.triggerDonutInfo(donut));
                }
            } else if (gameTransition === GameTransitions.ATTACKS_DEPLETED) {
                let timeoutId = setTimeout(() => prevProps.finishTurn({ issuer: prevProps.game.players[multiplayer.localPlayerIndex].id }).catch(this.handleError), 3000);
                this.timeouts.push(timeoutId);
            }
        }
    }

    enterMultiplayerGame = sessionId => {
        multiplayer.enterGameSession(sessionId, { build: this.props.build, attack: this.props.attack, finishTurn: this.props.finishTurn, finishBuildPhase: this.props.finishBuildPhase, chooseStart: this.props.chooseStart, chooseField: this.props.chooseField, endGame: this.props.endGame })
            .then(session => {
                this.prepareNewGame(true, true, session.game);
            })
            .catch(error => {
                if (error instanceof ReferenceError) {
                    this.props.showQuickMessage({ text: t(tr.WARNING_GAME_NOT_JOINABLE) });
                }
            });
    }

    prepareNewGame = (resumeGame, joinMultiplayer, multiplayerGameState) => {
        const isAndroidApp = typeof window.Android !== 'undefined';
        const isAndroidDevice = /Android/i.test(navigator.userAgent);
        const isiOS = /^(iPhone|iPad|iPod)/.test(navigator.platform);
        const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;

        if (isAndroidApp) {
            window.Android.setScreenOrientationLandscape();
        } else if (!isFullscreen && !isiOS) {
            if (typeof document.documentElement.requestFullscreen === 'function') {
                document.documentElement.requestFullscreen().then(() => {
                    if (isAndroidDevice) {
                        window.screen.orientation.lock('landscape').catch(error => logger.info('Unable to lock orientation to landscape'));
                    }
                }).catch(error => {
                    logger.warn(error.name + ': ' + error.message);
                });
            }
        }

        if (!this.props.playerInfos.stats.tutorialFinished && !this.props.playerInfos.stats.tutorialSkipped) {
            this.startTutorial();
        } else {
            Jukebox.startMusic(Jukebox.SONGS.MAIN_THEME);
            Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
            gameplayLog.clear();

            if (joinMultiplayer === true && typeof multiplayerGameState !== 'undefined') {
                this.props.joinGame(multiplayerGameState).then(() => {
                    this.opponent = { player: this.props.game.players[0] };
                    if (this.props.game.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT || this.props.game.state === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT) {
                        if (multiplayer.isLocalPlayer(this.props.game.currentPlayerIndex)) {
                            if (this.props.game.players[this.props.game.currentPlayerIndex].hasFactory === true) {
                                console.log("player already built its factory, but did not kick off finishturn event.");
                                this.props.finishTurn({ issuer: this.props.game.players[this.props.game.currentPlayerIndex].id });
                            }
                        }
                        this.scene.startGame(this.props.game, false);
                    } else if (this.props.game.state !== GameStateTypes.CHOOSE_FIELD_OR_START && this.props.game.state !== GameStateTypes.CHOOSE_FIELD) {
                        if (this.props.game.state === GameStateTypes.BUILD_PHASE) {
                            this.props.tapBuilding(EntityType.CACAOTREE);
                            this.props.selectBuilding(EntityType.CACAOTREE);
                        }
                        this.scene.startGame(this.props.game, false);
                    }
                });
            } else {
                OfflineStore.getResumeableGame().then(resumeableGame => {
                    this.opponent = new Augustus({
                        chooseStart: this.props.chooseStart,
                        chooseField: this.props.chooseField,
                        build: this.props.build,
                        attack: this.props.attack,
                        finishTurn: this.props.finishTurn,
                        finishBuildPhase: this.props.finishBuildPhase
                    }, this.calculateHandicap(this.props.playerInfos.stats.score));
                    if (typeof resumeableGame !== 'undefined' && resumeGame) {
                        this.props.resumeGame(resumeableGame.gameplay).then(() => {
                            this.opponent.player = resumeableGame.gameplay.players[1];
                            this.opponent.connectGamestate(() => this.props.game, timeout => this.timeouts.push(timeout));
                            this.props.loadUiState(resumeableGame.ui).then(() => {
                                if (![GameStateTypes.START, GameStateTypes.CHOOSE_FIELD_OR_START, GameStateTypes.CHOOSE_FIELD].includes(this.props.game.state)) {
                                    this.scene.startGame(this.props.game, false);
                                }
                            });
                        });
                    } else {
                        this.props.gameResumeable(false);
                        OfflineStore.gamestateStore.clear();
                        let players = [
                            createPlayer("Charlie Bucket", PlayerType.HUMAN, this.props.playerInfos.stats.level),
                            createPlayer("Augustus Gloop", PlayerType.AUGUSTUS_GLOOP, this.props.playerInfos.stats.level)
                        ];

                        this.props.startGame(players).then(() => {
                            this.opponent.type = Augustus.randomizeType();
                            this.opponent.connectGamestate(() => this.props.game, timeout => this.timeouts.push(timeout));
                            // TODO maybe adjust camera position based on boardsize (6/8/10)
                            const boardSize = (this.props.playerInfos.stats.score < 200) ? { rows: 6, cols: 6 } : (this.props.playerInfos.stats.score < 500) ? { rows: 8, cols: 8 } : { rows: 10, cols: 10 };
                            this.props.createBoard({
                                boardSize: boardSize,
                                boardSeed: Math.floor(Math.random * 1000000)
                            });
                        });
                    }
                });
            }
        }
    }

    endGame(coins) {
        if (!this.props.tutorial) {
            Jukebox.stopMusic(true);
            setTimeout(() => {
                this.props.finishGame();
                this.props.resetUi();

                const isAndroidApp = typeof window.Android !== 'undefined';
                const isAndroidDevice = /Android/i.test(navigator.userAgent);

                if (isAndroidApp) {
                    window.Android.setScreenOrientationAny();
                } else if (isAndroidDevice) {
                    window.screen.orientation.unlock();
                }

                multiplayer.reset();
                this.scene.clear();

                const score = this.props.playerInfos.stats.score;
                if (typeof coins !== 'undefined' && coins > 0) {
                    if (score - coins === 0) {
                        this.props.startTutorial({
                            loops: [TutorialSituations.FACTORY_EXTENSION],
                            notificationOnLoopsEnd: { title: t(tr.NOTIFICATION_UNLOCK_EXTENSION_TITLE), message: t(tr.NOTIFICATION_UNLOCK_EXTENSION_MESSAGE, 200 - score) }
                        });
                    } else if ((score - coins) < 200 && score > 200) {
                        this.props.startTutorial({
                            loops: [TutorialSituations.EASTER_BUNNY, TutorialSituations.XMAS_FACTORY, TutorialSituations.HOT_CHOCOLATE_BALLISTA],
                            notificationOnLoopsEnd: { title: t(tr.NOTIFICATION_UNLOCK_BUNNY_TITLE), message: t(tr.NOTIFICATION_UNLOCK_BUNNY_MESSAGE, 500 - score) }
                        });
                    } else if ((score - coins) < 500 && score > 500) {
                        this.props.startTutorial({
                            loops: [TutorialSituations.CHOCOLATE_FOUNTAIN, TutorialSituations.FRUIT_CANNON],
                            notificationOnLoopsEnd: { title: t(tr.NOTIFICATION_UNLOCK_FOUNTAIN_TITLE), message: t(tr.NOTIFICATION_UNLOCK_FOUNTAIN_MESSAGE, 1000 - score) }
                        });
                    } else if ((score - coins) < 1000 && score > 1000) {
                        this.props.showQuickMessage({ text: t(tr.UNLOCK_CONGRATULATIONS_CHOCLAB), variant: 'success' });
                        this.props.showQuickMessage({ text: t(tr.UNLOCK_CONGRATULATIONS_MULTIPLAYER), variant: 'success' });
                        this.props.startTutorial({ loops: [TutorialSituations.DONUT_FACTORY, TutorialSituations.DONUTS] });
                    }
                }
                multiplayer.getMultiplayerSessions();
            }, 1000);
        }
    }

    surrender() {
        const winners = []
        winners.push(Object.assign({ idx: 1 - multiplayer.localPlayerIndex }, this.props.game.players[1 - multiplayer.localPlayerIndex]));
        this.props.endGame({
            winners: winners,
            issuer: this.props.game.players[multiplayer.localPlayerIndex].id
        });
    }

    showOverview() {
        Jukebox.stopMusic(true);
        this.props.showOverview();
        this.props.gameResumeable(false);
        OfflineStore.gamestateStore.clear();
        const stats = { ...this.props.game.players[multiplayer.localPlayerIndex].statistics, winners: this.props.game.winners, id: uuidv4() };
        multiplayer.pushGameStats([stats]);
    }

    async reset() {
        if (typeof this.props.game !== 'undefined') {
            this.scene.stopAllAnimations();
            this.scene.clear();
            await this.props.finishGame();
            await this.props.resetUi();
        }
    }

    setRenderLoop(run) {
        this.scene.setRenderLoop(run);
    }

    closeTutorial = async startGame => {
        this.timeouts.forEach(timeoutId => clearTimeout(timeoutId));

        Jukebox.stopMusic(true);
        console.log("stopping tutorial");
        this.props.stopTutorial();
        await this.reset();

        if (startGame) {
            this.prepareNewGame(false);
        }
    }

    startTutorial() {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        Jukebox.startMusic(Jukebox.SONGS.MAIN_THEME);
        this.props.startTutorial({ loops: this.availableTutorials() });
    }

    render() {
        return (
            <div className="app">
                {this.props.quickMessages.map((message, key) => <QuickMessage
                    open={true}
                    key={key}
                    position={key}
                    variant={message.variant}
                    onClose={() => this.props.hideQuickMessage(message.id)}
                    message={message.text}
                />
                )}
                <Suspense fallback={null}>
                    <Scene onRef={scene => this.scene = scene} />
                </Suspense>
                <Hud prepareNewGameCallback={this.prepareNewGame}
                    enterMultiplayerGame={this.enterMultiplayerGame}
                    startTutorial={() => this.startTutorial()}
                    className={this.props.tutorial ? 'tutorial hud' : 'hud'}
                    endGame={coins => this.endGame(coins)}
                    surrender={() => this.surrender()}
                    challengedPlayer={this.state.player}
                    openInfo={this.state.openInfo}
                    sessionId={this.state.session} />
                {this.props.tutorial ? <Tutorial
                    spawnInfo={(messageType, position, amount, donutType) => this.scene.spawnInfo(messageType, position, amount, donutType)}
                    setRenderLoop={run => this.setRenderLoop(run)}
                    reset={async () => await this.reset()}
                    detonateAtPosition={this.detonateAtPosition}
                    selectBuilding={this.props.selectBuilding}
                    tapBuilding={this.props.tapBuilding}
                    selectAttack={this.props.selectAttack}
                    loadSituation={async situation => await this.loadSituation(situation)}
                    closeTutorial={this.closeTutorial} /> : null}
            </div>
        );
    }
}

const mapStateToProps = state => ({
    game: state.gameplay.game,
    language: state.ui.language,
    selectedBuilding: state.ui.selectedBuilding,
    donutHighlighting: state.ui.donutHighlighting,
    ui: state.ui,
    tutorial: state.ui.tutorial,
    assetsReady: state.ui.assetsReady,
    playerInfos: state.ui.playerInfos,
    quickMessages: state.ui.quickMessages
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
    selectAttack,
    gameResumeable,
    loadUiState,
    resetUi,
    showOverview,
    startTutorial,
    stopTutorial,
    updatePlayerStats,
    updateMultiplayerSessions,
    loadFriendsList,
    setPlayerRank,
    notifyPlayerSignedIn,
    selectBuilding,
    tapBuilding,
    hideQuickMessage,
    showQuickMessage,
    startSessionRefresh,
    stopSessionRefresh,
    toggleDonutHighlighting
};

const AppContainer = connect(
    mapStateToProps,
    mapDispatchToProps
)(App);

export default AppContainer;