import { live } from "@battlechoc/battlechoc-shared-functions";
import { liveConnection } from "./liveConnection";
import {
  liveStatusChanged,
  queueJoined,
  queueLeft,
  inviteReceived,
  inviteSent,
  inviteClosed,
  onlinePlayersListed,
  liveErrorReceived,
  liveMatchStarted,
} from "./liveSlice";
import logger from "../helper/logger";

const { ClientMessage, ServerMessage, LiveError } = live;

/**
 * The online lobby: keeps the live connection open while the player looks for a match,
 * waits for invites or plays online, and forwards lobby messages to Redux. A new or resumed
 * online match is handed to onMatch({ matchId, playerIndex, epoch, opponent }).
 */
class LiveLobby {
  constructor() {
    this.dispatch = () => {};
    this.onMatch = () => {};
    this.wired = false;
    this.active = false;
    this.currentMatchId = undefined;
  }

  init({ dispatch, onMatch }) {
    this.dispatch = dispatch;
    this.onMatch = onMatch;
    if (this.wired) {
      return;
    }
    this.wired = true;
    const c = liveConnection;
    c.on("status", (status) => this.dispatch(liveStatusChanged(status)));
    c.on(ServerMessage.WELCOME, (message) => {
      // a match is still running for this account (reload, other device): go back into it
      if (message.activeMatch && message.activeMatch.matchId !== this.currentMatchId) {
        this.startMatch({ matchId: message.activeMatch.matchId });
      }
    });
    c.on(ServerMessage.MATCH, (message) => {
      if (message.matchId !== this.currentMatchId) {
        this.startMatch(message);
      }
    });
    c.on(ServerMessage.QUEUED, (message) => this.dispatch(queueJoined(message.since)));
    c.on(ServerMessage.QUEUE_LEFT, () => this.dispatch(queueLeft()));
    c.on(ServerMessage.INVITE, (message) => this.dispatch(inviteReceived(message.invite)));
    c.on(ServerMessage.INVITE_SENT, (message) => this.dispatch(inviteSent(message.invite)));
    c.on(ServerMessage.INVITE_CLOSED, (message) => this.dispatch(inviteClosed(message)));
    c.on(ServerMessage.PRESENCE_LIST, (message) => this.dispatch(onlinePlayersListed(message.online)));
    c.on(ServerMessage.ERROR, (message) => {
      logger.info("live error", message.code);
      this.dispatch(liveErrorReceived(message.code));
      if (message.code === LiveError.UNKNOWN_MATCH && typeof this.currentMatchId !== "undefined") {
        // the match is over and gone on the server
        this.onMatchGone(this.currentMatchId);
      }
    });
  }

  startMatch(message) {
    this.currentMatchId = message.matchId;
    this.dispatch(liveMatchStarted());
    this.onMatch(message);
  }

  matchLeft() {
    this.currentMatchId = undefined;
  }

  onMatchGone() {}

  /** Opens the connection (lobby visible, or a match to resume); resolves with the welcome. */
  enter() {
    if (!this.active) {
      this.active = true;
      return liveConnection.acquire();
    }
    return liveConnection.open();
  }

  leave() {
    if (this.active) {
      this.active = false;
      liveConnection.release();
    }
  }

  async send(message) {
    await this.enter();
    liveConnection.send(message);
  }

  joinQueue() {
    return this.send({ type: ClientMessage.QUEUE_JOIN });
  }

  leaveQueue() {
    return this.send({ type: ClientMessage.QUEUE_LEAVE });
  }

  invite(username) {
    return this.send({ type: ClientMessage.INVITE, username });
  }

  acceptInvite(inviteId) {
    return this.send({ type: ClientMessage.INVITE_ACCEPT, inviteId });
  }

  declineInvite(inviteId) {
    return this.send({ type: ClientMessage.INVITE_DECLINE, inviteId });
  }

  cancelInvite(inviteId) {
    return this.send({ type: ClientMessage.INVITE_CANCEL, inviteId });
  }

  queryPresence(usernames) {
    return this.send({ type: ClientMessage.PRESENCE_QUERY, usernames });
  }
}

const liveLobby = new LiveLobby();

export { liveLobby };
