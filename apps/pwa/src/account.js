import axios from "axios";
import OfflineStore from "./OfflineStore";
import logger from "./helper/logger";

// Device account: on the first launch the API creates a player and returns a refresh token,
// which stays in IndexedDB. Short-lived access tokens are fetched with it when needed. Without
// a connection the game keeps working offline; the account is created on a later start.

const apiUrl = import.meta.env.VITE_API_URL || "https://api.battlechoc.com";
const ACCOUNT_KEY = "account";
const EXPIRY_MARGIN_MS = 30000;

const client = axios.create({ baseURL: apiUrl, timeout: 15000 });

class Account {
  constructor() {
    this.playerId = undefined;
    this.refreshToken = undefined;
    this.accessToken = undefined;
    this.expiresAt = 0;
    this.pending = undefined;
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

  async refresh() {
    try {
      const { data } = await client.post("/accounts/token", {
        refreshToken: this.refreshToken,
      });
      this.remember(data);
    } catch (error) {
      if (error.response && error.response.status === 401) {
        // the account is gone on the server (e.g. a reset backend): start a new one
        logger.warn("stored account was rejected, creating a new one");
        await this.create();
      } else {
        throw error;
      }
    }
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
    if (typeof this.accessToken === "undefined" || Date.now() > this.expiresAt - EXPIRY_MARGIN_MS) {
      await this.ensure();
    }
    return this.accessToken;
  }
}

const account = new Account();

export { account, apiUrl };
