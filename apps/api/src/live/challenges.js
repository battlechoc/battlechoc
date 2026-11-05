// Challenge links (2026-11, docs/superpowers/specs/2026-11-04-challenge-link-design.md): a player
// creates a challenge and shares its code as a link; whoever opens it reads the challenge card, and
// the first to accept plays a challenge match against the challenger. Kept in memory like the queue
// and the invites: a restart of the server ends the waiting challenges.
//
// States (ChallengeState): WAITING (2 minutes for someone to open the link), READING (a friend has
// the card open: no expiry, up to challengeReadCapMs), ACCEPTED (a friend accepted while the
// challenger was away, e.g. in the chat app), STARTED (the match runs), and the ended ones that
// "Send again" can renew for challengeKeepMs: EXPIRED, DECLINED, MISSED.

const crypto = require('crypto');
const { live } = require('@battlechoc/battlechoc-shared-functions');
const players = require('../players');

const { ServerMessage, LiveError, ChallengeState: State, ChallengeViewState: View, newChallengeCode, normalizeChallengeCode } = live;

const RENEWABLE = [State.EXPIRED, State.DECLINED, State.MISSED];

class Challenges {
    constructor({ lobby, clock, config, pool }) {
        this.lobby = lobby;
        this.clock = clock;
        this.config = config;
        this.pool = pool;
        // code -> challenge, challenger's playerId -> their challenge
        this.byCode = new Map();
        this.byPlayer = new Map();
    }

    /* ---------- messages ---------- */

    payload(challenge) {
        return {
            code: challenge.code,
            state: challenge.state,
            expiresAt: challenge.state === State.WAITING ? challenge.expiresAt : null,
            readers: challenge.readers.size,
        };
    }

    notifyChallenger(challenge) {
        const connection = this.lobby.connections.get(challenge.from);
        if (connection) {
            connection.send({ type: ServerMessage.CHALLENGE, challenge: this.payload(challenge) });
        }
    }

    sendView(playerId, view) {
        const connection = this.lobby.connections.get(playerId);
        if (connection) {
            connection.send({ type: ServerMessage.CHALLENGE_VIEW, view });
        }
    }

    viewOf(challenge, state, extra = {}) {
        return { code: challenge.code, state, from: challenge.fromName, ...extra };
    }

    /* ---------- timers and states ---------- */

    setTimer(challenge, ms, callback) {
        this.clearTimer(challenge);
        challenge.timer = this.clock.setTimer(callback, ms);
    }

    clearTimer(challenge) {
        if (challenge.timer !== null) {
            this.clock.clearTimer(challenge.timer);
            challenge.timer = null;
        }
    }

    // waiting for someone to open the link, with a fresh 2 minutes
    wait(challenge) {
        challenge.state = State.WAITING;
        challenge.expiresAt = this.clock.now() + this.config.challengeTtlMs;
        this.setTimer(challenge, this.config.challengeTtlMs, () => this.expire(challenge));
        this.notifyChallenger(challenge);
    }

    expire(challenge) {
        this.dropReaders(challenge, View.ENDED);
        challenge.state = State.EXPIRED;
        this.keep(challenge);
        this.notifyChallenger(challenge);
    }

    // an ended challenge stays renewable for a while, then it is gone
    keep(challenge) {
        this.setTimer(challenge, this.config.challengeKeepMs, () => this.remove(challenge));
    }

    remove(challenge) {
        this.clearTimer(challenge);
        this.dropReaders(challenge, null);
        this.byCode.delete(challenge.code);
        if (this.byPlayer.get(challenge.from) === challenge) {
            this.byPlayer.delete(challenge.from);
        }
    }

    // tells every reader (unless state is null) and forgets them
    dropReaders(challenge, state) {
        challenge.readers.forEach((graceTimer, playerId) => {
            if (graceTimer !== null) {
                this.clock.clearTimer(graceTimer);
            }
            if (state !== null) {
                this.sendView(playerId, this.viewOf(challenge, state));
            }
        });
        challenge.readers.clear();
    }

    // ends a challenge that has not started: everyone with the card open sees it ended
    end(challenge) {
        if (challenge.acceptedBy !== null) {
            this.sendView(challenge.acceptedBy, this.viewOf(challenge, View.ENDED));
        }
        this.dropReaders(challenge, View.ENDED);
        this.remove(challenge);
    }

    /* ---------- the challenger ---------- */

    async create(connection) {
        const { playerId } = connection;
        const existing = this.byPlayer.get(playerId);
        if (existing && RENEWABLE.includes(existing.state)) {
            this.wait(existing);
            return;
        }
        if (existing && existing.state !== State.STARTED) {
            this.notifyChallenger(existing);
            return;
        }
        const setup = await this.lobby.playerSetup(playerId);
        if (!setup) {
            return;
        }
        let code;
        do {
            code = newChallengeCode(max => crypto.randomInt(max));
        } while (this.byCode.has(code));
        const challenge = {
            code,
            from: playerId,
            fromName: setup.name,
            language: setup.language,
            state: null,
            expiresAt: null,
            // reader's playerId -> the timer that removes them after they went away (null while connected)
            readers: new Map(),
            acceptedBy: null,
            matchId: null,
            timer: null,
        };
        this.byCode.set(code, challenge);
        this.byPlayer.set(playerId, challenge);
        this.wait(challenge);
    }

    ownChallenge(connection, code) {
        const challenge = this.byCode.get(normalizeChallengeCode(code));
        if (!challenge || challenge.from !== connection.playerId) {
            connection.sendError(LiveError.CHALLENGE_NOT_FOUND);
            return null;
        }
        return challenge;
    }

    /** "Send again": the same code waits another 2 minutes. */
    renew(connection, code) {
        const challenge = this.ownChallenge(connection, code);
        if (!challenge) {
            return;
        }
        if (RENEWABLE.includes(challenge.state)) {
            this.wait(challenge);
        } else {
            this.notifyChallenger(challenge);
        }
    }

    cancel(connection, code) {
        const challenge = this.ownChallenge(connection, code);
        if (challenge && challenge.state !== State.STARTED) {
            this.end(challenge);
            connection.send({ type: ServerMessage.CHALLENGE, challenge: null });
        }
    }

    /** The challenger starts something else (Start, the AI, a rematch): their challenge ends. */
    cancelOwn(playerId) {
        const challenge = this.byPlayer.get(playerId);
        if (challenge && challenge.state !== State.STARTED) {
            this.end(challenge);
            const connection = this.lobby.connections.get(playerId);
            if (connection) {
                connection.send({ type: ServerMessage.CHALLENGE, challenge: null });
            }
        }
    }

    /* ---------- friends ---------- */

    // the view of a challenge that cannot be played (null: it can)
    closedView(challenge, playerId) {
        if (challenge.from === playerId) {
            return View.OWN;
        }
        if (challenge.state === State.STARTED) {
            return View.TAKEN;
        }
        if (RENEWABLE.includes(challenge.state)) {
            return View.ENDED;
        }
        if (challenge.state === State.ACCEPTED) {
            return challenge.acceptedBy === playerId ? View.WAITING_FOR_CHALLENGER : View.TAKEN;
        }
        if (this.lobby.busy(playerId)) {
            return View.BUSY;
        }
        return null;
    }

    async open(connection, rawCode) {
        const { playerId } = connection;
        const code = normalizeChallengeCode(rawCode);
        if (!code || !this.byCode.has(code)) {
            connection.send({ type: ServerMessage.CHALLENGE_VIEW, view: { code, state: View.ENDED } });
            return;
        }
        // a newcomer plays under a name of their own, chosen for them (shown on the card)
        const name = this.byCode.get(code).from === playerId ? null : await players.assignRandomName(this.pool, playerId);
        // the challenge may have changed while the name was written
        const challenge = this.byCode.get(code);
        if (!challenge) {
            connection.send({ type: ServerMessage.CHALLENGE_VIEW, view: { code, state: View.ENDED } });
            return;
        }
        const closed = this.closedView(challenge, playerId);
        if (closed !== null) {
            this.sendView(playerId, this.viewOf(challenge, closed));
            return;
        }
        const graceTimer = challenge.readers.get(playerId);
        if (graceTimer) {
            this.clock.clearTimer(graceTimer);
        }
        challenge.readers.set(playerId, null);
        if (challenge.state === State.WAITING) {
            // no expiry while someone reads the card, up to the cap
            challenge.state = State.READING;
            this.setTimer(challenge, this.config.challengeReadCapMs, () => this.expire(challenge));
        }
        this.notifyChallenger(challenge);
        this.sendView(playerId, this.viewOf(challenge, View.OPEN, { name }));
    }

    async accept(connection, rawCode) {
        const { playerId } = connection;
        const challenge = this.byCode.get(normalizeChallengeCode(rawCode));
        if (!challenge) {
            connection.send({ type: ServerMessage.CHALLENGE_VIEW, view: { code: normalizeChallengeCode(rawCode), state: View.ENDED } });
            return;
        }
        if (challenge.acceptedBy === playerId) {
            // a second tap or a resend: the first accept counts
            return;
        }
        const closed = this.closedView(challenge, playerId);
        if (closed !== null) {
            this.sendView(playerId, this.viewOf(challenge, closed));
            return;
        }
        const graceTimer = challenge.readers.get(playerId);
        if (graceTimer) {
            this.clock.clearTimer(graceTimer);
        }
        challenge.readers.delete(playerId);
        challenge.acceptedBy = playerId;
        if (this.lobby.online(challenge.from) && !this.lobby.busy(challenge.from)) {
            await this.start(challenge);
            return;
        }
        // the challenger is away (sharing the link in a chat app): the match starts when they are back
        challenge.state = State.ACCEPTED;
        this.setTimer(challenge, this.config.challengeAwayMs, () => this.missed(challenge));
        this.sendView(playerId, this.viewOf(challenge, View.WAITING_FOR_CHALLENGER));
        this.notifyChallenger(challenge);
    }

    decline(connection, rawCode) {
        const challenge = this.byCode.get(normalizeChallengeCode(rawCode));
        if (!challenge || !challenge.readers.has(connection.playerId)) {
            return;
        }
        const graceTimer = challenge.readers.get(connection.playerId);
        if (graceTimer) {
            this.clock.clearTimer(graceTimer);
        }
        challenge.readers.delete(connection.playerId);
        // with others still reading, the challenge goes on for them
        if (challenge.readers.size === 0 && challenge.state === State.READING) {
            challenge.state = State.DECLINED;
            this.keep(challenge);
        }
        this.notifyChallenger(challenge);
    }

    // the friend who accepted gave up waiting for the away challenger
    missed(challenge) {
        this.sendView(challenge.acceptedBy, this.viewOf(challenge, View.CHALLENGER_AWAY));
        challenge.acceptedBy = null;
        challenge.state = State.MISSED;
        this.keep(challenge);
        this.notifyChallenger(challenge);
    }

    async start(challenge) {
        this.clearTimer(challenge);
        challenge.state = State.STARTED;
        // everyone else who has the card open: the match is already on
        this.dropReaders(challenge, View.TAKEN);
        [challenge.from, challenge.acceptedBy].forEach(playerId => this.lobby.leaveQueue(playerId, false));
        await this.lobby.startBetween('challenge', challenge.from, challenge.acceptedBy);
        challenge.matchId = this.lobby.activeMatch.get(challenge.from) || null;
        if (challenge.matchId === null) {
            // the match could not be set up
            this.remove(challenge);
        }
    }

    /** The match of a started challenge ended: later openers find it ended. */
    matchEnded(matchId) {
        this.byCode.forEach(challenge => {
            if (challenge.matchId === matchId) {
                this.remove(challenge);
            }
        });
    }
}

module.exports = { Challenges };
