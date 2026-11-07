import { openDB } from "idb";

const dbVersion = 6;
const dbName = "battlechoc";
const gamestateStoreName = "gamestate";
// created by version 1 for the turn-based game, unused since
const turnHistoryStoreName = "turn-history";
const settingsStoreName = "settings";
const playerStoreName = "player";

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
      },
    });

    this.gamestateStore = OfflineStore.wrapObjectStore(
      gamestateStoreName,
      dbPromise
    );
    this.settingsStore = OfflineStore.wrapObjectStore(
      settingsStoreName,
      dbPromise
    );
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
      },
    };
  }

  async hasGameToResume() {
    return (await this.gamestateStore.keys()).includes("realtime-match");
  }

  async getRealtimeMatch() {
    return await this.gamestateStore.get("realtime-match");
  }

  async saveRealtimeMatch(saved) {
    return await this.gamestateStore.set("realtime-match", saved);
  }

  async clearRealtimeMatch() {
    return await this.gamestateStore.delete("realtime-match");
  }
}

const offlineStore = new OfflineStore();
export default offlineStore;
