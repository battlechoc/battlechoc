// Everything around the match rooms: who is connected, the matchmaking queue with its AI
// fallback, live invites, starting and recovering matches, and crediting the results.

const crypto = require('crypto');
const {
    engine,
    live,
    PlayerType,
    EmptyPlayerStats,
    translate,
    translationKeys,
    setCurrentLanguage,
    getCurrentLanguage,
} = require('@battlechoc/battlechoc-shared-functions');
const players = require('../players');
const { MatchRoom } = require('./room');

const { ServerMessage, LiveError, InviteClosedReason, CloseCode } = live;

const AI_REACTION_TIME_MS = 1000;

const newId = () => crypto.randomUUID();
const newSeed = () => crypto.randomBytes(16).toString('hex');

// translated push texts in the language of the receiving player
const textFor = (language, key, ...args) => {
    const previous = getCurrentLanguage();
    try {
        setCurrentLanguage(language || 'en');
        return translate(key, ...args);
    } finally {
        setCurrentLanguage(previous);
    }
};

class Lobby {
    constructor({ pool, push, store, clock, config, log }) {
        this.pool = pool;
        this.push = push;
        this.store = store;
        this.clock = clock;
        this.config = config;
        this.log = log;
        // playerId -> connection (one per account, a newer one replaces the older)
        this.connections = new Map();
        // matchId -> room, playerId -> matchId of the running match
        this.rooms = new Map();
        this.activeMatch = new Map();
        // playerId -> { since, timer }
        this.queue = new Map();
        // inviteId -> { id, from, to, expiresAt, timer }
        this.invites = new Map();
        // players whose match is being set up (guards against double starts)
        this.starting = new Set();
        this.shuttingDown = false;
    }

    deps() {
        return {
            clock: this.clock,
            store: this.store,
            config: this.config,
            log: this.log,
            onEnded: room => this.matchEnded(room),
        };
    }

    /* ---------- connections ---------- */

    register(connection) {
        const previous = this.connections.get(connection.playerId);
        if (previous && previous !== connection) {
            previous.close(CloseCode.REPLACED, 'connected elsewhere');
            this.unregister(previous);
        }
        this.connections.set(connection.playerId, connection);
        const matchId = this.activeMatch.get(connection.playerId);
        return matchId ? { matchId } : null;
    }

    unregister(connection) {
        if (this.connections.get(connection.playerId) === connection) {
            this.connections.delete(connection.playerId);
            this.leaveQueue(connection.playerId, false);
        }
        connection.rooms.forEach(room => room.detach(room.indexOf(connection.playerId), connection));
        connection.rooms.clear();
    }

    online(playerId) {
        return this.connections.has(playerId);
    }

    /** Answers which of the given usernames (e.g. the friends list) are online. */
    async presence(connection, usernames) {
        const names = (Array.isArray(usernames) ? usernames : [])
            .filter(name => typeof name === 'string' && name.length <= 64)
            .slice(0, 100)
            .map(name => name.toLowerCase());
        const rows = names.length > 0
            ? (await this.pool.query(`SELECT id, username FROM players WHERE username_lower IN (${names.map((_, i) => `$${i + 1}`).join(', ')})`, names)).rows
            : [];
        connection.send({ type: ServerMessage.PRESENCE_LIST, online: rows.filter(row => this.online(row.id)).map(row => row.username) });
    }

    busy(playerId) {
        return this.activeMatch.has(playerId) || this.starting.has(playerId);
    }

    /* ---------- matches ---------- */

    async playerSetup(playerId) {
        const row = await players.findPlayer(this.pool, playerId);
        if (!row) {
            return null;
        }
        return {
            playerId,
            name: row.username || EmptyPlayerStats.username,
            type: PlayerType.HUMAN,
            level: players.levelOf(row),
            score: row.score,
            language: row.language,
        };
    }

    /**
     * Starts a match between two players (setups from playerSetup) or a player and an AI
     * (second entry null) and connects the online players to it. Callers mark the players
     * as starting while they prepare the match.
     */
    async startMatch(kind, setups) {
        const humans = setups.filter(Boolean);
        const lowestScore = Math.min(...humans.map(setup => setup.score));
        const seed = newSeed();
        let agents = [];
        const matchPlayers = setups.map((setup, index) => (setup ? { ...setup, id: `p${index}` } : null));
        if (matchPlayers[1] === null) {
            const opponent = engine.aiOpponentForScore(lowestScore);
            matchPlayers[1] = { id: 'p1', playerId: null, name: opponent.name, type: opponent.type, level: humans[0].level };
            agents = [{ ...opponent.agent, playerIndex: 1, seed: `${seed}-ai`, reactionTimeMs: AI_REACTION_TIME_MS }];
        }
        const room = await MatchRoom.create({
            id: newId(),
            kind,
            players: matchPlayers,
            boardSize: engine.boardSizeForScore(lowestScore),
            seed,
            agents,
            ...this.deps(),
        });
        this.addRoom(room);
        room.humanIndexes().forEach(index => {
            const connection = this.connections.get(room.playerIds[index]);
            if (connection) {
                this.join(connection, room.id, -1);
            } else {
                room.startForfeitTimer(index);
            }
        });
        return room;
    }

    async startBetween(kind, playerA, playerB) {
        [playerA, playerB].forEach(playerId => this.starting.add(playerId));
        try {
            const setups = await Promise.all([this.playerSetup(playerA), this.playerSetup(playerB)]);
            if (setups.every(Boolean)) {
                await this.startMatch(kind, setups);
            }
        } finally {
            [playerA, playerB].forEach(playerId => this.starting.delete(playerId));
        }
    }

    addRoom(room) {
        this.rooms.set(room.id, room);
        room.humanIndexes().forEach(index => this.activeMatch.set(room.playerIds[index], room.id));
    }

    /** Connects a player to a match of theirs; answers with the match and its current view. */
    join(connection, matchId, lastSeq) {
        const room = this.rooms.get(matchId);
        const index = room ? room.indexOf(connection.playerId) : -1;
        if (index < 0) {
            connection.sendError(LiveError.UNKNOWN_MATCH);
            return;
        }
        if (!connection.rooms.has(room)) {
            connection.rooms.add(room);
            room.attach(index, connection, lastSeq);
        }
    }

    intent(connection, message) {
        const room = this.rooms.get(message.matchId);
        const index = room && connection.rooms.has(room) ? room.indexOf(connection.playerId) : -1;
        if (index < 0) {
            connection.sendError(LiveError.UNKNOWN_MATCH, typeof message.uid === 'string' ? message.uid : undefined);
            return;
        }
        room.submit(index, connection, message);
    }

    matchEnded(room) {
        room.humanIndexes().forEach(index => {
            const playerId = room.playerIds[index];
            if (this.activeMatch.get(playerId) === room.id) {
                this.activeMatch.delete(playerId);
            }
            const { record, ...result } = room.resultFor(index);
            // credited once per match and player (the record id is the match id)
            room.write(async () => {
                const coins = await players.addTrackRecords(this.pool, playerId, [record]);
                room.sendTo(index, { type: ServerMessage.RESULT, matchId: room.id, result: { ...result, coins } });
            });
        });
        this.clock.setTimer(() => {
            if (this.rooms.get(room.id) === room) {
                this.rooms.delete(room.id);
            }
        }, this.config.endedRoomLingerMs);
    }

    /** Rebuilds the running matches after a restart. */
    async recover() {
        const rows = await this.store.running();
        for (const row of rows) {
            try {
                const actions = await this.store.actionsAfter(row.id, row.snapshot_seq);
                const room = MatchRoom.restore({ row, actions, ...this.deps() });
                this.addRoom(room);
                if (room.match.phase === engine.MatchPhase.ENDED) {
                    room.end();
                }
            } catch (error) {
                this.log.error(`could not recover match ${row.id}`, error);
            }
        }
        return rows.length;
    }

    /* ---------- matchmaking ---------- */

    async joinQueue(connection) {
        const { playerId } = connection;
        if (this.shuttingDown) {
            connection.sendError(LiveError.SHUTTING_DOWN);
            return;
        }
        if (this.busy(playerId)) {
            connection.sendError(LiveError.ALREADY_IN_MATCH);
            return;
        }
        if (this.queue.has(playerId)) {
            connection.send({ type: ServerMessage.QUEUED, since: this.queue.get(playerId).since });
            return;
        }
        const waiting = [...this.queue.keys()].find(other => other !== playerId);
        if (waiting) {
            this.leaveQueue(waiting, false);
            await this.startBetween('queue', waiting, playerId);
            return;
        }
        const since = this.clock.now();
        const timer = this.clock.setTimer(() => this.aiFallback(playerId), this.config.aiFallbackMs);
        this.queue.set(playerId, { since, timer });
        connection.send({ type: ServerMessage.QUEUED, since });
    }

    leaveQueue(playerId, notify = true) {
        const entry = this.queue.get(playerId);
        if (!entry) {
            return;
        }
        this.clock.clearTimer(entry.timer);
        this.queue.delete(playerId);
        const connection = this.connections.get(playerId);
        if (notify && connection) {
            connection.send({ type: ServerMessage.QUEUE_LEFT });
        }
    }

    async aiFallback(playerId) {
        if (!this.queue.has(playerId)) {
            return;
        }
        this.leaveQueue(playerId, false);
        this.starting.add(playerId);
        try {
            const setup = await this.playerSetup(playerId);
            if (setup) {
                await this.startMatch('ai', [setup, null]);
            }
        } finally {
            this.starting.delete(playerId);
        }
    }

    /* ---------- invites ---------- */

    async invite(connection, username) {
        const target = await players.findPlayerByName(this.pool, username);
        if (!target || target.id === connection.playerId) {
            connection.sendError(LiveError.PLAYER_NOT_FOUND);
            return;
        }
        if (this.busy(connection.playerId)) {
            connection.sendError(LiveError.ALREADY_IN_MATCH);
            return;
        }
        const from = await this.playerSetup(connection.playerId);
        const invite = {
            id: newId(),
            from: connection.playerId,
            fromName: from.name,
            to: target.id,
            toName: target.username,
            expiresAt: this.clock.now() + this.config.inviteTtlMs,
        };
        invite.timer = this.clock.setTimer(() => this.closeInvite(invite.id, InviteClosedReason.EXPIRED), this.config.inviteTtlMs);
        this.invites.set(invite.id, invite);
        connection.send({ type: ServerMessage.INVITE_SENT, invite: { id: invite.id, to: invite.toName, expiresAt: invite.expiresAt } });

        const targetConnection = this.connections.get(target.id);
        if (targetConnection) {
            targetConnection.send({ type: ServerMessage.INVITE, invite: { id: invite.id, from: invite.fromName, expiresAt: invite.expiresAt } });
        } else if (this.push && this.push.enabled) {
            const language = target.language;
            this.push.sendToPlayer(target.id, {
                kind: 'invite',
                inviteId: invite.id,
                from: invite.fromName,
                title: textFor(language, translationKeys.SERVER_NOTIFICATION_CHALLENGE_TITLE, invite.fromName),
                text: textFor(language, translationKeys.SERVER_NOTIFICATION_CHALLENGE_BODY),
                url: `/?invite=${invite.id}`,
            }, { ttl: Math.ceil(this.config.inviteTtlMs / 1000), urgency: 'high', topic: 'invite' })
                .catch(error => this.log.warn('invite push failed', error));
        }
    }

    closeInvite(inviteId, reason) {
        const invite = this.invites.get(inviteId);
        if (!invite) {
            return null;
        }
        this.clock.clearTimer(invite.timer);
        this.invites.delete(inviteId);
        [invite.from, invite.to].forEach(playerId => {
            const connection = this.connections.get(playerId);
            if (connection) {
                connection.send({ type: ServerMessage.INVITE_CLOSED, inviteId, reason });
            }
        });
        return invite;
    }

    async answerInvite(connection, inviteId, reason) {
        const invite = this.invites.get(inviteId);
        const allowed = invite && (reason === InviteClosedReason.CANCELLED ? invite.from : invite.to) === connection.playerId;
        if (!allowed) {
            connection.sendError(LiveError.INVITE_NOT_FOUND);
            return;
        }
        if (reason !== InviteClosedReason.ACCEPTED) {
            this.closeInvite(inviteId, reason);
            return;
        }
        if (!this.online(invite.from)) {
            connection.sendError(LiveError.PLAYER_OFFLINE);
            this.closeInvite(inviteId, InviteClosedReason.CANCELLED);
            return;
        }
        if (this.busy(invite.from) || this.busy(invite.to)) {
            connection.sendError(LiveError.ALREADY_IN_MATCH);
            return;
        }
        this.closeInvite(inviteId, InviteClosedReason.ACCEPTED);
        [invite.from, invite.to].forEach(playerId => this.leaveQueue(playerId, false));
        await this.startBetween('invite', invite.from, invite.to);
    }

    /* ---------- shutdown ---------- */

    async shutdown() {
        this.shuttingDown = true;
        [...this.queue.keys()].forEach(playerId => this.leaveQueue(playerId, false));
        [...this.invites.keys()].forEach(inviteId => this.closeInvite(inviteId, InviteClosedReason.CANCELLED));
        await Promise.all([...this.rooms.values()].map(room => room.suspend()));
    }
}

module.exports = { Lobby };
