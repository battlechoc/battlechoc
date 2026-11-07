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
  error: null,
  // the player's own challenge link as the server reports it ({ code, state, expiresAt, readers },
  // see live.ChallengeState), "lost" when the server forgot it (a restart)
  challenge: null,
  // a friend's challenge this player opened ({ code, state, from, name }, live.ChallengeViewState),
  // or "connecting" and "unreachable" before the server answered
  challengeView: null,
  // the player closed "Play with a friend" before the server made the challenge: it is cancelled
  // when it arrives (liveLobby sends the cancel for challengeToCancel) instead of reopening the dialog
  challengeDismissed: false,
  challengeToCancel: null,
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
        ...state.incomingInvites.filter(
          (invite) => invite.id !== action.payload.id
        ),
        action.payload,
      ];
    },
    inviteSent(state, action) {
      state.outgoingInvite = action.payload;
      state.inviteClosed = null;
    },
    inviteClosed(state, action) {
      const { inviteId, reason } = action.payload;
      state.incomingInvites = state.incomingInvites.filter(
        (invite) => invite.id !== inviteId
      );
      if (state.outgoingInvite && state.outgoingInvite.id === inviteId) {
        state.outgoingInvite = null;
        state.inviteClosed = reason;
      }
    },
    presenceChanged(state, action) {
      state.opponentPresence = action.payload;
    },
    liveErrorReceived(state, action) {
      state.error = action.payload;
    },
    challengeUpdated(state, action) {
      if (
        action.payload !== null &&
        state.challengeDismissed &&
        state.challenge === null
      ) {
        state.challengeDismissed = false;
        state.challengeToCancel = action.payload.code;
        return;
      }
      if (
        action.payload === null &&
        state.challenge &&
        LIVE_CHALLENGE.includes(state.challenge.state)
      ) {
        state.challenge = {
          ...state.challenge,
          state: "lost",
          expiresAt: null,
        };
      } else {
        state.challenge = action.payload;
      }
    },
    // the player cancelled: gone here before the server confirms it
    challengeCleared(state) {
      state.challenge = null;
      state.challengeToCancel = null;
    },
    challengeDismissed(state) {
      state.challengeDismissed = true;
    },
    // the dialog asks for a challenge (again): one that arrives now is wanted
    challengeRequested(state) {
      state.challengeDismissed = false;
    },
    challengeViewed(state, action) {
      state.challengeView = action.payload;
    },
    // still no answer for a friend's challenge: the card says the server cannot be reached
    challengeUnreachable(state) {
      if (state.challengeView && state.challengeView.state === "connecting") {
        state.challengeView = { ...state.challengeView, state: "unreachable" };
      }
    },
    liveMatchStarted(state) {
      state.challenge = null;
      // the challenge being played ends here; one still being asked (a link opened while a match
      // comes back after a reload) is asked again when that match is over (App)
      if (
        !state.challengeView ||
        !["connecting", "busy"].includes(state.challengeView.state)
      ) {
        state.challengeView = null;
      }
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
  liveErrorReceived,
  liveMatchStarted,
  challengeUpdated,
  challengeCleared,
  challengeDismissed,
  challengeRequested,
  challengeViewed,
  challengeUnreachable,
} = liveSlice.actions;
export const liveReducer = liveSlice.reducer;
