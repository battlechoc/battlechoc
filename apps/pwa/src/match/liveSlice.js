import { createSlice } from "@reduxjs/toolkit";

// Lobby state of the live service: connection, matchmaking queue, rematch offers, challenges and
// the opponent's presence in a running online match.
const initialState = {
  status: "offline",
  queuedSince: null,
  incomingInvites: [],
  outgoingInvite: null,
  inviteClosed: null,
  opponentPresence: null,
  onlinePlayers: [],
  error: null,
  // the player's own challenge link as the server reports it ({ code, state, expiresAt, readers },
  // see live.ChallengeState), "lost" when the server forgot it (a restart)
  challenge: null,
  // a friend's challenge this player opened ({ code, state, from, name }, live.ChallengeViewState),
  // or "connecting" and "unreachable" before the server answered
  challengeView: null,
};

// states of a challenge the server still has to know about
const LIVE_CHALLENGE = ["waiting", "reading", "accepted"];

const liveSlice = createSlice({
  name: "battlechoc/live",
  initialState,
  reducers: {
    liveStatusChanged(state, action) {
      state.status = action.payload;
    },
    queueJoined(state, action) {
      state.queuedSince = action.payload;
    },
    queueLeft(state) {
      state.queuedSince = null;
    },
    inviteReceived(state, action) {
      state.incomingInvites = [
        ...state.incomingInvites.filter((invite) => invite.id !== action.payload.id),
        action.payload,
      ];
    },
    inviteSent(state, action) {
      state.outgoingInvite = action.payload;
      state.inviteClosed = null;
    },
    inviteClosed(state, action) {
      const { inviteId, reason } = action.payload;
      state.incomingInvites = state.incomingInvites.filter((invite) => invite.id !== inviteId);
      if (state.outgoingInvite && state.outgoingInvite.id === inviteId) {
        state.outgoingInvite = null;
        state.inviteClosed = reason;
      }
    },
    presenceChanged(state, action) {
      state.opponentPresence = action.payload;
    },
    onlinePlayersListed(state, action) {
      state.onlinePlayers = action.payload;
    },
    liveErrorReceived(state, action) {
      state.error = action.payload;
    },
    challengeUpdated(state, action) {
      if (action.payload === null && state.challenge && LIVE_CHALLENGE.includes(state.challenge.state)) {
        state.challenge = { ...state.challenge, state: "lost", expiresAt: null };
      } else {
        state.challenge = action.payload;
      }
    },
    // the player cancelled: gone here before the server confirms it
    challengeCleared(state) {
      state.challenge = null;
    },
    challengeViewed(state, action) {
      state.challengeView = action.payload;
    },
    liveMatchStarted(state) {
      state.challenge = null;
      state.challengeView = null;
      state.queuedSince = null;
      state.outgoingInvite = null;
      state.inviteClosed = null;
      state.opponentPresence = null;
      state.error = null;
    },
  },
});

export const {
  liveStatusChanged,
  queueJoined,
  queueLeft,
  inviteReceived,
  inviteSent,
  inviteClosed,
  presenceChanged,
  onlinePlayersListed,
  liveErrorReceived,
  liveMatchStarted,
  challengeUpdated,
  challengeCleared,
  challengeViewed,
} = liveSlice.actions;
export const liveReducer = liveSlice.reducer;
