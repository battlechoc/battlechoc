#!/usr/bin/env node
// Lets shared AI agents play live matches against a running server, e.g. staging:
//
//   node scripts/live-bots.js https://api.example.com [pairs=1] [agent=RandomBot]
//
// Each bot creates a device account, joins the matchmaking queue and plays until its match
// ends. Two bots of a pair find each other in the queue (start them within 30 s, otherwise
// the server's AI fallback steps in). Prints the outcome and the round trip of the actions.

const { engine, live } = require('@battlechoc/battlechoc-shared-functions');
const { LiveClient, AgentPlayer } = require('../src/live/client');

const { ClientMessage, ServerMessage, ClockSync } = live;

const [base = 'http://localhost:8080', pairs = '1', kind = 'RandomBot'] = process.argv.slice(2);
const wsUrl = base.replace(/^http/, 'ws').replace(/\/$/, '') + '/live';

const createAccount = async () => {
    const response = await fetch(base.replace(/\/$/, '') + '/accounts', { method: 'POST' });
    if (!response.ok) {
        throw new Error(`account creation failed: ${response.status}`);
    }
    return response.json();
};

const percentile = (values, p) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.length > 0 ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : NaN;
};

const playOne = async name => {
    const { accessToken } = await createAccount();
    const client = await new LiveClient(wsUrl).connect();
    await client.hello(accessToken);
    const clock = new ClockSync({ now: () => performance.now() });
    const pinger = setInterval(() => client.send({ type: ClientMessage.PING, id: 0, clientT: performance.now() }), live.LiveDefaults.pingIntervalMs);
    client.ws.on('message', data => {
        const message = JSON.parse(data.toString());
        if (message.type === ServerMessage.PONG) {
            clock.sample(message.clientT, message.serverT);
        } else if (message.serverT) {
            clock.observe(message.serverT);
        }
    });
    client.send({ type: ClientMessage.PING, id: 0, clientT: performance.now() });
    client.send({ type: ClientMessage.QUEUE_JOIN });
    const match = await client.next(ServerMessage.MATCH, () => true, 120000);
    console.log(`${name}: match ${match.matchId} as player ${match.playerIndex} against ${match.opponent.name}`);
    const agent = engine.createAgent({ kind, playerIndex: match.playerIndex, seed: `${name}-${Date.now()}` });
    const player = new AgentPlayer(client, match.matchId, agent);
    const latencies = [];
    const act = client.act.bind(client);
    client.act = async (...args) => {
        const sent = performance.now();
        const ack = await act(...args);
        latencies.push(performance.now() - sent);
        return ack;
    };
    const result = client.next(ServerMessage.RESULT, () => true, 15 * 60 * 1000);
    const loop = setInterval(() => {
        player.step(clock.matchTime(client.matches.get(match.matchId).epoch)).catch(error => console.warn(name, error.message));
    }, 200);
    const { result: outcome } = await result;
    clearInterval(loop);
    clearInterval(pinger);
    client.close();
    console.log(`${name}: ${outcome.won ? 'won' : outcome.draw ? 'draw' : 'lost'} (${outcome.reason}), ${outcome.coins} coins, ` +
        `${player.sent} actions (${player.rejected} rejected), ack p50 ${Math.round(percentile(latencies, 0.5))} ms, ` +
        `p95 ${Math.round(percentile(latencies, 0.95))} ms, clock rtt ${Math.round(clock.rtt)} ms`);
};

Promise.all(Array.from({ length: Number(pairs) * 2 }, (_, i) => playOne(`bot${i + 1}`)))
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
