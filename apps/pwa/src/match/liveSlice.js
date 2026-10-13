import { createSlice } from "@reduxjs/toolkit";

// Lobby state of the live service: connection, matchmaking queue, invites and the
// opponent's presence in a running online match.
const initialState = {
  status: "offline",
  queuedSince: null,
  incomingInvites: [],
  outgoingInvite: null,
  inviteClosed: null,
  opponentPresence: null,
  onlinePlayers: [],
  error: null,
};

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
    liveMatchStarted(state) {
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
} = liveSlice.actions;
export const liveReducer = liveSlice.reducer;
