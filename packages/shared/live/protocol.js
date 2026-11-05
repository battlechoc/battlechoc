// Messages of the live match WebSocket (/live on the API). Every message is a JSON object
// with a `type`. The server is the host of online matches: it stamps the match time, applies
// the actions and sends each player only their own view (see engine/view.js).
//
// Client → server
//   hello          { token }                     first message, a device account access token
//   ping           { id, clientT }               clock sync and heartbeat, every 5 s
//   queue.join     {}                            matchmaking; an AI joins after 15 s alone
//   queue.leave    {}
//   queue.ai       {}                            play against the server AI now (queued or not)
//   invite.accept  { inviteId }
//   invite.decline { inviteId }
//   invite.cancel  { inviteId }
//   match.join     { matchId, lastSeq? }         (re)join a running match, e.g. after a reload
//   intent         { matchId, uid, action: { type, payload } }  a match action (MatchActionTypes)
//   challenge.create  {}                         a challenge link (one per player; resends a waiting one)
//   challenge.renew   { code }                   "Send again": the same code waits another 2 minutes
//   challenge.cancel  { code }
//   challenge.open    { code }                   a friend opened the link or typed the code
//   challenge.accept  { code }                   the first accept starts the match
//   challenge.decline { code }                   "Not now"
//   rematch        { matchId }                   after a challenge match: offers the opponent another
//
// Server → client
//   welcome        { playerId, serverT, activeMatch, challenge, protocol }  challenge: as in `challenge`
//   pong           { id, clientT, serverT }
//   queued         { since }
//   queue.left     {}
//   invite         { invite: { id, from, expiresAt, rematch } }  incoming rematch offer
//   invite.sent    { invite: { id, to, expiresAt } }
//   invite.closed  { inviteId, reason }                      see InviteClosedReason
//   match          { matchId, playerIndex, epoch, opponent } you are in this match
//   view           { matchId, serverT, epoch, view }        snapshot plus the new events
//   ack            { matchId, uid, ok, error? }             answer to an intent
//   presence       { matchId, player, online, forfeitAt }   the opponent left or came back
//   result         { matchId, result }                      own outcome, achievements, xp, drops and rating
//   challenge      { challenge: { code, state, expiresAt, readers } | null }  to the challenger (ChallengeState)
//   challenge.view { view: { code, state, from?, name? } }   to a friend (ChallengeViewState); name: their own
//                                                           name when the server just gave them one
//   error          { code, message, uid? }                  see LiveError

const LIVE_PROTOCOL_VERSION = 1;

const ClientMessage = Object.freeze({
    HELLO: 'hello',
    PING: 'ping',
    QUEUE_JOIN: 'queue.join',
    QUEUE_LEAVE: 'queue.leave',
    QUEUE_AI: 'queue.ai',
    INVITE_ACCEPT: 'invite.accept',
    INVITE_DECLINE: 'invite.decline',
    INVITE_CANCEL: 'invite.cancel',
    MATCH_JOIN: 'match.join',
    INTENT: 'intent',
    CHALLENGE_CREATE: 'challenge.create',
    CHALLENGE_RENEW: 'challenge.renew',
    CHALLENGE_CANCEL: 'challenge.cancel',
    CHALLENGE_OPEN: 'challenge.open',
    CHALLENGE_ACCEPT: 'challenge.accept',
    CHALLENGE_DECLINE: 'challenge.decline',
    REMATCH: 'rematch',
});

const ServerMessage = Object.freeze({
    WELCOME: 'welcome',
    PONG: 'pong',
    QUEUED: 'queued',
    QUEUE_LEFT: 'queue.left',
    INVITE: 'invite',
    INVITE_SENT: 'invite.sent',
    INVITE_CLOSED: 'invite.closed',
    MATCH: 'match',
    VIEW: 'view',
    ACK: 'ack',
    PRESENCE: 'presence',
    RESULT: 'result',
    CHALLENGE: 'challenge',
    CHALLENGE_VIEW: 'challenge.view',
    ERROR: 'error',
});

const LiveError = Object.freeze({
    UNAUTHORIZED: 'UNAUTHORIZED',
    BAD_MESSAGE: 'BAD_MESSAGE',
    RATE_LIMITED: 'RATE_LIMITED',
    ALREADY_IN_MATCH: 'ALREADY_IN_MATCH',
    UNKNOWN_MATCH: 'UNKNOWN_MATCH',
    PLAYER_NOT_FOUND: 'PLAYER_NOT_FOUND',
    PLAYER_OFFLINE: 'PLAYER_OFFLINE',
    INVITE_NOT_FOUND: 'INVITE_NOT_FOUND',
    CHALLENGE_NOT_FOUND: 'CHALLENGE_NOT_FOUND',
    ACTION_REJECTED: 'ACTION_REJECTED',
    SHUTTING_DOWN: 'SHUTTING_DOWN',
});

const InviteClosedReason = Object.freeze({
    ACCEPTED: 'accepted',
    DECLINED: 'declined',
    EXPIRED: 'expired',
    CANCELLED: 'cancelled',
});

// a challenge as its challenger sees it
const ChallengeState = Object.freeze({
    WAITING: 'waiting',
    // a friend has the challenge card open
    READING: 'reading',
    // a friend accepted while the challenger was away (in the chat app): the match starts when they are back
    ACCEPTED: 'accepted',
    EXPIRED: 'expired',
    DECLINED: 'declined',
    // the friend accepted and gave up waiting for the challenger
    MISSED: 'missed',
    STARTED: 'started',
});

// a challenge as a friend sees it
const ChallengeViewState = Object.freeze({
    OPEN: 'open',
    WAITING_FOR_CHALLENGER: 'waiting-for-challenger',
    CHALLENGER_AWAY: 'challenger-away',
    ENDED: 'ended',
    // somebody else accepted first: the match is already on
    TAKEN: 'taken',
    OWN: 'own',
    BUSY: 'busy',
});

// WebSocket close codes (4000-4999 are free for applications, 1012 is "service restart")
const CloseCode = Object.freeze({
    PROTOCOL: 4400,
    UNAUTHORIZED: 4401,
    // no hello in time (LiveDefaults.helloTimeoutMs): a busy or slow page, which may connect again
    HELLO_TIMEOUT: 4408,
    // the same account connected again (another tab or device)
    REPLACED: 4409,
    RESTART: 1012,
});

// timings of the live service; the match rules themselves are in the balance config
const LiveDefaults = Object.freeze({
    pingIntervalMs: 5000,
    // a player counts as offline after this long without any message or pong
    offlineAfterMs: 10000,
    helloTimeoutMs: 5000,
    // an offline player loses the match after this long (D11)
    disconnectGraceMs: 60000,
    // matchmaking: an AI joins after this long without an opponent (D18; 15 s since the Start button)
    aiFallbackMs: 15000,
    inviteTtlMs: 60000,
    // challenges: an unopened link waits this long ("Send again" waits the same again)
    challengeTtlMs: 120000,
    // while a friend reads the card the challenge does not expire, up to this long
    challengeReadCapMs: 600000,
    // a friend whose connection is gone this long stops being a reader
    challengeReaderGraceMs: 60000,
    // a friend who accepted waits this long for an away challenger
    challengeAwayMs: 60000,
    // an expired, declined or missed challenge can be sent again for this long
    challengeKeepMs: 600000,
    // per player: at most this many match actions per second
    intentsPerSecond: 10,
    // per connection: at most this many messages per second
    messagesPerSecond: 30,
    maxMessageBytes: 16 * 1024,
    // a finished match stays reachable this long for late (re)joins
    endedRoomLingerMs: 5 * 60 * 1000,
    snapshotEveryActions: 20,
    // how often the reached match time is saved (a recovered match loses at most this much)
    saveReachedEveryMs: 5000,
});

module.exports = {
    LIVE_PROTOCOL_VERSION,
    ClientMessage,
    ServerMessage,
    LiveError,
    InviteClosedReason,
    ChallengeState,
    ChallengeViewState,
    CloseCode,
    LiveDefaults,
};
