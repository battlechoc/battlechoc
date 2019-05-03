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
                    this.localPlayer = user.uid;
                    const userStatusDatabaseRef = firebase.database().ref('/status/' + this.localPlayer);
                    const userStatusFirestoreRef = firebase.firestore().doc('/status/' + this.localPlayer);

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
        firebase.auth().signInAnonymously().catch(function (error) {
            console.log(error);
        });
    }

    createGameSession() {
        firebase.firestore().collection('multiplayerGameSessions').add({
            state: MultiplayerGameSessionState.CREATED,
            players: [this.localPlayer, null],
            last_changed: firebase.firestore.FieldValue.serverTimestamp(),
        }).then(ref => {
            this.currentGameSession = ref.id;
            console.dir(ref);
            console.log(ref.path);
            console.log('Added document with ID: ', ref.id);
        });
    }
}

const multiplayer = new Multiplayer();

export { multiplayer, MultiplayerGameSessionState };