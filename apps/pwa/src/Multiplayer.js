import * as firebase from 'firebase';
import { createPlayer, PlayerType } from './gameplay/Player';

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

        this.currentGameSession = undefined;
        this.sessionData = undefined;
        this.localPlayer = undefined;
        this.currentEventIndex = undefined;
        this.localPlayerIndex = undefined;

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
                    console.log("signout");
                    this.localPlayer = undefined;
                }
            });
        } catch (error) {
            console.log(error);
        }
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

    processEvents(events) {
        console.log("processEvents");
        //console.dir(events_from);
        //let events = Array.from(events_from);
        console.log(events);
        console.log(this.currentEventIndex);
        if (events.length > 0 && (this.currentEventIndex < events.length - 1)) {
            console.log("received new events");
            console.log(events);
            //events.splice(this.currentEventIndex + 1);
            console.dir(events);
            console.dir(this.currentEventIndex);
            // TODO emit actions in sequence!!!
            this.currentEventIndex = events.length - 1;
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
    
    joinGameSession(sessionId) {
        return new Promise((resolve, reject) => {
            this.signIn().then((player) => {
                if (typeof player !== 'undefined') {
                    this.currentEventIndex = -1;
                    this.localPlayerIndex = 1;
                    const sessionRef = firebase.firestore().collection('multiplayerGameSessions').doc(sessionId);
                    sessionRef.onSnapshot(session => {
                        console.log("on snap");
                        console.dir(session.data());
                        this.processEvents(session.data().events_from_0);
                    }, error => {
                        console.error('Encountered error while trying to establish observer of multiplayer session', error);
                    });
                    sessionRef.get().then(doc => {
                        if (!doc.exists) {
                            console.log('No such document!');
                            reject('No such multiplayer game session!');
                        } else {
                            let docData = doc.data();
                            docData.players = [doc.data().players[0], this.localPlayer.uid];
                            docData.state = MultiplayerGameSessionState.RUNNING;
                            sessionRef.set(docData);
                            resolve(doc.data());
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

    createGameSession(gameState, playerJoinedAction) {
        return new Promise((resolve, reject) => {
            this.signIn().then((player) => {
                if (typeof player !== 'undefined') {
                    this.currentEventIndex = -1;
                    this.localPlayerIndex = 0;
                    this.localPlayerId = gameState.players[0].id;
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
                                playerJoinedAction({ players: [gameState.players[0], createPlayer("Your mom", PlayerType.HUMAN)] });
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