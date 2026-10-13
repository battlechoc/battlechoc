// Helpers for match hosts (the single player host in the PWA, the live match server): AI
// agents from plain descriptors and back, so a host can save a match with its AIs (IndexedDB,
// Postgres) and continue it, plus the agent step and the next wakeup of a host.

const { MatchPhase, applyAction, nextTimerAt } = require('./index');
const { getPlayerView } = require('./view');
const { RandomBot } = require('./agents');
const { TomToffee } = require('./ai/tomToffee');
const { GustavGanache } = require('./ai/gustavGanache');
const { ScriptedAgent } = require('./ai/scripted');

const agentKinds = { RandomBot, TomToffee, GustavGanache, ScriptedAgent };

/**
 * @param {object} descriptor
 * @param {string} descriptor.kind one of agentKinds
 * @param {0|1} descriptor.playerIndex
 * @param {string} descriptor.seed
 * @param {number} [descriptor.reactionTimeMs]
 * @param {object} [descriptor.options] constructor options, e.g. { handicap }
 * @param {number} [descriptor.rng] state of the agent's random generator (restore)
 * @param {number} [descriptor.wakeAt] match time of the next decision (restore)
 * @param {object} [descriptor.state] exportState() of the agent (restore)
 */
const createAgent = ({ kind, playerIndex, seed, reactionTimeMs, options, rng, wakeAt, state }) => {
    const AgentClass = agentKinds[kind];
    if (!AgentClass) {
        throw new Error('Unknown agent kind ' + kind);
    }
    const agent = new AgentClass({ playerIndex, seed, reactionTimeMs, ...(options || {}) });
    agent.kind = kind;
    agent.options = options;
    if (typeof rng === 'number') {
        agent.random.rng = rng;
    }
    if (typeof state !== 'undefined') {
        agent.importState(state);
    }
    agent.wakeAt = typeof wakeAt === 'number' ? wakeAt : agent.reactionTimeMs;
    return agent;
};

const serializeAgent = agent => ({
    kind: agent.kind,
    playerIndex: agent.playerIndex,
    seed: agent.seed,
    reactionTimeMs: agent.reactionTimeMs,
    options: agent.options,
    rng: agent.random.rng,
    wakeAt: agent.wakeAt,
    state: structuredClone(agent.exportState()),
});

/**
 * Lets every agent whose wakeup is due decide on its view at the match's current time and
 * applies the decision. Returns the applied actions (for an action log). Rejected decisions
 * and errors thrown by an agent are reported to onRejected and otherwise ignored.
 */
const runDueAgents = (match, agents, { onRejected = () => {} } = {}) => {
    const t = match.t;
    const applied = [];
    agents.filter(agent => agent.wakeAt <= t).forEach(agent => {
        if (match.phase !== MatchPhase.ENDED) {
            let decision = null;
            try {
                decision = agent.decide(getPlayerView(match, agent.playerIndex), t);
            } catch (error) {
                // a broken AI must not stop the match: it skips this decision
                onRejected(error, null);
            }
            if (decision) {
                const action = { type: decision.type, payload: decision.payload, player: agent.playerIndex, t };
                const result = applyAction(match, action);
                if (result.ok) {
                    applied.push(action);
                } else {
                    onRejected(result.error, action);
                }
            }
        }
        agent.wakeAt = t + agent.nextReactionTime();
    });
    return applied;
};

/** Match time at which the host has to wake up next (a timer or an agent), or null. */
const nextWakeAt = (match, agents = []) => {
    if (match.phase === MatchPhase.ENDED) {
        return null;
    }
    const candidates = [nextTimerAt(match), ...agents.map(agent => agent.wakeAt)].filter(value => typeof value === 'number');
    return candidates.length > 0 ? Math.min(...candidates) : null;
};

module.exports = { agentKinds, createAgent, serializeAgent, runDueAgents, nextWakeAt };
