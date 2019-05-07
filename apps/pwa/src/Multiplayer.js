import * as firebase from 'firebase';

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
        this.localPlayer = undefined;

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

    joinGameSession(sessionId) {
        return new Promise((resolve, reject) => {
            this.signIn().then((player) => {
                if (typeof player !== 'undefined') {
                    const sessionRef = firebase.firestore().collection('multiplayerGameSessions').doc(sessionId);
                    sessionRef.get().then(doc => {
                        if (!doc.exists) {
                            console.log('No such document!');
                            reject('No such multiplayer game session!');
                        } else {
                            let docData = doc.data();
                            docData.players = [doc.data().players[0], this.localPlayer.uid];
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

    createGameSession(gameState) {
        return new Promise((resolve, reject) => {
            this.signIn().then((player) => {
                if (typeof player !== 'undefined') {
                    console.dir(player);
                    firebase.firestore().collection('multiplayerGameSessions').add({
                        state: MultiplayerGameSessionState.CREATED,
                        players: [player.uid, null],
                        game: gameState,
                        last_changed: firebase.firestore.FieldValue.serverTimestamp(),
                    }).then(ref => {
                        console.log("game created");
                        this.currentGameSession = ref.id;
                        console.log(this.currentGameSession);
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