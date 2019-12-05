import firebase from '@firebase/app';
import '@firebase/auth';
import '@firebase/database';
import '@firebase/firestore';
import 'firebase/messaging';
import OfflineStore from './OfflineStore';
import { GameActionTypes } from './gameplay/GameActions';
import { AttackType } from './gameplay/GameEntities';
import { Jukebox } from './ui/misc';
import { ServerRequest } from './helper/settings';
import logger from './helper/logger';

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
            updatePlayerStats: () => logger.warn("calling updatePlayerStats without beeing initialized"),
            notifyPlayerSignedIn: () => logger.warn("calling notifyPlayerSignedIn without beeing initialized"),
            updateMultiplayerSessions: () => logger.warn("calling updateMultiplayerSessions without beeing initialized"),
            loadFriendsList: () => logger.warn("calling loadFriendsList without beeing initialized"),
            setPlayerRank: () => logger.warn("calling setPlayerRank without beeing initialized")
        };

        try {
            firebase.initializeApp(firebaseConfig);
            firebase.firestore().enablePersistence()
            .catch(err => logger.info("could not enable offline persistence of firestore.", err));
            this.messaging = firebase.messaging();
            this.messaging.usePublicVapidKey("BJ6zc8pE57SS98ocjLmtHBuaGgDjIirTpAALyYIR_zywwBJbmssDWhbn78WPhoJfjN28htOBI4bwlVzjwHMCqak");
            firebase.auth().onAuthStateChanged((user) => {
                this.authStateChanged(user);
            });
        } catch (error) {
            logger.info(error);
        }
    }

    askForNotification(user) {
        Notification.requestPermission().then((permission) => {
            if (permission === 'granted') {
                this.messaging.getToken().then((currentToken) => {
                    if (currentToken) {
                        let ref = firebase.firestore().collection('permissions').doc(user.uid);
                        ref.set({ messaging: firebase.firestore.FieldValue.arrayUnion(currentToken) }, {merge: true} );
                    } else {
                        logger.info('No Instance ID token available. Request permission to generate one.');
                    }
                }).catch((error) => {
                    logger.info('An error occurred while retrieving token. ', error);
                });
            
                this.messaging.onTokenRefresh(() => {
                    this.messaging.getToken().then((refreshedToken) => {
                        let ref = firebase.firestore().collection('permissions').doc(user.uid);
                        ref.set({ messaging: firebase.firestore.FieldValue.arrayUnion(refreshedToken) }, {merge: true} );
                    }).catch((err) => {
                        logger.info('Unable to retrieve refreshed token ', err);
                    });
                });
            } else {
                logger.info('Unable to get permission to notify.');
            }
        });
    }

    async authStateChanged(user) {
        if (user) {
            if (typeof this.callbacks.notifyPlayerSignedIn !== 'undefined') {
                this.callbacks.notifyPlayerSignedIn({ email: user.email, uid: user.uid, name: user.displayName, isAnonymous: user.isAnonymous });
            }

            firebase.firestore().collection('players').doc(user.uid).set({}, { merge: true }).then(() => {
                this.mergePlayerStats();
            }).catch(err => {
                logger.info("could not create player entry.", err);
            });

            this.localPlayer = user;
            this.askForNotification(user);
            if (window.navigator.onLine) {
                this.getMultiplayerSessions();
                this.fetchFriendsList();
                this.computeRank();
            }
        } else {
            logger.info('try to signin');
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

    pushGameStats(gameStats) {
        if (firebase.auth().currentUser) {
            const playerInfosRef = firebase.firestore().collection('players').doc(firebase.auth().currentUser.uid);
            playerInfosRef.get().then(doc => {
                if (!doc.exists) {
                    logger.warn('No such document!');
                } else {
                    let playerStats = doc.data();
                    if (typeof playerStats.trackRecord === 'undefined') {
                        playerStats.trackRecord = [];
                    }
                    playerStats.trackRecord.push(...gameStats);                    
                    let calculatedCoins = this.calculateCoinsFromTrackRecord(gameStats);
                    playerStats.coins = playerStats.coins + calculatedCoins;
                    playerStats.score = isNaN(playerStats.score) ? calculatedCoins : playerStats.score + calculatedCoins; 
                    playerInfosRef.update(playerStats).catch(err => logger.warn("could not update player track record.", err));
                    this.callbacks.updatePlayerStats(playerStats);
                }
            }).catch(err => logger.warn("could not retrieve player track record.", err));
        } else {
            OfflineStore.playerStore.get('stats').then(playerStats => {
                if (typeof playerStats.trackRecord === 'undefined') {
                    playerStats.trackRecord = [];
                }
                playerStats.trackRecord.push(...gameStats);
                let calculatedCoins = this.calculateCoinsFromTrackRecord(gameStats);
                playerStats.coins = playerStats.coins + calculatedCoins;
                playerStats.score = isNaN(playerStats.score) ? calculatedCoins : playerStats.score + calculatedCoins; 
                try {
                    OfflineStore.playerStore.set('stats', playerStats)
                } catch (error) {
                    logger.warn(error);
                }
                this.callbacks.updatePlayerStats(playerStats);
            }).catch(err => logger.warn("could not retrieve offline player stats", err));
        }
    }

    async mergePlayerStats() {
        if (firebase.auth().currentUser) {
            try {
                var offlineAccount = await OfflineStore.playerStore.get('stats');
            } catch (error) {
                logger.warn('failed to get player infos from offline store', error);
                return this.fetchPlayerStats();
            }

            if (typeof offlineAccount === 'undefined') {
                this.fetchPlayerStats();
            } else {
                let ref = firebase.firestore().collection('players').doc(firebase.auth().currentUser.uid);
                let doc = await ref.get();
                if (!doc.exists) {
                    try {
                        firebase.firestore().collection('players').doc(firebase.auth().currentUser.uid).set(offlineAccount);
                    } catch(error) { 
                        logger.info('could not store stats for player', error); 
                    }
                } else {
                    let onlineAccount = doc.data();
                    if (typeof onlineAccount.trackRecord === 'undefined') {
                        onlineAccount.trackRecord = [];
                    }
                    if (typeof onlineAccount.coins === 'undefined') {
                        onlineAccount.coins = 0;
                    }

                    let onlineRecords = onlineAccount.trackRecord.map(record => record.id);
                    offlineAccount.trackRecord.forEach(record => {
                        if (!onlineRecords.includes(record.id)) {
                            onlineAccount.trackRecord.push(record);
                            onlineAccount.coins += this.calculateCoinsFromTrackRecord([record]);
                            onlineAccount.score += this.calculateCoinsFromTrackRecord([record]);
                        }
                    });

                    ref.update(onlineAccount).catch(error => logger.warn("could not update player track record.", error));
                    OfflineStore.playerStore.set('stats', onlineAccount).catch(error => logger.warn("could not set new player stats in idb.", error));
                    
                    this.callbacks.updatePlayerStats(onlineAccount);
                }
            }
        }
    }

    async fetchPlayerStats() {
        if (firebase.auth().currentUser) {
            let ref = firebase.firestore().collection('players').doc(firebase.auth().currentUser.uid);
            
            try {
                var doc = await ref.get();
            } catch (error) {
                return logger.warn(error);
            }

            if (doc.exists) {
                this.callbacks.updatePlayerStats(doc.data());
            } else {
                try {
                    await ref.set(EmptyPlayerStats);
                    this.callbacks.updatePlayerStats(EmptyPlayerStats);
                } catch (error) { 
                    logger.info('Could not store coins for player', error);
                }
            }
        } else {
            try {
                var offlineAccount = await OfflineStore.playerStore.get('stats');
            } catch (error) {
                OfflineStore.playerStore.set('stats', EmptyPlayerStats);
                this.callbacks.updatePlayerStats(EmptyPlayerStats);
                return logger.warn(error);
            }

            if (typeof offlineAccount === 'undefined') {
                OfflineStore.playerStore.set('stats', EmptyPlayerStats);
                this.callbacks.updatePlayerStats(EmptyPlayerStats);
            } else {
                this.callbacks.updatePlayerStats(offlineAccount);
            }
        }
    }

    calculateCoinsFromTrackRecord(trackRecord, runningGame=false) {
        if (typeof trackRecord !== 'undefined' && trackRecord.length > 0) {
            return trackRecord.reduce((currentCoins, gameStats) => {
                let coins = gameStats.attacks + gameStats.builtEntities * 2 + gameStats.espionages * 10 + gameStats.moltenFields * 50;
                if (runningGame) {
                    return coins;
                }

                if (typeof gameStats.winners !== 'undefined') {
                    if (gameStats.winners.length === 1) {
                        if (!this.isLocalPlayer(gameStats.winners[0].idx)) {
                            coins = 0;
                        }
                    } else if (gameStats.winners.length === 2) {
                        coins = Math.floor(coins / 2);
                    }
                } else {
                    if (gameStats.lost) {
                        coins = 0;
                    }
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
            logger.info("could not sign out because some error happened.", error);
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
                if (typeof player.username !== 'undefined') {
                    return 'https://battlechoc.com/' + player.username;
                }
            }
        }
    }

    async challengePlayer(playerName) {
        if (typeof playerName !== 'undefined' && firebase.auth().currentUser !== 'undefined') {
            try {
                await ServerRequest('post', '/user/challenge', { opponent: playerName });
            } catch(error) {
                logger.warn(error)
            }
        }
    }

    async getMultiplayerSessions() {
        if (firebase.auth().currentUser) {
            try {
                let response = await ServerRequest('get', '/multiplayer/sessions');
                this.callbacks.updateMultiplayerSessions(response.data.sessions);
            } catch (error) {
                logger.warn('error while fetching player sessions ' + error);
            }
        } else {
            logger.warn('user not logged in');
        }
    }

    async fetchFriendsList() {
        if (firebase.auth().currentUser) {
            try {
                let response = await ServerRequest('get', '/user/friends');
                this.callbacks.loadFriendsList(response.data);
                return response.data;
            } catch (error) {
                logger.warn('error while fetching friends ' + error);
            }
        } else {
            logger.warn('user not logged in');
        }        
    }

    async computeRank() {
        if (firebase.auth().currentUser) {
            try {
                let data = (await ServerRequest('get', '/rank')).data;
                this.callbacks.setPlayerRank(data.ranking);
            } catch {
                this.callbacks.setPlayerRank('Offline');
            }            
        } else {
            this.callbacks.setPlayerRank('Offline');
        }
    }

    async removeFriend(friend) {
        if (firebase.auth().currentUser) {
            try {
                await ServerRequest('delete', '/user/friend', { friend: friend });
                await this.fetchFriendsList();
            } catch (error) {
                logger.warn('error while removing friend ' + error);
            }
        } else {
            logger.warn('user not logged in');
        }
    }

    async addFriend(friend) {
        if (firebase.auth().currentUser) {
            try {
                await ServerRequest('post', '/user/friend/', { friend: friend });
                await this.fetchFriendsList();
            } catch (error) {
                logger.warn('error while adding friend ' + error);
            }
        } else {
            logger.warn('user not logged in');
        }
    }

    async findUsers(query) {
        return (await ServerRequest('get', '/query/user/' + query)).data;
    }

    async findRandomPlayer() {
        return (await ServerRequest('get', '/random/opponent')).data;
    }

    async surrenderGame(sessionId) {
        await ServerRequest('post', '/surrender', { sessionId: sessionId });
    }

    signInAnonymouslyIfNotAlreadySignedIn() {
        return new Promise((resolve, reject) => {
            if (firebase.auth().currentUser) {
                logger.info("already signed in. will not sign in again as anonymous");
                resolve(firebase.auth().currentUser);
            } else {
                logger.info("not signed in. trying to sign in anonymously");
                firebase.auth().signInAnonymously().then(signInResult => {
                    logger.info("done signing in. logged in anonymously. " + firebase.auth().currentUser.uid);
                    logger.info(signInResult);
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
            case GameActionTypes.endGame:
                this.gameActions.endGame(action.payload).catch(error => logger.info(error));
                break;
            default:
                logger.warn('invalid action type shall be emitted. check implementation. call the coders.');
        }
    }

    processEvents(events) {
        if (events.length > this.opponentEventIndex) {
            const newEventIndex = events.length;
            events.splice(0, this.opponentEventIndex);
            events.forEach(action => {
                this.emitAction(action);
            });
            this.opponentEventIndex = newEventIndex;
        }
    }

    relayAction (action) {
        if (typeof this.currentGameSession !== 'undefined' && action.payload.issuer === this.localPlayerId) {
            action.index = this.playerEventIndex;
            this.playerEventIndex += 1;
            action.emitted = firebase.firestore.Timestamp.fromDate(new Date());

            ServerRequest('post', '/multiplayer/relay/action', { event: action, sessionId: this.currentGameSession })
            .catch(error => logger.warn(error));
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
            logger.error('error while fetching the session reference', error.toString());
            return;
        }

        if (!doc.exists) {
            return;
        } else {
            this.gameActions = gameActions;
            let session = doc.data();
            if (session.game.isRunning) {
                this.localPlayerIndex = session.game.players.findIndex(player => player.id === firebase.auth().currentUser.uid);
                this.unsubscribeGameSession = reference.onSnapshot(doc => {
                    let session = doc.data();
                    this.sessionData = session;
                    this.processEvents(session['events_from_' + (1 - this.localPlayerIndex)]);
                }, error => {
                    logger.error('encountered error while trying to establish observer of multiplayer session', error.toString());
                });

                this.opponentEventIndex = session['events_from_' + (1 - this.localPlayerIndex)].length;
                this.playerEventIndex = session['events_from_' + this.localPlayerIndex].length;
                this.currentGameSession = doc.id;
                this.localPlayerId = firebase.auth().currentUser.uid;
                return session;
            } else {
                throw ReferenceError('session is not running anymore');
            }
        }
    }
}

const multiplayer = new Multiplayer();

export { multiplayer, MultiplayerGameSessionState, EmptyPlayerStats };