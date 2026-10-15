// One running live match. The room is the single writer of its match (§3.2 of the migration
// plan): it stamps the match time on every action, applies it with the shared engine, lets
// the AI act, persists the action log and pushes each player their own redacted view.

const { engine, live, WeaponNotReadyError, PlayerType } = require('@battlechoc/battlechoc-shared-functions');
const { sanitizeIntent } = require('./intents');

const { ServerMessage, LiveError } = live;
const MAX_TIMER_MS = 60000;
const REMEMBERED_UIDS = 64;

const errorInfo = error => ({
    code: LiveError.ACTION_REJECTED,
    name: error && error.constructor ? error.constructor.name : 'Error',
    message: error && error.message,
});

class MatchRoom {
    /**
     * @param {object} options
     * @param {string} options.id
     * @param {string} options.kind queue, invite or ai
     * @param {Array<string|null>} options.playerIds account per match player, null for an AI
     * @param {object} options.match engine state
     * @param {object[]} options.agents engine agents of the AI players
     * @param {number} options.seq last action log sequence number
     * @param {object} options.clock see clock.js
     * @param {object} options.store see store.js
     * @param {object} options.config LiveDefaults plus overrides
     * @param {(room: MatchRoom) => void} options.onEnded
     */
    constructor({ id, kind, playerIds, match, agents, seq = 0, clock, store, config, log, onEnded }) {
        this.id = id;
        this.kind = kind;
        this.playerIds = playerIds;
        this.match = match;
        this.agents = agents;
        this.seq = seq;
        this.snapshotSeq = seq;
        this.clock = clock;
        this.store = store;
        this.config = config;
        this.log = log;
        this.onEnded = onEnded;
        // server clock at match time 0; after a restart the downtime does not count
        this.epoch = clock.now() - match.t;
        this.members = [new Set(), new Set()];
        this.forfeitTimers = [null, null];
        this.forfeitAt = [null, null];
        this.buckets = [0, 1].map(() => ({ tokens: config.intentsPerSecond, at: clock.now() }));
        this.acks = [new Map(), new Map()];
        this.timer = null;
        this.ended = false;
        this.lastPhase = match.phase;
        this.reachedT = match.t;
        this.writes = Promise.resolve();
    }

    static async create({ id, kind, players, boardSize, seed, agents = [], store, ...rest }) {
        const match = engine.createMatch({
            players: players.map(({ id: publicId, name, type, level }) => ({ id: publicId, name, type, level })),
            boardSize,
            seed,
        });
        const room = new MatchRoom({
            id,
            kind,
            playerIds: players.map(player => player.playerId || null),
            match,
            agents: agents.map(descriptor => engine.createAgent(descriptor)),
            store,
            ...rest,
        });
        await store.create({ id, kind, playerIds: room.playerIds, snapshot: room.snapshot() });
        room.schedule();
        return room;
    }

    /** Rebuilds a running match from its snapshot and the actions logged after it. */
    static restore({ row, actions, ...rest }) {
        const match = row.snapshot.match;
        actions.forEach(({ action }) => {
            const result = engine.applyAction(match, action);
            if (!result.ok) {
                throw new Error(`replay of match ${row.id} failed: ${result.error.message}`);
            }
        });
        if (row.reached_t > match.t) {
            engine.advanceTo(match, row.reached_t);
        }
        const room = new MatchRoom({
            id: row.id,
            kind: row.kind,
            playerIds: row.player_ids,
            match,
            agents: row.snapshot.agents.map(descriptor => engine.createAgent(descriptor)),
            seq: actions.length > 0 ? actions[actions.length - 1].seq : row.snapshot_seq,
            ...rest,
        });
        room.snapshotSeq = row.snapshot_seq;
        // nobody is connected yet: the usual grace period applies to everyone
        room.humanIndexes().forEach(index => room.startForfeitTimer(index));
        room.schedule();
        return room;
    }

    humanIndexes() {
        return [0, 1].filter(index => this.playerIds[index] !== null);
    }

    indexOf(playerId) {
        return this.playerIds.indexOf(playerId);
    }

    now() {
        return Math.max(this.match.t, this.clock.now() - this.epoch);
    }

    snapshot() {
        return {
            match: structuredClone(this.match),
            agents: this.agents.map(agent => engine.serializeAgent(agent)),
        };
    }

    /* ---------- connections and presence ---------- */

    /**
     * Adds a connection of a player. lastSeq: the last event the client has seen; without it
     * the client gets the current view without the old events (no replayed animations).
     */
    attach(index, connection, lastSeq) {
        this.members[index].add(connection);
        connection.lastSeqByMatch.set(this.id, Number.isInteger(lastSeq) ? lastSeq : this.latestSeq());
        connection.send({
            type: ServerMessage.MATCH,
            matchId: this.id,
            playerIndex: index,
            epoch: this.epoch,
            opponent: { name: this.match.players[1 - index].name, type: this.match.players[1 - index].type },
        });
        if (this.forfeitTimers[index] !== null) {
            this.clock.clearTimer(this.forfeitTimers[index]);
            this.forfeitTimers[index] = null;
            this.forfeitAt[index] = null;
            this.broadcastPresence(index);
        }
        const opponent = 1 - index;
        if (this.forfeitAt[opponent] !== null) {
            connection.send(this.presenceMessage(opponent));
        }
        this.publishTo(index, connection);
    }

    detach(index, connection) {
        if (!this.members[index].delete(connection)) {
            return;
        }
        connection.lastSeqByMatch.delete(this.id);
        if (this.members[index].size === 0 && !this.ended) {
            this.startForfeitTimer(index);
            this.broadcastPresence(index);
        }
    }

    startForfeitTimer(index) {
        if (this.forfeitTimers[index] !== null) {
            return;
        }
        this.forfeitAt[index] = this.clock.now() + this.config.disconnectGraceMs;
        this.forfeitTimers[index] = this.clock.setTimer(() => this.forfeit(index), this.config.disconnectGraceMs);
    }

    // an offline player loses; while both humans are gone nobody does (the time limit ends it)
    forfeit(index) {
        this.forfeitTimers[index] = null;
        if (this.ended) {
            return;
        }
        const opponent = 1 - index;
        if (this.playerIds[opponent] !== null && this.members[opponent].size === 0) {
            // check again later: whoever comes back first wins if the other one stays away
            this.startForfeitTimer(index);
            return;
        }
        const t = this.now();
        const action = { type: engine.MatchActionTypes.surrender, player: index, t, payload: {} };
        const result = engine.applyAction(this.match, action);
        if (result.ok) {
            this.record(action);
        }
        this.afterChange();
    }

    presenceMessage(index) {
        return {
            type: ServerMessage.PRESENCE,
            matchId: this.id,
            player: index,
            online: this.forfeitAt[index] === null,
            forfeitAt: this.forfeitAt[index],
        };
    }

    broadcastPresence(index) {
        const message = this.presenceMessage(index);
        this.members[1 - index].forEach(connection => connection.send(message));
    }

    /* ---------- actions ---------- */

    takeToken(index) {
        const bucket = this.buckets[index];
        const now = this.clock.now();
        const rate = this.config.intentsPerSecond;
        bucket.tokens = Math.min(rate, bucket.tokens + ((now - bucket.at) * rate) / 1000);
        bucket.at = now;
        if (bucket.tokens < 1) {
            return false;
        }
        bucket.tokens -= 1;
        return true;
    }

    /**
     * A match action from a player's connection. The player is the connection's, never a
     * field of the message, and the time is the server's. Answers with an ack.
     */
    submit(index, connection, message) {
        const uid = typeof message.uid === 'string' ? message.uid.slice(0, 64) : null;
        const reply = ack => {
            const full = { type: ServerMessage.ACK, matchId: this.id, uid, ...ack };
            connection.send(full);
            return full;
        };
        if (uid !== null && this.acks[index].has(uid)) {
            connection.send(this.acks[index].get(uid));
            return;
        }
        if (!this.takeToken(index)) {
            reply({ ok: false, error: { code: LiveError.RATE_LIMITED } });
            return;
        }
        const intent = sanitizeIntent(message.action, this.match.board.size);
        if (!intent) {
            reply({ ok: false, error: { code: LiveError.BAD_MESSAGE } });
            return;
        }
        const action = { type: intent.type, player: index, t: this.now(), payload: intent.payload };
        let result = engine.applyAction(this.match, action);
        if (!result.ok && result.error instanceof WeaponNotReadyError) {
            const at = this.earlyReadyAt(index, action);
            if (at !== null) {
                action.t = at;
                result = engine.applyAction(this.match, action);
            }
        }
        if (result.ok) {
            this.record(action);
        }
        const sent = reply(result.ok ? { ok: true } : { ok: false, error: errorInfo(result.error) });
        if (uid !== null) {
            this.acks[index].set(uid, sent);
            if (this.acks[index].size > REMEMBERED_UIDS) {
                this.acks[index].delete(this.acks[index].keys().next().value);
            }
        }
        this.afterChange();
    }

    // a shot that arrives slightly before the weapon is ready is applied when it is ready
    earlyReadyAt(index, action) {
        const tolerance = this.match.balance.match.earlyActionToleranceMs;
        const { attackType, allowRush } = action.payload;
        const times = engine.weaponsOf(this.match, index, attackType).map(({ weapon }) => {
            const status = engine.weaponStatus(this.match, weapon, action.t);
            return allowRush && status.rushableAt !== null ? status.rushableAt : status.readyAt;
        });
        const at = times.length > 0 ? Math.min(...times) : null;
        return at !== null && at > action.t && at - action.t <= tolerance ? at : null;
    }

    record(action) {
        this.seq += 1;
        const seq = this.seq;
        const logged = structuredClone(action);
        this.write(() => this.store.appendAction(this.id, seq, logged));
    }

    write(task) {
        this.writes = this.writes.then(task).catch(error => this.log.error(`match ${this.id}: write failed`, error));
        return this.writes;
    }

    runAgents() {
        engine.runDueAgents(this.match, this.agents, {
            onRejected: error => this.log.warn(`match ${this.id}: AI action rejected: ${error && error.message}`),
        }).forEach(action => this.record(action));
    }

    tick() {
        this.timer = null;
        if (this.ended) {
            return;
        }
        engine.advanceTo(this.match, this.now());
        this.afterChange();
    }

    afterChange() {
        this.runAgents();
        this.publish();
        if (this.match.phase === engine.MatchPhase.ENDED) {
            this.end();
            return;
        }
        if (this.match.phase !== this.lastPhase || this.seq - this.snapshotSeq >= this.config.snapshotEveryActions) {
            this.saveSnapshot();
        }
        if (this.match.t - this.reachedT >= this.config.saveReachedEveryMs) {
            this.reachedT = this.match.t;
            const t = this.match.t;
            this.write(() => this.store.reached(this.id, t));
        }
        this.lastPhase = this.match.phase;
        this.schedule();
    }

    saveSnapshot() {
        this.snapshotSeq = this.seq;
        const seq = this.seq;
        const snapshot = this.snapshot();
        return this.write(() => this.store.saveSnapshot(this.id, seq, snapshot));
    }

    schedule() {
        if (this.timer !== null) {
            this.clock.clearTimer(this.timer);
            this.timer = null;
        }
        const next = engine.nextWakeAt(this.match, this.agents);
        if (next === null || this.ended) {
            return;
        }
        const delay = Math.max(0, next - this.now());
        this.timer = this.clock.setTimer(() => this.tick(), Math.min(delay, MAX_TIMER_MS));
    }

    /* ---------- views ---------- */

    latestSeq() {
        const { events } = this.match;
        return events.length > 0 ? events[events.length - 1].seq : -1;
    }

    publishTo(index, connection) {
        const lastSeq = connection.lastSeqByMatch.get(this.id);
        const view = engine.getPlayerView(this.match, index, { eventsAfter: lastSeq });
        if (view.events.length > 0) {
            connection.lastSeqByMatch.set(this.id, view.events[view.events.length - 1].seq);
        }
        connection.send({ type: ServerMessage.VIEW, matchId: this.id, serverT: this.clock.now(), epoch: this.epoch, view });
    }

    publish() {
        [0, 1].forEach(index => this.members[index].forEach(connection => this.publishTo(index, connection)));
    }

    /* ---------- end ---------- */

    /** Outcome, awards and the track record of a human player of the ended match. */
    resultFor(index) {
        const { outcome } = this.match;
        const me = this.match.players[index];
        const opponent = this.match.players[1 - index];
        const won = outcome.winners.length === 1 && outcome.winners[0] === index;
        const draw = outcome.winners.length === 2;
        const awards = engine.computeMatchAwards(this.match, index).map(award => ({ key: award.key, xp: award.xp }));
        return {
            won,
            draw,
            lost: !won && !draw,
            reason: outcome.reason,
            awards,
            record: {
                ...structuredClone(me.statistics),
                id: this.id,
                online: true,
                won,
                lost: !won && !draw,
                opponent: { name: opponent.name, type: opponent.type, ai: opponent.type !== PlayerType.HUMAN },
                winners: outcome.winners.map(winner => ({
                    idx: winner,
                    id: this.match.players[winner].id,
                    name: this.match.players[winner].name,
                    type: this.match.players[winner].type,
                })),
                awards,
            },
        };
    }

    end() {
        if (this.ended) {
            return;
        }
        this.ended = true;
        [this.timer, ...this.forfeitTimers].forEach(timer => timer !== null && this.clock.clearTimer(timer));
        this.timer = null;
        this.forfeitTimers = [null, null];
        const seq = this.seq;
        const snapshot = this.snapshot();
        this.write(() => this.store.finish(this.id, seq, snapshot, this.match.outcome));
        this.onEnded(this);
    }

    /** Sends a message to all connections of a player. */
    sendTo(index, message) {
        this.members[index].forEach(connection => connection.send(message));
    }

    /** Stops the timers, e.g. on shutdown; the match continues after the restart. */
    async suspend() {
        [this.timer, ...this.forfeitTimers].forEach(timer => timer !== null && this.clock.clearTimer(timer));
        this.timer = null;
        this.forfeitTimers = [null, null];
        if (!this.ended) {
            await this.saveSnapshot();
        }
        await this.writes;
    }
}

module.exports = { MatchRoom };
