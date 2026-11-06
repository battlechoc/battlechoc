// The live match service: a WebSocket endpoint (/live) on the API's HTTP server. A client
// authenticates with the access token of its device account in the first message, then
// syncs its clock with pings, joins the matchmaking queue, creates or opens challenges, and sends
// match actions. See shared/live/protocol.js for the messages.

const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { live } = require('@battlechoc/battlechoc-shared-functions');
const { systemClock } = require('./clock');
const { createMatchStore } = require('./store');
const { Lobby } = require('./lobby');

const { ClientMessage, ServerMessage, LiveError, CloseCode, InviteClosedReason, LiveDefaults, LIVE_PROTOCOL_VERSION } = live;

// how long close() waits for the clients to answer the closing handshake
const CLOSE_GRACE_MS = 2000;

// a connection with more than this waiting to be written is dropped (see the heartbeat)
const MAX_BUFFERED_BYTES = 1024 * 1024;

// A room sends each player a full view with every change, about 40 KB of JSON on the big board.
// Compressed it is a tenth of that (permessage-deflate, which browsers negotiate by themselves; a
// client that does not offer it gets plain text as before). What bounds the cost per socket:
const COMPRESSION = {
    // acks, pongs and presence messages are sent as they are: there is nothing to gain
    threshold: 1024,
    // every message is compressed on its own, so no compression state (some 200 KB) stays with a
    // socket between messages; for one big JSON document that costs next to nothing
    serverNoContextTakeover: true,
    clientNoContextTakeover: true,
    // zlib calls at a time in the whole process (ws keeps one limiter for all sockets)
    concurrencyLimit: 10,
    // level 3 takes about as long as building the JSON and leaves 10 % of it; level 6 takes three
    // times as long for 1 % more
    zlibDeflateOptions: { level: 3, memLevel: 7 },
};

/**
 * @param {object} options
 * @param {import('http').Server} options.server
 * @param {object} options.pool
 * @param {object} options.auth see auth.js
 * @param {object} [options.clock] match clock, see clock.js
 * @param {object} [options.config] overrides of LiveDefaults
 * @param {string[]} [options.origins] allowed browser origins (no Origin header: allowed)
 */
const createLive = ({ server, pool, auth, clock = systemClock, config = {}, origins = [], log = console, random }) => {
    const settings = { closeGraceMs: CLOSE_GRACE_MS, maxBufferedBytes: MAX_BUFFERED_BYTES, ...LiveDefaults, ...config };
    const store = createMatchStore(pool);
    const lobby = new Lobby({ pool, store, clock, config: settings, log, random });
    const connections = new Set();
    // set by close(): what clients send from then on is not handled (they reconnect after the restart)
    let closing = false;
    // resolves the wait of close() once the last connection is gone
    let drained = () => {};

    const wss = new WebSocketServer({
        server,
        path: '/live',
        maxPayload: settings.maxMessageBytes,
        perMessageDeflate: COMPRESSION,
        verifyClient: ({ origin }) => !origin || origins.length === 0 || origins.includes(origin),
    });

    const handlers = {
        [ClientMessage.PING]: (connection, message) => connection.send({
            type: ServerMessage.PONG,
            id: message.id,
            clientT: message.clientT,
            serverT: clock.now(),
        }),
        [ClientMessage.QUEUE_JOIN]: connection => lobby.joinQueue(connection),
        [ClientMessage.QUEUE_LEAVE]: connection => lobby.leaveQueue(connection.playerId),
        [ClientMessage.QUEUE_AI]: connection => lobby.playAiNow(connection),
        [ClientMessage.INVITE_ACCEPT]: (connection, message) => lobby.answerInvite(connection, message.inviteId, InviteClosedReason.ACCEPTED),
        [ClientMessage.INVITE_DECLINE]: (connection, message) => lobby.answerInvite(connection, message.inviteId, InviteClosedReason.DECLINED),
        [ClientMessage.INVITE_CANCEL]: (connection, message) => lobby.answerInvite(connection, message.inviteId, InviteClosedReason.CANCELLED),
        [ClientMessage.MATCH_JOIN]: (connection, message) => lobby.join(connection, message.matchId, message.lastSeq),
        [ClientMessage.INTENT]: (connection, message) => lobby.intent(connection, message),
        [ClientMessage.REMATCH]: (connection, message) => lobby.rematch(connection, message.matchId),
        [ClientMessage.CHALLENGE_CREATE]: connection => lobby.challenges.create(connection),
        [ClientMessage.CHALLENGE_RENEW]: (connection, message) => lobby.challenges.renew(connection, message.code),
        [ClientMessage.CHALLENGE_CANCEL]: (connection, message) => lobby.challenges.cancel(connection, message.code),
        [ClientMessage.CHALLENGE_OPEN]: (connection, message) => lobby.challenges.open(connection, message.code),
        [ClientMessage.CHALLENGE_ACCEPT]: (connection, message) => lobby.challenges.accept(connection, message.code),
        [ClientMessage.CHALLENGE_DECLINE]: (connection, message) => lobby.challenges.decline(connection, message.code),
    };

    const hello = async (connection, message) => {
        let playerId;
        try {
            playerId = await auth.verify(message.token);
        } catch {
            connection.close(CloseCode.UNAUTHORIZED, 'unauthorized');
            return;
        }
        if (connection.closed) {
            return;
        }
        if (!(await lobby.playerSetup(playerId))) {
            connection.close(CloseCode.UNAUTHORIZED, 'unknown player');
            return;
        }
        clearTimeout(connection.helloTimer);
        connection.playerId = playerId;
        const activeMatch = lobby.register(connection);
        const challenge = lobby.challenges.stateFor(playerId);
        connection.send({ type: ServerMessage.WELCOME, playerId, serverT: clock.now(), activeMatch, challenge, protocol: LIVE_PROTOCOL_VERSION });
        await lobby.challenges.afterWelcome(connection);
    };

    wss.on('connection', ws => {
        const connection = {
            id: crypto.randomUUID(),
            playerId: null,
            closed: false,
            rooms: new Set(),
            lastSeqByMatch: new Map(),
            lastSeenAt: Date.now(),
            bucket: { tokens: settings.messagesPerSecond, at: Date.now() },
            pending: Promise.resolve(),
            send(message) {
                if (!this.closed && ws.readyState === ws.OPEN) {
                    ws.send(JSON.stringify(message));
                }
            },
            // bytes handed to the socket that the client has not taken yet
            unsent() {
                return ws.bufferedAmount;
            },
            sendError(code, uid) {
                this.send({ type: ServerMessage.ERROR, code, ...(uid ? { uid } : {}) });
            },
            close(code, reason) {
                ws.close(code, reason);
            },
        };
        ws.on('error', error => log.warn('live socket error', error.message));
        connection.terminate = () => ws.terminate();
        connections.add(connection);
        connection.helloTimer = setTimeout(() => connection.close(CloseCode.HELLO_TIMEOUT, 'no hello'), settings.helloTimeoutMs);

        const allowed = () => {
            const now = Date.now();
            const { bucket } = connection;
            bucket.tokens = Math.min(settings.messagesPerSecond, bucket.tokens + ((now - bucket.at) * settings.messagesPerSecond) / 1000);
            bucket.at = now;
            if (bucket.tokens < 1) {
                return false;
            }
            bucket.tokens -= 1;
            return true;
        };

        ws.on('pong', () => {
            connection.lastSeenAt = Date.now();
        });

        ws.on('message', (data, isBinary) => {
            connection.lastSeenAt = Date.now();
            let message;
            try {
                message = isBinary ? null : JSON.parse(data.toString());
            } catch {
                message = null;
            }
            if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
                connection.sendError(LiveError.BAD_MESSAGE);
                return;
            }
            if (!allowed()) {
                if (message.type === ClientMessage.INTENT) {
                    // a client waits for the ack of every intent
                    connection.send({ type: ServerMessage.ACK, matchId: message.matchId, uid: message.uid, ok: false, error: { code: LiveError.RATE_LIMITED } });
                } else {
                    connection.sendError(LiveError.RATE_LIMITED);
                }
                return;
            }
            // messages of a connection are handled one after the other
            connection.pending = connection.pending.then(async () => {
                if (connection.closed || closing) {
                    return;
                }
                if (connection.playerId === null) {
                    if (message.type === ClientMessage.HELLO) {
                        await hello(connection, message);
                    } else {
                        connection.close(CloseCode.PROTOCOL, 'hello first');
                    }
                    return;
                }
                const handler = Object.prototype.hasOwnProperty.call(handlers, message.type) ? handlers[message.type] : null;
                if (!handler) {
                    connection.sendError(LiveError.BAD_MESSAGE);
                    return;
                }
                await handler(connection, message);
            }).catch(error => {
                log.error('live message failed', error);
                connection.sendError(LiveError.BAD_MESSAGE);
            });
        });

        ws.on('close', () => {
            connection.closed = true;
            clearTimeout(connection.helloTimer);
            connections.delete(connection);
            if (connection.playerId !== null) {
                lobby.unregister(connection);
            }
            if (connections.size === 0) {
                drained();
            }
        });
    });

    // heartbeat on real time: a silent connection is dropped, which starts the forfeit timer
    const heartbeat = setInterval(() => {
        const now = Date.now();
        wss.clients.forEach(ws => ws.ping());
        connections.forEach(connection => {
            if (now - connection.lastSeenAt > settings.offlineAfterMs) {
                // no closing handshake with a dead peer: drop the socket right away
                connection.terminate();
            } else if (connection.unsent() > settings.maxBufferedBytes) {
                // A client that still talks but takes its messages slower than they are written (a
                // throttled phone) lets them pile up in this process without end. Views cannot be
                // skipped to keep the pile small: each one carries the events since the last the
                // client got (room.publishTo), which the client plays once, so a skipped view
                // would lose them. The connection is dropped instead: the client reconnects, joins
                // with the last event it has and gets the current view with all it missed.
                // Checked here and not in send(): a compressed message first waits in the queue of
                // ws, so several sent in one go would look like a client that is behind.
                log.warn(`live connection of ${connection.playerId} dropped: ${connection.unsent()} bytes behind`);
                connection.terminate();
            }
        });
    }, settings.pingIntervalMs);

    /** Stops the service; running matches are saved and continue after the restart. */
    const close = async () => {
        closing = true;
        clearInterval(heartbeat);
        await lobby.shutdown();
        connections.forEach(connection => connection.close(CloseCode.RESTART, 'restart'));
        // A client that is gone (a phone without network) never answers the close, and its socket
        // would keep the HTTP server from closing for half a minute: after a moment for the others
        // to answer, what is left is dropped.
        if (connections.size > 0) {
            await new Promise(resolve => {
                const timer = setTimeout(resolve, settings.closeGraceMs);
                drained = () => {
                    clearTimeout(timer);
                    resolve();
                };
            });
            connections.forEach(connection => connection.terminate());
        }
        await new Promise(resolve => wss.close(() => resolve()));
    };

    return { wss, lobby, store, recover: () => lobby.recover(), close };
};

module.exports = { createLive };
