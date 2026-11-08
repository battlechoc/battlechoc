import { createClient } from "../helper/http.js";
import OfflineStore from "../OfflineStore.js";
import logger from "../helper/logger.js";
import { createKeyStore } from "../cardano/keyStore.js";

// Device account: on the first launch the API creates a player and returns a refresh token,
// which stays in IndexedDB. Short-lived access tokens are fetched with it when needed. Without
// a connection the game keeps working offline; the account is created on a later start.

import { apiUrl } from "./apiUrl.js";

const liveUrl = apiUrl.replace(/^http/, "ws").replace(/\/$/, "") + "/live";
const ACCOUNT_KEY = "account";
const EXPIRY_MARGIN_MS = 30000;

const client = createClient({ baseURL: apiUrl, timeout: 15000 });

class Account {
  constructor() {
    this.playerId = undefined;
    this.refreshToken = undefined;
    this.accessToken = undefined;
    this.expiresAt = 0;
    this.pending = undefined;
    // called once a session ended because its key was removed (Multiplayer shows why)
    this.onSessionEnded = undefined;
  }

  isReady() {
    return typeof this.playerId !== "undefined";
  }

  remember({ playerId, accessToken, expiresIn }) {
    this.playerId = playerId;
    this.accessToken = accessToken;
    this.expiresAt = Date.now() + expiresIn * 1000;
  }

  async create() {
    const { data } = await client.post("/accounts");
    this.refreshToken = data.refreshToken;
    await OfflineStore.playerStore.set(ACCOUNT_KEY, {
      playerId: data.playerId,
      refreshToken: data.refreshToken,
    });
    this.remember(data);
  }

  // takes over a session the server gave for a key ("I already have an account"): this device
  // is that player from now on
  async adopt({ playerId, refreshToken, accessToken, expiresIn }) {
    await OfflineStore.playerStore.set(ACCOUNT_KEY, { playerId, refreshToken });
    this.refreshToken = refreshToken;
    this.remember({ playerId, accessToken, expiresIn });
  }

  async refresh() {
    try {
      const { data } = await client.post("/accounts/token", {
        refreshToken: this.refreshToken,
      });
      this.remember(data);
    } catch (error) {
      if (error.response && error.response.status === 401) {
        const ended =
          error.response.data && error.response.data.error === "session ended";
        if (ended) {
          // the key that signed this device in was removed (on another device): its words are
          // no use here any more, so the game forgets them before it starts anew
          logger.warn("the session ended with its key, creating a new account");
          await createKeyStore(OfflineStore.playerStore)
            .clear()
            .catch((failure) =>
              logger.warn("could not forget the removed key", failure)
            );
        } else {
          // the account is gone on the server (e.g. a reset backend): start a new one
          logger.warn("stored account was rejected, creating a new one");
        }
        await this.create();
        if (ended && typeof this.onSessionEnded === "function") {
          this.onSessionEnded();
        }
      } else {
        throw error;
      }
    }
  }

  // ends another session on the server (plan 3: a wallet's session the player did not keep);
  // the device's own account is not touched
  async logout(refreshToken) {
    await client.post("/accounts/logout", { refreshToken });
  }

  // loads or creates the account; resolves once an access token is available
  ensure() {
    if (typeof this.pending === "undefined") {
      this.pending = (async () => {
        const stored = await OfflineStore.playerStore.get(ACCOUNT_KEY);
        if (stored && typeof stored.refreshToken === "string") {
          this.refreshToken = stored.refreshToken;
          this.playerId = stored.playerId;
          await this.refresh();
        } else {
          await this.create();
        }
      })().finally(() => {
        this.pending = undefined;
      });
    }
    return this.pending;
  }

  async token() {
    if (
      typeof this.accessToken === "undefined" ||
      Date.now() > this.expiresAt - EXPIRY_MARGIN_MS
    ) {
      await this.ensure();
    }
    return this.accessToken;
  }
}

const account = new Account();

export { account, apiUrl, liveUrl };
