// A small Node client of the live service: used by the tests and by scripts/live-bots.js,
// which lets shared AI agents play real matches against a running server.

const WebSocket = require('ws');
const { engine, live } = require('@battlechoc/battlechoc-shared-functions');

const { ClientMessage, ServerMessage } = live;

class LiveClient {
    constructor(url, { wsOptions } = {}) {
        this.url = url;
        this.wsOptions = wsOptions;
        this.buffer = [];
        this.waiters = [];
        this.views = new Map();
        this.matches = new Map();
        this.nextUid = 1;
        this.closed = null;
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.url, this.wsOptions);
            this.ws.on('open', () => resolve(this));
            this.ws.on('error', reject);
            this.ws.on('close', (code, reason) => {
                this.closed = { code, reason: reason.toString() };
                this.flush();
            });
            this.ws.on('message', data => this.receive(JSON.parse(data.toString())));
        });
    }

    async hello(token) {
        this.send({ type: ClientMessage.HELLO, token });
        this.welcome = await this.next(ServerMessage.WELCOME);
        return this.welcome;
    }

    send(message) {
        this.ws.send(JSON.stringify(message));
    }

    receive(message) {
        if (message.type === ServerMessage.VIEW) {
            this.views.set(message.matchId, message);
        } else if (message.type === ServerMessage.MATCH) {
            this.matches.set(message.matchId, message);
        }
        this.buffer.push(message);
        this.flush();
    }

    flush() {
        this.waiters = this.waiters.filter(waiter => {
            const index = this.buffer.findIndex(waiter.matches);
            if (index >= 0) {
                waiter.resolve(this.buffer.splice(index, 1)[0]);
                return false;
            }
            if (this.closed) {
                waiter.reject(new Error(`connection closed (${this.closed.code}) while waiting for ${waiter.description}`));
                return false;
            }
            return true;
        });
    }

    /** Resolves with (and removes) the next buffered or arriving message of a type. */
    next(type, predicate = () => true, timeoutMs = 3000) {
        return new Promise((resolve, reject) => {
            const waiter = {
                description: type,
                matches: message => message.type === type && predicate(message),
            };
            const timer = setTimeout(() => {
                this.waiters = this.waiters.filter(other => other !== waiter);
                reject(new Error(`timeout waiting for ${type}`));
            }, timeoutMs);
            waiter.resolve = message => {
                clearTimeout(timer);
                resolve(message);
            };
            waiter.reject = error => {
                clearTimeout(timer);
                reject(error);
            };
            this.waiters.push(waiter);
            this.flush();
        });
    }

    /** Sends a match action; resolves with its ack. */
    act(matchId, type, payload = {}, uid = `u${this.nextUid++}`) {
        this.send({ type: ClientMessage.INTENT, matchId, uid, action: { type, payload } });
        return this.next(ServerMessage.ACK, message => message.uid === uid);
    }

    view(matchId) {
        const message = this.views.get(matchId);
        return message && message.view;
    }

    close() {
        this.ws.close();
    }

    terminate() {
        this.ws.terminate();
    }
}

/**
 * Plays a match with a shared agent: whenever the agent is due, it decides on the latest
 * view and the client sends the decision as an intent.
 */
class AgentPlayer {
    constructor(client, matchId, agent) {
        this.client = client;
        this.matchId = matchId;
        this.agent = agent;
        this.sent = 0;
        this.rejected = 0;
    }

    async step(t) {
        const view = this.client.view(this.matchId);
        if (!view || view.phase === engine.MatchPhase.ENDED || this.agent.wakeAt > t) {
            return;
        }
        const decision = this.agent.decide(view, t);
        this.agent.wakeAt = t + this.agent.nextReactionTime();
        if (decision) {
            this.sent += 1;
            const ack = await this.client.act(this.matchId, decision.type, decision.payload);
            if (!ack.ok) {
                this.rejected += 1;
            }
        }
    }
}

module.exports = { LiveClient, AgentPlayer };
