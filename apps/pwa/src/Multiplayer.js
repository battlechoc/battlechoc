import firebase from '@firebase/app';
import '@firebase/auth';
import '@firebase/database';
import '@firebase/firestore';
import OfflineStore from './OfflineStore';
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

const EmptyPlayerStats = Object.freeze({ coins: 0, awards: {}, skills: {}, trackRecord: [] });

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
        this.callbacks = {
            updatePlayerStats: () => { console.warn("calling updatePlayerStats without beeing initialized"); },
            notifyPlayerSignedIn: () => { console.warn("calling notifyPlayerSignedIn without beeing initialized"); }
        };

        try {
            firebase.initializeApp(firebaseConfig);
            firebase.firestore().enablePersistence()
                .catch(err => console.log("could not enable offline persistence of firestore.", err));
            firebase.auth().onAuthStateChanged((user) => {
                this.authStateChanged(user);
            });
        } catch (error) {
            console.log(error);
        }
    }

    authStateChanged(user) {
        if (user) {
            if (typeof this.callbacks.notifyPlayerSignedIn !== 'undefined') {
                this.callbacks.notifyPlayerSignedIn({ email: user.email, uid: user.uid, name: user.displayName, isAnonymous: user.isAnonymous });
            }

            console.log(user);
            console.log(this.createChallengeMeLink());

            firebase.firestore().collection('players').doc(user.uid).set({}, { merge: true }).then(() => {
                if (firebase.auth().currentUser.isAnonymous === false) {
                    this.mergePlayerStats();
                }
            }).catch(err => {
                console.log("could not create player entry.", err);
            });

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
            this.signInAnonymouslyIfNotAlreadySignedIn();
        }
    }

    registerCallbacks(callbacks) {
        this.callbacks = { ...this.callbacks, ...callbacks };
    }

    isLocalPlayer(playerIdx) {
        return playerIdx === this.localPlayerIndex;
    }

    mergeAccounts() {
        console.log("merging offline stats with account");
        this.mergePlayerStats();
    }

    pushGameStats(gameStats) {
        if (firebase.auth().currentUser && firebase.auth().currentUser.isAnonymous === false) {
            const playerInfosRef = firebase.firestore().collection('players').doc(firebase.auth().currentUser.uid);
            playerInfosRef.get().then(doc => {
                if (!doc.exists) {
                    console.warn('No such document!');
                } else {
                    let playerStats = doc.data();
                    if (typeof playerStats.trackRecord === 'undefined') {
                        playerStats.trackRecord = [];
                    }
                    playerStats.trackRecord.push(...gameStats);
                    playerStats.coins = playerStats.coins + this.calculateCoinsFromTrackRecord(gameStats);
                    console.log(playerStats.coins);
                    playerInfosRef.update(playerStats).catch(err => console.warn("could not update player track record.", err));
                    this.callbacks.updatePlayerStats(playerStats);
                }
            }).catch(err => console.warn("could not retrieve player track record.", err));
        } else {
            OfflineStore.playerStore.get('stats').then(playerStats => {
                if (typeof playerStats.trackRecord === 'undefined') {
                    playerStats.trackRecord = [];
                }
                playerStats.trackRecord.push(...gameStats);
                playerStats.coins = playerStats.coins + this.calculateCoinsFromTrackRecord(gameStats);
                OfflineStore.playerStore.set('stats', playerStats)
                    .catch(err => console.warn("could not set new player stats", err));
                this.callbacks.updatePlayerStats(playerStats);
            }).catch(err => console.warn("could not retrieve offline player stats", err));
        }
    }

    mergePlayerStats() {
        // gets called when player logs in and has already some stats offline
        if (firebase.auth().currentUser && firebase.auth().currentUser.isAnonymous === false) {
            console.log("merging stats for logged in user");
            OfflineStore.playerStore.get('stats').then(playerStats => {
                if (typeof playerStats !== 'undefined') {
                    console.log(playerStats);
                    const playerInfosRef = firebase.firestore().collection('players').doc(firebase.auth().currentUser.uid);
                    playerInfosRef.get().then(doc => {
                        if (!doc.exists) {
                            console.log("player stats not yet existing...using offline element");
                            firebase.firestore().collection('players').doc(firebase.auth().currentUser.uid).set(playerStats)
                                .catch(err => { console.log('Could not store stats for player', err); });
                        } else {
                            let newStats = doc.data();
                            if (typeof newStats.trackRecord === 'undefined') {
                                newStats.trackRecord = [];
                            }
                            if (typeof newStats.coins === 'undefined') {
                                newStats.coins = 0;
                            }
                            console.log(newStats);
                            if (playerStats.trackRecord.length > 0) {
                                const recalculatedCoins = this.calculateCoinsFromTrackRecord(playerStats.trackRecord);
                                console.log("recalculated coins: " + recalculatedCoins + " local coins: " + playerStats.coins);
                                newStats.coins = newStats.coins + recalculatedCoins;
                                newStats.trackRecord.push(...playerStats.trackRecord);
                                OfflineStore.playerStore.set('stats', EmptyPlayerStats)
                                    .catch(err => console.warn("could not set new player stats in idb.", err));
                            }
                            playerInfosRef.update(newStats).catch(err => console.warn("could not update player track record.", err));
                            this.callbacks.updatePlayerStats(newStats);
                        }
                    }).catch(err => console.warn("could not retrieve player track record.", err));

                    this.callbacks.updatePlayerStats(playerStats);
                } else {
                    this.fetchPlayerStats();
                }
            }).catch(err => {
                console.log(err);
                this.fetchPlayerStats();
            });
        } else {
            console.warn("should not be called when not logged in correctly");
        }
    }

    fetchPlayerStats() {
        // if logged on and not logged on as anonymous user, fetch player stats from firestore otherwise fetch from idb
        if (firebase.auth().currentUser && firebase.auth().currentUser.isAnonymous === false) {
            console.log("fetching player stats for logged on user");
            const playerInfosRef = firebase.firestore().collection('players').doc(firebase.auth().currentUser.uid);
            playerInfosRef.get().then(doc => {
                if (!doc.exists) {
                    console.log("player stats not yet existing...creating new object");
                    playerInfosRef.set(EmptyPlayerStats)
                        .then(() => { this.callbacks.updatePlayerStats(EmptyPlayerStats); })
                        .catch(err => { console.log('Could not store coins for player', err); });
                } else {
                    this.callbacks.updatePlayerStats(doc.data());
                }
            }).catch(err => console.warn("could not retrieve player track record.", err));
        } else {
            console.log("fetching player stats for logged off user");
            OfflineStore.playerStore.get('stats').then(playerStats => {
                if (typeof playerStats === 'undefined') {
                    OfflineStore.playerStore.set('stats', EmptyPlayerStats)
                        .catch(err => console.warn("could not set new player stats in idb.", err));
                    this.callbacks.updatePlayerStats(EmptyPlayerStats);
                } else {
                    this.callbacks.updatePlayerStats(playerStats);
                }
            }).catch(err => {
                OfflineStore.playerStore.set('stats', EmptyPlayerStats)
                    .catch(err => console.warn("could not set new player stats in idb.", err));
                console.warn("could not retrieve offline player stats trying to set an empty object anyway.", err);
                this.callbacks.updatePlayerStats(EmptyPlayerStats);
            });
        }
    }

    calculateCoinsFromTrackRecord(trackRecord) {
        if (typeof trackRecord !== 'undefined' && trackRecord.length > 0) {
            return trackRecord.reduce((currentCoins, gameStats) => {
                let coins = gameStats.attacks + gameStats.builtEntities * 2 + gameStats.espionages * 10 + gameStats.moltenFields * 50;
                if (gameStats.winners.length === 1) {
                    if (!this.isLocalPlayer(gameStats.winners[0].idx)) {
                        coins = 0;
                    }
                } else if (gameStats.winners.length === 2) {
                    coins = Math.floor(coins / 2);
                }
                return currentCoins + coins;
            }, 0);
        }
        return 0;
    }

    signOut(notifyPlayerSignedOut, signOutErrorHandler) {
        firebase.auth().signOut().then(function () {
            if (typeof notifyPlayerSignedOut !== 'undefined') {
                notifyPlayerSignedOut();
            }
        }).catch(function (error) {
            console.log("could not sign out because some error happened.", error);
            if (typeof signOutErrorHandler !== 'undefined') {
                signOutErrorHandler(error);
            }
        });
    }

    createChallengeMeLink() {
        if (firebase.auth().currentUser && typeof firebase.auth().currentUser !== 'undefined') {
            return 'https://battlechoc.com?profile=' + encodeURIComponent(firebase.auth().currentUser.uid);
        }
    }

    signInAnonymouslyIfNotAlreadySignedIn() {
        return new Promise((resolve, reject) => {
            if (firebase.auth().currentUser) {
                console.log("already signed in. will not sign in again as anonymous");
                resolve(firebase.auth().currentUser);
            } else {
                console.log("not signed in. trying to sign in anonymously");
                firebase.auth().signInAnonymously().then(signInResult => {
                    console.log("done signing in. logged in anonymously. " + firebase.auth().currentUser.uid);
                    console.log(signInResult);
                    this.callbacks.notifyPlayerSignedIn({
                        uid: signInResult.uid,
                        isAnonymous: signInResult.isAnonymous
                    });
                    resolve(signInResult.user);
                }).catch(error => {
                    reject(error);
                });
            }
        });
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
        if (events.length > this.currentEventIndex) {
            const newEventIndex = events.length;
            events.splice(0, this.currentEventIndex);
            events.forEach(action => {
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
                    console.warn('No such document!');
                } else {
                    let sessionData = doc.data();
                    if (this.localPlayerIndex === 0) {
                        sessionData.events_from_0.push(action);
                    } else {
                        sessionData.events_from_1.push(action);
                    }
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

export { multiplayer, MultiplayerGameSessionState, EmptyPlayerStats };