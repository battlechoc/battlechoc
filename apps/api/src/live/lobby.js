// Everything around the match rooms: who is connected, the matchmaking queue with its AI
// fallback, challenges (challenges.js) and rematch offers, starting and recovering matches, and
// crediting the results.

const crypto = require('crypto');
const {
    engine,
    live,
    PlayerType,
    EmptyPlayerStats,
} = require('@battlechoc/battlechoc-shared-functions');
const players = require('../players');
const rewards = require('../rewards');
const { MatchRoom } = require('./room');
const { Challenges } = require('./challenges');

const { ServerMessage, LiveError, InviteClosedReason, CloseCode } = live;

const AI_REACTION_TIME_MS = 1000;

const newId = () => crypto.randomUUID();
const newSeed = () => crypto.randomBytes(16).toString('hex');

class Lobby {
    constructor({ pool, store, clock, config, log, random }) {
        this.pool = pool;
        // random source of the ingredient drops (tests pass a fixed one; default: crypto)
        this.random = random;
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
        // rematch offers: inviteId -> { id, kind, from, to, expiresAt, timer }
        this.invites = new Map();
        // players whose match is being set up (guards against double starts)
        this.starting = new Set();
        // challenge links (challenges.js)
        this.challenges = new Challenges({ lobby: this, clock, config, pool });
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
            // a challenger in the chat app keeps their challenge; a reader keeps their place a while
            this.challenges.readerLeft(connection);
        }
        connection.rooms.forEach(room => room.detach(room.indexOf(connection.playerId), connection));
        connection.rooms.clear();
    }

    online(playerId) {
        return this.connections.has(playerId);
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
        const score = Number(row.xp) || 0;
        return {
            playerId,
            name: row.username || EmptyPlayerStats.username,
            type: PlayerType.HUMAN,
            loadout: players.loadoutOf(row, await players.itemsOf(this.pool, playerId)),
            score,
            // the step of the AI ladder: opponent and board of a match against the AI
            aiLadder: players.ladderOf(row),
            language: row.language,
        };
    }

    /**
     * Starts a match between two players (setups from playerSetup) or a player and an AI
     * (second entry null) and connects the online players to it. Callers mark the players
     * as starting while they prepare the match. A match against the AI is set up like the
     * single player one by the player's AI ladder from the database (engine.aiLadderSetup): the
     * prepared first game for the very first one, the opponent and board by the step, no hurry for
     * field choice and placement. A challenge match is always on the big board, with more time for
     * the placement.
     */
    async startMatch(kind, setups) {
        const humans = setups.filter(Boolean);
        const lowestScore = Math.min(...humans.map(setup => setup.score));
        const seed = newSeed();
        let agents = [];
        let boardSize = engine.boardSizeForScore(lowestScore);
        let balance;
        let scenario;
        const matchPlayers = setups.map((setup, index) => (setup ? { ...setup, id: `p${index}` } : null));
        if (kind === 'challenge') {
            ({ boardSize, balance } = engine.challengeMatchSetup());
        }
        if (matchPlayers[1] === null) {
            const aiSetup = engine.aiLadderSetup(humans[0].aiLadder);
            const { opponent } = aiSetup;
            ({ boardSize, balance, scenario } = aiSetup);
            // the server AI plays without equipment
            matchPlayers[1] = { id: 'p1', playerId: null, name: opponent.name, type: opponent.type };
            agents = [{ ...opponent.agent, playerIndex: 1, seed: `${seed}-ai`, reactionTimeMs: AI_REACTION_TIME_MS }];
        }
        const room = await MatchRoom.create({
            id: newId(),
            kind,
            players: matchPlayers,
            boardSize,
            seed,
            balance,
            scenario,
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

    // credits a verified match: drops and XP per human player, a rating change between two humans;
    // safe to run twice for the same room (after a restart), each part is credited once
    matchEnded(room) {
        this.challenges.matchEnded(room.id);
        const humans = room.humanIndexes();
        humans.forEach(index => {
            const playerId = room.playerIds[index];
            if (this.activeMatch.get(playerId) === room.id) {
                this.activeMatch.delete(playerId);
            }
        });
        room.write(async () => {
            const { winners } = room.match.outcome;
            let ratings = {};
            // only a match that ran is rated (an instant surrender must not move the public rating)
            const ran = room.match.startedAt !== null && typeof room.match.startedAt !== 'undefined';
            // a challenge is a friendly match: never rated
            if (humans.length === 2 && ran && room.kind !== 'challenge') {
                const scoreA = winners.length === 2 ? 0.5 : winners[0] === 0 ? 1 : 0;
                ratings = (await rewards.rateMatch(this.pool, room.id, room.playerIds, scoreA)) || {};
            }
            for (const index of humans) {
                const playerId = room.playerIds[index];
                const { record, ...result } = room.resultFor(index);
                const credit = await rewards.creditVerifiedMatch(this.pool, {
                    playerId,
                    record,
                    isWinner: winners.includes(index),
                    opponentIsAi: record.opponent.ai,
                    challenge: room.kind === 'challenge',
                    now: this.clock.now(),
                    random: this.random,
                });
                if (credit && record.opponent.ai) {
                    // a match against the AI moves the player's ladder (once: credit is null the second time)
                    await players.advanceAiLadder(this.pool, playerId, record.won ? 'won' : record.lost ? 'lost' : 'draw');
                }
                room.sendTo(index, {
                    type: ServerMessage.RESULT,
                    matchId: room.id,
                    result: { ...result, xp: credit ? credit.xp : 0, drops: credit ? credit.drops : [], rating: ratings[playerId] },
                });
            }
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
        // Start while a challenge waits: the challenger plays someone else
        this.challenges.cancelOwn(playerId);
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
        if (entry.timer !== null) {
            this.clock.clearTimer(entry.timer);
        }
        this.queue.delete(playerId);
        const connection = this.connections.get(playerId);
        if (notify && connection) {
            connection.send({ type: ServerMessage.QUEUE_LEFT });
        }
    }

    /** Play against the server AI right away, whether queued or not (Start → "Play the AI now"). */
    async playAiNow(connection) {
        const { playerId } = connection;
        this.challenges.cancelOwn(playerId);
        if (this.queue.has(playerId)) {
            await this.aiFallback(playerId);
            return;
        }
        if (this.busy(playerId)) {
            connection.sendError(LiveError.ALREADY_IN_MATCH);
            return;
        }
        this.queue.set(playerId, { since: this.clock.now(), timer: null });
        await this.aiFallback(playerId);
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

    /** After a challenge match: offers the opponent another one (an invite that starts a challenge match). */
    async rematch(connection, matchId) {
        const { playerId } = connection;
        const room = this.rooms.get(matchId);
        const index = room ? room.indexOf(playerId) : -1;
        if (index < 0 || room.kind !== 'challenge' || !room.ended) {
            connection.sendError(LiveError.UNKNOWN_MATCH);
            return;
        }
        const opponent = room.playerIds[1 - index];
        if (!this.online(opponent)) {
            connection.sendError(LiveError.PLAYER_OFFLINE);
            return;
        }
        if (this.busy(playerId) || this.busy(opponent)) {
            connection.sendError(LiveError.ALREADY_IN_MATCH);
            return;
        }
        const [from, to] = await Promise.all([this.playerSetup(playerId), this.playerSetup(opponent)]);
        const invite = {
            id: newId(),
            kind: 'challenge',
            from: playerId,
            to: opponent,
            expiresAt: this.clock.now() + this.config.inviteTtlMs,
        };
        invite.timer = this.clock.setTimer(() => this.closeInvite(invite.id, InviteClosedReason.EXPIRED), this.config.inviteTtlMs);
        this.invites.set(invite.id, invite);
        connection.send({ type: ServerMessage.INVITE_SENT, invite: { id: invite.id, to: to.name, expiresAt: invite.expiresAt } });
        this.connections.get(opponent).send({
            type: ServerMessage.INVITE,
            invite: { id: invite.id, from: from.name, expiresAt: invite.expiresAt, rematch: true },
        });
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
        [invite.from, invite.to].forEach(playerId => {
            this.leaveQueue(playerId, false);
            this.challenges.cancelOwn(playerId);
        });
        await this.startBetween(invite.kind, invite.from, invite.to);
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
