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
//   invite         { username }                  live invite (WebSocket, else Web Push)
//   invite.accept  { inviteId }
//   invite.decline { inviteId }
//   invite.cancel  { inviteId }
//   match.join     { matchId, lastSeq? }         (re)join a running match, e.g. after a reload
//   presence.query { usernames }                 which of these players are online (friends list)
//   intent         { matchId, uid, action: { type, payload } }  a match action (MatchActionTypes)
//
// Server → client
//   welcome        { playerId, serverT, activeMatch, protocol }
//   pong           { id, clientT, serverT }
//   queued         { since }
//   queue.left     {}
//   invite         { invite: { id, from, expiresAt } }       incoming
//   invite.sent    { invite: { id, to, expiresAt } }
//   invite.closed  { inviteId, reason }                      see InviteClosedReason
//   match          { matchId, playerIndex, epoch, opponent } you are in this match
//   view           { matchId, serverT, epoch, view }        snapshot plus the new events
//   ack            { matchId, uid, ok, error? }             answer to an intent
//   presence       { matchId, player, online, forfeitAt }   the opponent left or came back
//   result         { matchId, result }                      own outcome, achievements, xp, drops and rating
//   presence.list  { online }                               usernames of presence.query that are online
//   error          { code, message, uid? }                  see LiveError

const LIVE_PROTOCOL_VERSION = 1;

const ClientMessage = Object.freeze({
    HELLO: 'hello',
    PING: 'ping',
    QUEUE_JOIN: 'queue.join',
    QUEUE_LEAVE: 'queue.leave',
    QUEUE_AI: 'queue.ai',
    INVITE: 'invite',
    INVITE_ACCEPT: 'invite.accept',
    INVITE_DECLINE: 'invite.decline',
    INVITE_CANCEL: 'invite.cancel',
    MATCH_JOIN: 'match.join',
    INTENT: 'intent',
    PRESENCE_QUERY: 'presence.query',
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
    PRESENCE_LIST: 'presence.list',
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
    ACTION_REJECTED: 'ACTION_REJECTED',
    SHUTTING_DOWN: 'SHUTTING_DOWN',
});

const InviteClosedReason = Object.freeze({
    ACCEPTED: 'accepted',
    DECLINED: 'declined',
    EXPIRED: 'expired',
    CANCELLED: 'cancelled',
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
    CloseCode,
    LiveDefaults,
};
