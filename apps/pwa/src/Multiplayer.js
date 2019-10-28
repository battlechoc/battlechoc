import firebase from '@firebase/app';
import '@firebase/auth';
import '@firebase/database';
import '@firebase/firestore';
import 'firebase/messaging';
import OfflineStore from './OfflineStore';
import { GameActionTypes } from './gameplay/GameActions';
import { AttackType } from './gameplay/GameEntities';
import { Jukebox } from './ui/misc';
import { ServerConfig } from './helper/settings';

const MultiplayerGameSessionState = Object.freeze({
    UNINITIALIZED: 'MultiplayerGameSessionState.Uninitialized',
    PENDING: 'MultiplayerGameSessionState.Pending',
    CREATED: 'MultiplayerGameSessionState.Created',
    RUNNING: 'MultiplayerGameSessionState.Running',
    FINISHED: 'MultiplayerGameSessionState.Finished'
});

const EmptyPlayerStats = Object.freeze({ username: 'Chocnonymous', coins: 0, score: 0, level: {
        'EntityType.CREAM': { hp: 0, area: 0},
        'EntityType.FACTORY': { hp: 0, buildingsPerTurn: 0, cacaoPerTurn: 0 },
        'EntityType.FACTORY_EXTENSION': { hp: 0, buildingsPerTurn: 0 },
        'EntityType.CACAOTREE': { hp: 0, cacaoPerTurn: 0 },
        'EntityType.RUM_TRUFFLE_CANNON': { hp: 0, attack: 0, area: 0 },
        'EntityType.FRUIT_CANNON': { hp: 0, attack: 0, area: 0 },
        'EntityType.SPYING_EASTER_BUNNY': { hp: 0, area: 0, fortune: 0 },
        'EntityType.XMAS_FACTORY': {  hp: 0, area: 0 },
        'EntityType.HOT_CHOCOLATE_BALLISTA': { hp: 0, area: 0, fortune: 0 },
        'EntityType.CHOCOLATE_FOUNTAIN': { hp: 0 }
    }, awards: {}, trackRecord: [] });

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
            notifyPlayerSignedIn: () => { console.warn("calling notifyPlayerSignedIn without beeing initialized"); },
            updateLevel: () => { console.warn("calling updateLevel without beeing initialized"); }
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

    askForNotification(user) {
        const messaging = firebase.messaging();
        messaging.usePublicVapidKey("BJ6zc8pE57SS98ocjLmtHBuaGgDjIirTpAALyYIR_zywwBJbmssDWhbn78WPhoJfjN28htOBI4bwlVzjwHMCqak");

        Notification.requestPermission().then((permission) => {
            if (permission === 'granted') {
                messaging.getToken().then((currentToken) => {
                    if (currentToken) {
                        console.log(currentToken);

                        firebase.firestore().collection('permissions').doc(user.uid).set({'messaging': currentToken}).then(() => {
                            console.log('token stored')
                        }).catch(error => {
                            console.log("could not store permission", error);
                        });
                    } else {
                        console.log('No Instance ID token available. Request permission to generate one.');
                    }
                }).catch((error) => {
                    console.log('An error occurred while retrieving token. ', error);
                });
            } else {
                console.log('Unable to get permission to notify.');
            }
        });

        messaging.onTokenRefresh(() => {
            messaging.getToken().then((refreshedToken) => {
                firebase.firestore().collection('permissions').doc(user.uid).set({'messaging': refreshedToken}).then(() => {
                    console.log('refreshed token stored');
                }).catch(err => {
                    console.log("could not create player entry.", err);
                });
            }).catch((err) => {
                console.log('Unable to retrieve refreshed token ', err);
            });
        });
    }

    authStateChanged(user) {
        if (user) {
            if (typeof this.callbacks.notifyPlayerSignedIn !== 'undefined') {
                this.callbacks.notifyPlayerSignedIn({ email: user.email, uid: user.uid, name: user.displayName, isAnonymous: user.isAnonymous });
            }

            firebase.firestore().collection('players').doc(user.uid).set({}, { merge: true }).then(() => {
                if (!firebase.auth().currentUser.isAnonymous) {
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

            this.askForNotification(user);
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
                    playerStats.score = playerStats.score + this.calculateCoinsFromTrackRecord(gameStats);
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
                            if (typeof newStats.level !== 'undefined') {
                                this.callbacks.updateLevel(newStats.level);
                            }
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
                    console.log(doc.data());
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

    calculateCoinsFromTrackRecord(trackRecord, runningGame=false) {
        if (typeof trackRecord !== 'undefined' && trackRecord.length > 0) {
            return trackRecord.reduce((currentCoins, gameStats) => {
                let coins = gameStats.attacks + gameStats.builtEntities * 2 + gameStats.espionages * 10 + gameStats.moltenFields * 50;
                if (runningGame) {
                    return coins;
                }

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

    async createChallengeMeLink() {
        if (firebase.auth().currentUser) {
            let doc = await firebase.firestore().collection('players').doc(firebase.auth().currentUser.uid).get();
            if (doc.exists) {
                let player = doc.data();
                console.log(player);
                if (typeof player.username !== 'undefined') {
                    console.log('https://battlechoc.com?challenge=' + player.username);
                    return 'https://battlechoc.com?challenge=' + player.username;
                }
            }
        }
    }

    challengePlayer(playerName) {
        console.log('challenge ' + playerName);
        if (typeof playerName !== 'undefined' && firebase.auth().currentUser !== 'undefined') {
            fetch(ServerConfig.baseUrl + '/user/challenge', {
                method: 'post',
                headers: new Headers({
                    'Authorization': 'Basic ' + ServerConfig.auth,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }),
                body: JSON.stringify({ opponent: playerName, playerId: firebase.auth().currentUser.uid })
            }).then(response => response.json()).then(data => console.log(data));
        }
    }

    async getMultiplayerSessions() {
        if (firebase.auth().currentUser) {
            let headers = new Headers({
                'Authorization': 'Basic ' + ServerConfig.auth,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            });

            try {
                let response = await fetch(ServerConfig.baseUrl + '/multiplayer/sessions/' + firebase.auth().currentUser.uid, { headers: headers });
                if (!response.ok) {
                    console.log('error while fetching player sessions ' + response.statusText);
                    return [];
                } else {
                    let games = await response.json();
                    return games.sessions;
                }
            } catch (error) {
                console.log('error while fetching player sessions ' + error.toString());
                return [];
            }
        } else {
            return [];
        }
    }

    sleep (time) {
      return new Promise((resolve) => { setTimeout(() => resolve(), time) });
    }    

    async fetchPlayerProfileData(playerName) {
        let timeout = new Date().getTime() + 5000;
        while (!firebase.auth().currentUser) {
            console.log('try to identify user', new Date().getTime())
            await this.sleep(500);
            if (new Date().getTime() > timeout) {
                throw Error('Timeout while fetching player data');
            }
        }

        try {
            var doc = await firebase.firestore().collection('players').where('username', '==', playerName).get();
        } catch (error) {
            throw Error(error);
        }

        if (doc.size > 0) {
            let player = doc.docs[0].data();
            return { playerId: doc.docs[0].id, playerName: playerName, profileData: player, isYourself: doc.docs[0].id === firebase.auth().currentUser.uid };
        } else {
            throw Error('Could not find player with given name ' + playerName);
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
        if (events.length > this.opponentEventIndex) {
            console.log('process events ', events);
            const newEventIndex = events.length;
            events.splice(0, this.opponentEventIndex);
            events.forEach(action => {
                this.emitAction(action);
            });
            this.opponentEventIndex = newEventIndex;
        }
    }

    relayAction(action) {
        if (typeof this.currentGameSession !== 'undefined' && action.payload.issuer === this.localPlayerId) {
            action.index = this.playerEventIndex;
            this.playerEventIndex += 1;
            console.log('RELAY ACTION ' + this.playerEventIndex);
            action.emitted = firebase.firestore.Timestamp.fromDate(new Date());

            fetch(ServerConfig.baseUrl + '/multiplayer/relay/action', {
                method: 'post',
                headers: new Headers({
                    'Authorization': 'Basic ' + ServerConfig.auth,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }),
                body: JSON.stringify({ event: action, sessionId: this.currentGameSession })
            })
            .then(response => {
                if (!response.ok) {
                    console.error(response.statusText);
                }
            }).catch(error => console.log(error));
        }
    }

    reset() {
        this.localPlayerIndex = 0;
        this.opponentEventIndex = 0;
        this.playerEventIndex = 0;
        this.currentGameSession = undefined;
        if (typeof this.unsubscribeGameSession !== 'undefined') {
            this.unsubscribeGameSession();
            this.unsubscribeGameSession = undefined;
        }
    }

    async enterGameSession(sessionId, gameActions) {
        let reference = firebase.firestore().collection('multiplayerGameSessions').doc(sessionId);
        try {
            var doc = await reference.get();
        } catch (error) {
            console.error('error while fetching the session reference', error.toString());
            return;
        }

        if (!doc.exists) {
            return;
        } else {
            this.gameActions = gameActions;
            let session = doc.data();
            this.localPlayerIndex = session.game.players.findIndex(player => player.id === firebase.auth().currentUser.uid);
            this.unsubscribeGameSession = reference.onSnapshot(doc => {
                let session = doc.data();
                this.sessionData = session;
                this.processEvents(session['events_from_' + (1 - this.localPlayerIndex)]);
            }, error => {
                console.error('encountered error while trying to establish observer of multiplayer session', error.toString());
            });

            this.opponentEventIndex = session['events_from_' + (1 - this.localPlayerIndex)].length;
            this.playerEventIndex = session['events_from_' + this.localPlayerIndex].length;
            this.currentGameSession = doc.id;
            this.localPlayerId = firebase.auth().currentUser.uid;
            return session;
        }
    }
}

const multiplayer = new Multiplayer();

export { multiplayer, MultiplayerGameSessionState, EmptyPlayerStats };