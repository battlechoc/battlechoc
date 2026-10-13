import { BattlechocError, live } from "@battlechoc/battlechoc-shared-functions";
import {
  matchUpdated,
  matchAwarded,
  matchHosted,
  pendingChanged,
  matchResultReceived,
} from "./matchSlice";
import { presenceChanged } from "./liveSlice";
import logger from "../helper/logger";

const { ClientMessage, ServerMessage, LiveError } = live;

const ACK_TIMEOUT_MS = 10000;

// a rejected online action; a BattlechocError like the engine's own, so the UI treats both alike
class RemoteActionError extends BattlechocError {
  constructor(error) {
    super(error && error.message ? error.message : error && error.code);
    this.code = error && error.code;
    this.ruleName = error && error.name;
  }
}

/**
 * Plays an online match hosted by the server, behind the same interface as LocalMatchHost:
 * submit() sends an intent and settles with its ack, now() is the synced match time, and
 * every pushed view goes to Redux. Pause does not exist online.
 */
class RemoteMatchHost {
  constructor({ dispatch, connection, matchId, playerIndex, epoch, onEnded }) {
    this.dispatch = dispatch;
    this.connection = connection;
    this.matchId = matchId;
    this.playerIndex = playerIndex;
    this.epoch = epoch;
    this.onEnded = onEnded || (() => {});
    this.online = true;
    this.lastSeq = -1;
    this.lastT = 0;
    this.phase = undefined;
    this.pending = new Map();
    this.nextUid = 1;
    this.endNotified = false;
    this.stopped = false;
    this.unsubscribe = [
      connection.on(ServerMessage.VIEW, (message) => this.receiveView(message)),
      connection.on(ServerMessage.ACK, (message) => this.receiveAck(message)),
      connection.on(ServerMessage.MATCH, (message) => {
        if (message.matchId === this.matchId) {
          this.epoch = message.epoch;
        }
      }),
      connection.on(ServerMessage.PRESENCE, (message) => {
        if (message.matchId === this.matchId) {
          dispatch(presenceChanged({ online: message.online, forfeitAt: message.forfeitAt }));
        }
      }),
      connection.on(ServerMessage.RESULT, (message) => this.receiveResult(message)),
      // after a reconnect: back into the match, with the events we missed
      connection.on(ServerMessage.WELCOME, () => this.join()),
      connection.on("closed", () => this.failPending()),
    ];
    dispatch(matchHosted({ online: true }));
    dispatch(presenceChanged(null));
    this.join();
  }

  join() {
    if (!this.stopped) {
      this.connection.send({
        type: ClientMessage.MATCH_JOIN,
        matchId: this.matchId,
        ...(this.lastSeq >= 0 ? { lastSeq: this.lastSeq } : {}),
      });
    }
  }

  receiveView(message) {
    if (message.matchId !== this.matchId || this.stopped) {
      return;
    }
    this.epoch = message.epoch;
    const { events, ...view } = message.view;
    if (events.length > 0) {
      this.lastSeq = events[events.length - 1].seq;
    }
    this.lastT = view.t;
    this.phase = view.phase;
    this.dispatch(matchUpdated({ view: { ...view, events: [] }, events }));
  }

  receiveAck(message) {
    const entry = message.matchId === this.matchId ? this.pending.get(message.uid) : undefined;
    if (!entry) {
      return;
    }
    clearTimeout(entry.timer);
    this.pending.delete(message.uid);
    this.dispatch(pendingChanged(this.pending.size));
    if (message.ok) {
      entry.resolve([]);
    } else {
      entry.reject(new RemoteActionError(message.error));
    }
  }

  receiveResult(message) {
    if (message.matchId !== this.matchId || this.endNotified) {
      return;
    }
    this.endNotified = true;
    const result = { ...message.result, online: true };
    this.dispatch(matchAwarded(result.awards));
    this.dispatch(matchResultReceived(result));
    this.onEnded(result);
  }

  failPending() {
    this.pending.forEach((entry) => {
      clearTimeout(entry.timer);
      entry.reject(new RemoteActionError({ code: LiveError.ACTION_REJECTED, message: "connection lost" }));
    });
    this.pending.clear();
    this.dispatch(pendingChanged(0));
  }

  now() {
    const synced = this.connection.clock.matchTime(this.epoch);
    return Math.max(this.lastT, synced);
  }

  /** Sends an action of the local player; resolves on the server's ack, rejects with the reason. */
  submit(type, payload = {}) {
    if (this.stopped) {
      return Promise.reject(new Error("No running match"));
    }
    const uid = `${Date.now().toString(36)}-${this.nextUid++}`;
    return new Promise((resolve, reject) => {
      const sent = this.connection.send({
        type: ClientMessage.INTENT,
        matchId: this.matchId,
        uid,
        action: { type, payload },
      });
      if (!sent) {
        reject(new RemoteActionError({ code: LiveError.ACTION_REJECTED, message: "offline" }));
        return;
      }
      const timer = setTimeout(() => {
        this.pending.delete(uid);
        this.dispatch(pendingChanged(this.pending.size));
        reject(new RemoteActionError({ code: LiveError.ACTION_REJECTED, message: "no answer" }));
      }, ACK_TIMEOUT_MS);
      this.pending.set(uid, { resolve, reject, timer, type, payload });
      this.dispatch(pendingChanged(this.pending.size));
    });
  }

  surrender() {
    return this.submit("battlechoc/match/surrender");
  }

  // the server keeps the match; nothing to pause or save on this device
  pause() {}

  resume() {}

  persist() {}

  result() {
    return undefined;
  }

  stop() {
    this.stopped = true;
    this.unsubscribe.forEach((unsubscribe) => unsubscribe());
    this.failPending();
    logger.info(`left online match ${this.matchId}`);
  }
}

export { RemoteMatchHost, RemoteActionError };
