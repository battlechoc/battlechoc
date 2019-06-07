import firebase from 'firebase/app';
import 'firebase/auth';
import 'firebase/database';
import 'firebase/firestore';
import { createPlayer, PlayerType } from './gameplay/Player';
import { GameActionTypes } from './gameplay/GameActions';
import { AttackType } from './gameplay/GameEntities';
import { Jukebox } from './ui/misc';

const MultiplayerGameSessionState = Object.freeze({
    UNINITIALIZED: 'MultiplayerGameSessionState.Uninitialized',
    CREATED: 'MultiplayerGameSessionState.Created',
    RUNNING: 'MultiplayerGameSessionState.Running',
    FINISHED: 'MultiplayerGameSessionState.Finished'
});

class Multiplayer {
    constructor() {
        const firebaseConfig = {
            apiKey: "***REMOVED***",
            authDomain: "battlechoc.firebaseapp.com",
            databaseURL: "https://battlechoc.firebaseio.com",
            projectId: "battlechoc",
            storageBucket: "battlechoc.appspot.com",
            messagingSenderId: "618424349380"
        };

        this.localPlayerIndex = 0;

        try {
            // initialize firebase
            firebase.initializeApp(firebaseConfig);

            // setup presence system callbacks
            firebase.auth().onAuthStateChanged((user) => {
                if (user) {
                    this.localPlayer = user;
                    const userStatusDatabaseRef = firebase.database().ref('/status/' + this.localPlayer.uid);
                    const userStatusFirestoreRef = firebase.firestore().doc('/status/' + this.localPlayer.uid);

                    let isOfflineForDatabase = {
                        state: 'offlinedb',
                        last_changed: firebase.database.ServerValue.TIMESTAMP,
                    };

                    let isOnlineForDatabase = {
                        state: 'onlinedb',
                        last_changed: firebase.database.ServerValue.TIMESTAMP,
                    };

                    let isOfflineForFirestore = {
                        state: 'offlinest',
                        last_changed: firebase.firestore.FieldValue.serverTimestamp(),
                    };

                    let isOnlineForFirestore = {
                        state: 'onlinest',
                        last_changed: firebase.firestore.FieldValue.serverTimestamp(),
                    };

                    firebase.database().ref('.info/connected').on('value', function (snapshot) {
                        if (snapshot.val() === false) {
                            userStatusFirestoreRef.set(isOfflineForFirestore);
                            return;
                        };

                        userStatusDatabaseRef.onDisconnect().set(isOfflineForDatabase).then(function () {
                            userStatusDatabaseRef.set(isOnlineForDatabase);
                            userStatusFirestoreRef.set(isOnlineForFirestore);
                        });
                    });
                } else {
                    this.localPlayer = undefined;
                }
            });
        } catch (error) {
            console.log(error);
        }
    }

    isLocalPlayer(playerIdx) {
        return playerIdx === this.localPlayerIndex;
    }

    signIn() {
        return new Promise((resolve, reject) => {
            if (typeof this.localPlayer === 'undefined') {
                firebase.auth().signInAnonymously().catch(function (error) {
                    reject(error);
                });
                firebase.auth().onAuthStateChanged((user) => {
                    if (user) {
                        resolve(user);
                    }
                });
            } else {
                resolve(this.localPlayer);
            }
        });
    }

    refreshGameState(gameState) {
        this.gameState = gameState;
    }

    emitAction(action) {
        switch (action.type) {
            case GameActionTypes.build:
                this.gameActions.build(action.payload);
                break;
            case GameActionTypes.attack:
                this.gameActions.attack(action.payload).then(() => {
                    if (action.payload.attackType === AttackType.BUNNY) {
                        if (this.gameState.players[1 - this.localPlayerIndex].attacksPerTurn[AttackType.BUNNY] > 0) {
                            Jukebox.playSound(Jukebox.SOUNDS.ATTACK_BUNNY);
                        } else {
                            Jukebox.playSound(Jukebox.SOUNDS.BUNNY_CAUGHT);
                        }
                    } else {
                        Jukebox.playSound(Jukebox.SOUNDS.ATTACK_EXPLOSION);
                    }
                });
                break;
            case GameActionTypes.chooseField:
                this.gameActions.chooseField(action.payload);
                break;
            case GameActionTypes.chooseStart:
                this.gameActions.chooseStart(action.payload);
                break;
            case GameActionTypes.finishTurn:
                this.gameActions.finishTurn(action.payload);
                break;
            case GameActionTypes.finishBuildPhase:
                this.gameActions.finishBuildPhase(action.payload);
                break;
            default:
                console.warn('invalid action type shall be emitted. check implementation. call the coders.');
        }
    }

    processEvents(events) {
        console.log("processEvents");
        console.log(events);
        console.log(this.currentEventIndex);
        if (events.length > this.currentEventIndex) {
            const newEventIndex = events.length;
            console.log("received new events");
            console.log(events);
            events.splice(0, this.currentEventIndex);
            console.dir(events);
            events.forEach(action => {
                console.log(action);
                this.emitAction(action);
            });
            this.currentEventIndex = newEventIndex;
        }
    }

    relayAction(action) {
        if (typeof this.currentGameSession !== 'undefined' && action.payload.issuer === this.localPlayerId) {
            const sessionRef = firebase.firestore().collection('multiplayerGameSessions').doc(this.currentGameSession);
            sessionRef.get().then(doc => {
                if (!doc.exists) {
                    console.log('No such document!');
                } else {
                    console.log("adding action to doc");
                    let sessionData = doc.data();
                    if (this.localPlayerIndex === 0) {
                        sessionData.events_from_0.push(action);
                    } else {
                        sessionData.events_from_1.push(action);
                    }
                    console.dir(sessionData);
                    sessionRef.set(sessionData);
                }
            }).catch(err => {
                console.log('Error getting document', err);
            });
        }
    }

    reset() {
        this.localPlayerIndex = 0;
        this.currentEventIndex = 0;
        this.currentGameSession = undefined;
    }

    joinGameSession(sessionId, gameActions) {
        return new Promise((resolve, reject) => {
            this.signIn().then((player) => {
                if (typeof player !== 'undefined') {
                    this.gameActions = gameActions;
                    this.currentEventIndex = 0;
                    this.localPlayerIndex = 1;
                    const sessionRef = firebase.firestore().collection('multiplayerGameSessions').doc(sessionId);
                    sessionRef.onSnapshot(session => {
                        console.log("on snap");
                        console.dir(session.data());
                        this.sessionData = session.data();
                        this.processEvents(session.data().events_from_0);
                    }, error => {
                        console.error('Encountered error while trying to establish observer of multiplayer session', error);
                    });
                    sessionRef.get().then(doc => {
                        if (!doc.exists) {
                            console.log('No such document!');
                            reject('No such multiplayer game session!');
                        } else {
                            this.currentGameSession = doc.id;
                            let docData = doc.data();
                            docData.players = [doc.data().players[0], this.localPlayer.uid];
                            docData.state = MultiplayerGameSessionState.RUNNING;
                            docData.game.players[this.localPlayerIndex] = createPlayer("Your mom", PlayerType.HUMAN);
                            this.localPlayerId = docData.game.players[this.localPlayerIndex].id;
                            console.log(this.localPlayerId);
                            sessionRef.set(docData);
                            resolve(docData);
                        }
                    }).catch(err => {
                        console.log('Error getting document', err);
                    });
                }
            }).catch(error => {
                reject(error);
            });
        });
    }

    createGameSession(gameState, playerJoinedAction, joinedMultiplayer, gameActions) {
        return new Promise((resolve, reject) => {
            this.signIn().then((player) => {
                if (typeof player !== 'undefined') {
                    this.gameActions = gameActions;
                    this.currentEventIndex = 0;
                    this.localPlayerIndex = 0;
                    this.localPlayerId = gameState.players[this.localPlayerIndex].id;
                    console.log(this.localPlayerId);
                    firebase.firestore().collection('multiplayerGameSessions').add({
                        state: MultiplayerGameSessionState.CREATED,
                        players: [player.uid, null],
                        events_from_0: [],
                        events_from_1: [],
                        game: gameState,
                        last_changed: firebase.firestore.FieldValue.serverTimestamp(),
                    }).then(ref => {
                        this.currentGameSession = ref.id;
                        ref.onSnapshot(session => {
                            if (session.data().players[1] !== null && (typeof this.sessionData === 'undefined' || this.sessionData.players[1] === null)) {
                                console.log("player joined");
                                console.log(session.data().players);
                                joinedMultiplayer();
                                playerJoinedAction({ players: session.data().game.players });
                            }
                            this.sessionData = session.data();
                            this.processEvents(session.data().events_from_1);
                        }, error => {
                            console.error('Encountered error while trying to establish observer of multiplayer session', error);
                        });
                        resolve({
                            url: window.location.origin + '?sessionid=' + ref.id,
                            id: ref.id
                        });
                    });
                }
            }).catch(error => {
                reject(error);
            });
        });
    }
}

const multiplayer = new Multiplayer();

export { multiplayer, MultiplayerGameSessionState };