import { openDb, deleteDb } from 'idb';

const dbVersion = 3;
const dbName = 'battclechoc';
const gamestateStoreName = 'gamestate';
const turnHistoryStoreName = 'turn-history';
const settingsStoreName = 'settings';
const setPostfix = '_set';
const getPostfix = '_get';
const deletePostfix = '_delete';
const clearPostfix = '_clear';
const keysPostfix = '_keys';

class OfflineStore {
    static wrapObjectStore(storeName, dbPromise) {
        return {
            async get(key) {
                const db = await dbPromise;
                return db.transaction(storeName + getPostfix).objectStore(storeName).get(key);
            },
            async set(key, val) {
                const db = await dbPromise;
                const tx = db.transaction(storeName + setPostfix, 'readwrite');
                tx.objectStore(storeName).put(val, key);
                return tx.complete;
            },
            async delete(key) {
                const db = await dbPromise;
                const tx = db.transaction(storeName + deletePostfix, 'readwrite');
                tx.objectStore(storeName).delete(key);
                return tx.complete;
            },
            async clear() {
                const db = await dbPromise;
                const tx = db.transaction(storeName + clearPostfix, 'readwrite');
                tx.objectStore(storeName).clear();
                return tx.complete;
            },
            async keys() {
                const db = await dbPromise;
                return db.transaction(storeName + keysPostfix).objectStore(storeName).getAllKeys();
            }
        };
    }

    constructor() {
        this.setup();
    }

    async setup() {
        const dbPromise = openDb(dbName, dbVersion, upgradeDB => {
            upgradeDB.deleteObjectStore(gamestateStoreName);
            upgradeDB.createObjectStore(gamestateStoreName);
            upgradeDB.deleteObjectStore(turnHistoryStoreName);
            upgradeDB.createObjectStore(turnHistoryStoreName);
            upgradeDB.deleteObjectStore(settingsStoreName);
            upgradeDB.createObjectStore(settingsStoreName);
        });

        this.gamestateStore = OfflineStore.wrapObjectStore(gamestateStoreName, dbPromise);
        this.turnHistoryStore = OfflineStore.wrapObjectStore(turnHistoryStoreName, dbPromise);
        this.settingsStore = OfflineStore.wrapObjectStore(settingsStoreName, dbPromise);
    }
}

const offlineStore = new OfflineStore();

export default offlineStore;