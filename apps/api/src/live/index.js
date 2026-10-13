// The live match service: a WebSocket endpoint (/live) on the API's HTTP server. A client
// authenticates with the access token of its device account in the first message, then
// syncs its clock with pings, joins the matchmaking queue or invites a player, and sends
// match actions. See shared/live/protocol.js for the messages.

const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { live } = require('@battlechoc/battlechoc-shared-functions');
const { systemClock } = require('./clock');
const { createMatchStore } = require('./store');
const { Lobby } = require('./lobby');

const { ClientMessage, ServerMessage, LiveError, CloseCode, InviteClosedReason, LiveDefaults, LIVE_PROTOCOL_VERSION } = live;

/**
 * @param {object} options
 * @param {import('http').Server} options.server
 * @param {object} options.pool
 * @param {object} options.auth see auth.js
 * @param {object} [options.push] see push.js
 * @param {object} [options.clock] match clock, see clock.js
 * @param {object} [options.config] overrides of LiveDefaults
 * @param {string[]} [options.origins] allowed browser origins (no Origin header: allowed)
 */
const createLive = ({ server, pool, auth, push, clock = systemClock, config = {}, origins = [], log = console }) => {
    const settings = { ...LiveDefaults, ...config };
    const store = createMatchStore(pool);
    const lobby = new Lobby({ pool, push, store, clock, config: settings, log });
    const connections = new Set();

    const wss = new WebSocketServer({
        server,
        path: '/live',
        maxPayload: settings.maxMessageBytes,
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
        [ClientMessage.INVITE]: (connection, message) => (typeof message.username === 'string'
            ? lobby.invite(connection, message.username)
            : connection.sendError(LiveError.BAD_MESSAGE)),
        [ClientMessage.INVITE_ACCEPT]: (connection, message) => lobby.answerInvite(connection, message.inviteId, InviteClosedReason.ACCEPTED),
        [ClientMessage.INVITE_DECLINE]: (connection, message) => lobby.answerInvite(connection, message.inviteId, InviteClosedReason.DECLINED),
        [ClientMessage.INVITE_CANCEL]: (connection, message) => lobby.answerInvite(connection, message.inviteId, InviteClosedReason.CANCELLED),
        [ClientMessage.MATCH_JOIN]: (connection, message) => lobby.join(connection, message.matchId, message.lastSeq),
        [ClientMessage.INTENT]: (connection, message) => lobby.intent(connection, message),
        [ClientMessage.PRESENCE_QUERY]: (connection, message) => lobby.presence(connection, message.usernames),
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
        connection.send({ type: ServerMessage.WELCOME, playerId, serverT: clock.now(), activeMatch, protocol: LIVE_PROTOCOL_VERSION });
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
        connection.helloTimer = setTimeout(() => connection.close(CloseCode.UNAUTHORIZED, 'no hello'), settings.helloTimeoutMs);

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
                if (connection.closed) {
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
            }
        });
    }, settings.pingIntervalMs);

    /** Stops the service; running matches are saved and continue after the restart. */
    const close = async () => {
        clearInterval(heartbeat);
        await lobby.shutdown();
        connections.forEach(connection => connection.close(CloseCode.RESTART, 'restart'));
        await new Promise(resolve => wss.close(() => resolve()));
    };

    return { wss, lobby, store, recover: () => lobby.recover(), close };
};

module.exports = { createLive };
