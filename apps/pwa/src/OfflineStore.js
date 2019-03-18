import { openDb } from 'idb';

const dbVersion = 3;
const dbName = 'battclechoc';
const gamestateStoreName = 'gamestate';
const turnHistoryStoreName = 'turn-history';
const settingsStoreName = 'settings';

class OfflineStore {
    static wrapObjectStore(storeName, dbPromise) {
        return {
            async get(key) {
                const db = await dbPromise;
                return db.transaction(storeName).objectStore(storeName).get(key);
            },
            async set(key, val) {
                const db = await dbPromise;
                const tx = db.transaction(storeName, 'readwrite');
                tx.objectStore(storeName).put(val, key);
                return tx.complete;
            },
            async delete(key) {
                const db = await dbPromise;
                const tx = db.transaction(storeName, 'readwrite');
                tx.objectStore(storeName).delete(key);
                return tx.complete;
            },
            async clear() {
                const db = await dbPromise;
                const tx = db.transaction(storeName, 'readwrite');
                tx.objectStore(storeName).clear();
                return tx.complete;
            },
            async keys() {
                const db = await dbPromise;
                return db.transaction(storeName).objectStore(storeName).getAllKeys();
            }
        };
    }

    constructor() {
        this.setup();
    }

    setup() {
        const dbPromise = openDb(dbName, dbVersion, upgradeDB => {
            if (upgradeDB.oldVersion < 1) {
                upgradeDB.createObjectStore(gamestateStoreName);
                upgradeDB.createObjectStore(turnHistoryStoreName);
                upgradeDB.createObjectStore(settingsStoreName);
            } else {
                upgradeDB.deleteObjectStore(gamestateStoreName);
                upgradeDB.createObjectStore(gamestateStoreName);

                upgradeDB.deleteObjectStore(turnHistoryStoreName);
                upgradeDB.createObjectStore(turnHistoryStoreName);

                upgradeDB.deleteObjectStore(settingsStoreName);
                upgradeDB.createObjectStore(settingsStoreName);
            }
        });

        this.gamestateStore = OfflineStore.wrapObjectStore(gamestateStoreName, dbPromise);
        this.turnHistoryStore = OfflineStore.wrapObjectStore(turnHistoryStoreName, dbPromise);
        this.settingsStore = OfflineStore.wrapObjectStore(settingsStoreName, dbPromise);
    }

    async hasGameToResume() {
        let result = false;
        if (typeof this.gamestateStore !== 'undefined') {
            let prom = this.gamestateStore.keys();
            prom.then(keys => {
                result = keys.includes('gamestate');
            });
            await prom;
        }
        return result;
    }

    async getResumeableGame() {
        if (typeof this.gamestateStore !== 'undefined') {
            return this.gamestateStore.get('gamestate');
        } else {
            return undefined;
        }
    }

    saveCurrentGame(gamestate) {
        return this.gamestateStore.set("gamestate", gamestate);
    }
}

const offlineStore = new OfflineStore();

export default offlineStore;