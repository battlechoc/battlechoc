import { openDB } from 'idb';

const dbVersion = 6;
const dbName = 'battlechoc';
const gamestateStoreName = 'gamestate';
const turnHistoryStoreName = 'turn-history';
const settingsStoreName = 'settings';
const playerStoreName = 'player';

class OfflineStore {
    constructor() {
        const dbPromise = openDB(dbName, dbVersion, {
            upgrade(db, oldVersion) {
                if (oldVersion < 1) {
                    db.createObjectStore(gamestateStoreName);
                    db.createObjectStore(turnHistoryStoreName);
                    db.createObjectStore(settingsStoreName);
                }
                if (oldVersion < 6) {
                    db.createObjectStore(playerStoreName);
                }
            }
        });

        this.gamestateStore = OfflineStore.wrapObjectStore(gamestateStoreName, dbPromise);
        this.turnHistoryStore = OfflineStore.wrapObjectStore(turnHistoryStoreName, dbPromise);
        this.settingsStore = OfflineStore.wrapObjectStore(settingsStoreName, dbPromise);
        this.playerStore = OfflineStore.wrapObjectStore(playerStoreName, dbPromise);
    }

    static wrapObjectStore(storeName, dbPromise) {
        return {
            async get(key) {
                return (await dbPromise).get(storeName, key);
            },
            async set(key, val) {
                return (await dbPromise).put(storeName, val, key);
            },
            async delete(key) {
                return (await dbPromise).delete(storeName, key);
            },
            async clear() {
                return (await dbPromise).clear(storeName);
            },
            async keys() {
                return (await dbPromise).getAllKeys(storeName);
            }
        };
    }

    async hasGameToResume() {
        return (await this.gamestateStore.keys()).includes('gamestate');
    }

    async getResumeableGame() {
        return await this.gamestateStore.get('gamestate');
    }

    async saveCurrentGame(gamestate) {
        return await this.gamestateStore.set('gamestate', gamestate);
    }
}

const offlineStore = new OfflineStore();
export default offlineStore;