import { live } from "@battlechoc/battlechoc-shared-functions";
import { account, liveUrl } from "../account";
import logger from "../helper/logger";

const { ClientMessage, ServerMessage, CloseCode, ClockSync, LiveDefaults } =
  live;

const RECONNECT_DELAYS_MS = [500, 1000, 2000, 5000, 10000];

/**
 * The WebSocket to the live match service, shared by the lobby and the remote match host.
 * It authenticates with the device account, keeps the clock in sync with pings and
 * reconnects with a backoff while anyone holds it open (acquire/release).
 */
class LiveConnection {
  constructor() {
    this.ws = undefined;
    this.status = "offline";
    this.clock = new ClockSync({ now: () => performance.now() });
    this.listeners = new Map();
    this.holders = 0;
    this.attempt = 0;
    this.pingTimer = undefined;
    this.reconnectTimer = undefined;
    this.welcome = undefined;
    this.nextPingId = 1;
  }

  on(type, listener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type).add(listener);
    return () => this.listeners.get(type).delete(listener);
  }

  emit(type, message) {
    (this.listeners.get(type) || new Set()).forEach((listener) => {
      try {
        listener(message);
      } catch (error) {
        logger.warn(error);
      }
    });
  }

  setStatus(status) {
    if (this.status !== status) {
      this.status = status;
      this.emit("status", status);
    }
  }

  /** Keeps the connection open until release(); resolves once the server welcomed us. */
  acquire() {
    this.holders += 1;
    return this.open();
  }

  release() {
    this.holders = Math.max(0, this.holders - 1);
    if (this.holders === 0) {
      this.close();
    }
  }

  open() {
    if (this.status === "online") {
      return Promise.resolve(this.welcome);
    }
    if (typeof this.opening === "undefined") {
      this.opening = this.connect().finally(() => {
        this.opening = undefined;
      });
    }
    return this.opening;
  }

  async connect() {
    clearTimeout(this.reconnectTimer);
    this.setStatus("connecting");
    const token = await account.token();
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(liveUrl);
      this.ws = ws;
      let welcomed = false;
      ws.onopen = () => ws.send(JSON.stringify({ type: ClientMessage.HELLO, token }));
      ws.onmessage = (event) => {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
        if (message.type === ServerMessage.WELCOME) {
          welcomed = true;
          this.attempt = 0;
          this.welcome = message;
          this.clock.observe(message.serverT);
          this.setStatus("online");
          this.startPings();
          resolve(message);
        } else if (message.type === ServerMessage.PONG) {
          this.clock.sample(message.clientT, message.serverT);
        } else if (typeof message.serverT === "number") {
          this.clock.observe(message.serverT);
        }
        this.emit(message.type, message);
      };
      ws.onclose = (event) => {
        if (this.ws === ws) {
          this.ws = undefined;
          this.stopPings();
          this.setStatus("offline");
          this.emit("closed", { code: event.code });
          if (!welcomed) {
            reject(new Error(`live connection closed (${event.code})`));
          }
          // another tab or device took over this account: do not fight over it. A hello that
          // came too late (HELLO_TIMEOUT: the page was busy loading) is retried like a lost link.
          if (this.holders > 0 && event.code !== CloseCode.REPLACED && event.code !== CloseCode.UNAUTHORIZED) {
            this.scheduleReconnect();
          }
        }
      };
      ws.onerror = () => logger.info("live connection error");
    });
  }

  scheduleReconnect() {
    const delay = RECONNECT_DELAYS_MS[Math.min(this.attempt, RECONNECT_DELAYS_MS.length - 1)];
    this.attempt += 1;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (this.holders > 0) {
        this.open().catch((error) => logger.info("live reconnect failed", error));
      }
    }, delay);
  }

  startPings() {
    this.stopPings();
    const ping = () => this.send({ type: ClientMessage.PING, id: this.nextPingId++, clientT: performance.now() });
    // a quick burst for a first good sample, then the regular heartbeat
    ping();
    setTimeout(ping, 300);
    setTimeout(ping, 700);
    this.pingTimer = setInterval(ping, LiveDefaults.pingIntervalMs);
  }

  stopPings() {
    clearInterval(this.pingTimer);
    this.pingTimer = undefined;
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  close() {
    clearTimeout(this.reconnectTimer);
    this.stopPings();
    if (this.ws) {
      const ws = this.ws;
      this.ws = undefined;
      ws.close();
    }
    this.setStatus("offline");
  }
}

const liveConnection = new LiveConnection();

export { liveConnection };
