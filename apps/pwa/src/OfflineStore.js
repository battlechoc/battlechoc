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

    this.dbPromise = dbPromise;
    // set by eraseAll: the page is about to load anew, nothing it still saves may come back
    this.erased = false;
    const erased = () => this.erased;

    this.gamestateStore = OfflineStore.wrapObjectStore(
      gamestateStoreName,
      dbPromise,
      erased
    );
    this.settingsStore = OfflineStore.wrapObjectStore(
      settingsStoreName,
      dbPromise,
      erased
    );
    this.playerStore = OfflineStore.wrapObjectStore(
      playerStoreName,
      dbPromise,
      erased
    );
  }

  // the writes do nothing once the database is erased
  static wrapObjectStore(storeName, dbPromise, erased) {
    return {
      async get(key) {
        return (await dbPromise).get(storeName, key);
      },
      async set(key, val) {
        if (erased()) {
          return undefined;
        }
        return (await dbPromise).put(storeName, val, key);
      },
      // like set, but refuses a key that exists (ConstraintError), atomically, also across tabs
      async add(key, val) {
        if (erased()) {
          return undefined;
        }
        return (await dbPromise).add(storeName, val, key);
      },
      async delete(key) {
        if (erased()) {
          return undefined;
        }
        return (await dbPromise).delete(storeName, key);
      },
      async clear() {
        if (erased()) {
          return undefined;
        }
        return (await dbPromise).clear(storeName);
      },
      async keys() {
        return (await dbPromise).getAllKeys(storeName);
      },
    };
  }

  // "Reset battlechoc" (src/reset.js): empties every store in one transaction (the progress, the
  // settings, the account and the recovery words on this device); the page loads anew right
  // after, and until then no write gets through. Emptied, not deleted: deleting the database
  // would wait for every open connection, this page's and other tabs'.
  async eraseAll() {
    this.erased = true;
    const db = await this.dbPromise;
    const names = [...db.objectStoreNames];
    const transaction = db.transaction(names, "readwrite");
    await Promise.all([
      ...names.map((name) => transaction.objectStore(name).clear()),
      transaction.done,
    ]);
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
