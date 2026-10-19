// Tick-driven agents for the real-time engine. An agent only sees its player's view and
// returns at most one action per decision; the host wakes it every reactionTimeMs of match
// time and fills in the player index and the time.

const { EntityType, AttackType, isDonut } = require('../constants');
const { MatchPhase, MatchActionTypes, BUILDABLE, WeaponState, weaponStatus } = require('./index');
const rng = require('./rng');

class Agent {
    /**
     * @param {object} options
     * @param {0|1} options.playerIndex
     * @param {string|number} options.seed seed of the agent's own decisions
     * @param {number} [options.reactionTimeMs] match time between two decisions
     */
    constructor({ playerIndex, seed, reactionTimeMs = 1000 }) {
        this.playerIndex = playerIndex;
        this.seed = seed;
        this.reactionTimeMs = reactionTimeMs;
        this.random = { rng: rng.seedFrom(seed) };
    }

    /** Seeded random number in [0, 1) from the agent's own generator. */
    nextRandom() {
        return rng.next(this.random);
    }

    pick(list) {
        return rng.pick(this.random, list);
    }

    /** Match time until the next decision; override for varying reaction times. */
    nextReactionTime() {
        return this.reactionTimeMs;
    }

    /** Plain data the agent needs to continue after a save (memory, moods); override when stateful. */
    exportState() {
        return {};
    }

    importState() {}

    /** Returns { type, payload } or null. Override in subclasses. */
    decide() {
        return null;
    }

    ownGrid(view) {
        return view.board.fields[view.players[this.playerIndex].fieldIndex].grid;
    }

    opponentGrid(view) {
        return view.board.fields[view.players[1 - this.playerIndex].fieldIndex].grid;
    }

    // ready or rushable weapons of the agent, grouped by attack type
    weaponStates(view, t) {
        const states = {};
        this.ownGrid(view).forEach(cell => cell.occupiedBy.forEach(entity => (entity.weapons || []).forEach(weapon => {
            const status = weaponStatus(view, weapon, t);
            const best = states[weapon.attackType];
            if (!best || status.progress > best.progress) {
                states[weapon.attackType] = status;
            }
        })));
        return states;
    }
}

// Plays random but mostly valid moves. Used by the simulation script and property tests.
class RandomBot extends Agent {
    decide(view, t) {
        const me = view.players[this.playerIndex];
        if (view.phase === MatchPhase.FIELD_CHOICE) {
            return view.fieldChooser === this.playerIndex
                ? { type: MatchActionTypes.chooseField, payload: { fieldIndex: rng.nextInt(this.random, 2) } }
                : null;
        }
        if (view.phase === MatchPhase.PLACEMENT) {
            const grid = this.ownGrid(view);
            if (grid.some(cell => cell.occupiedBy.some(entity => entity.type === EntityType.FACTORY))) {
                return null;
            }
            const candidates = grid.filter(cell => !cell.molten && cell.occupiedBy.every(entity => entity.type === EntityType.CREAM || isDonut(entity.type)));
            const cell = rng.pick(this.random, candidates);
            return { type: MatchActionTypes.placeFactory, payload: { row: cell.row, col: cell.col } };
        }
        if (view.phase !== MatchPhase.RUNNING) {
            return null;
        }

        const options = [];
        if (me.donuts.length > 0) {
            const free = this.ownGrid(view).filter(cell => !cell.molten && !cell.occupiedBy.some(entity => isDonut(entity.type)));
            if (free.length > 0) {
                const cell = rng.pick(this.random, free);
                options.push({ type: MatchActionTypes.placeDonut, payload: { donutType: me.donuts[0].type, row: cell.row, col: cell.col } });
            }
        }
        if (me.buildTokens > 0) {
            const affordable = BUILDABLE.filter(type => (view.balance.entities[type].costs || 0) <= me.cacao);
            if (affordable.length > 0) {
                const cell = rng.pick(this.random, this.ownGrid(view));
                options.push({ type: MatchActionTypes.build, payload: { entityType: rng.pick(this.random, affordable), row: cell.row, col: cell.col } });
            }
        }
        const weapons = this.weaponStates(view, t);
        Object.entries(weapons).forEach(([attackType, status]) => {
            const usable = status.state === WeaponState.READY || (status.state === WeaponState.RUSHABLE && me.cacao >= status.rushCost);
            if (!usable || t < me.stunnedUntil) {
                return;
            }
            const targets = this.opponentGrid(view).filter(cell => !cell.molten &&
                (attackType === AttackType.BUNNY || attackType === AttackType.HOT_CHOCOLATE || cell.occupiedBy.length > 0));
            if (targets.length > 0) {
                const cell = rng.pick(this.random, targets);
                options.push({ type: MatchActionTypes.attack, payload: { attackType, row: cell.row, col: cell.col, allowRush: true } });
            }
        });
        return options.length > 0 ? rng.pick(this.random, options) : null;
    }
}

/**
 * Plays a match between two agents with the engine as the host, waking each agent every
 * reactionTimeMs. Returns the final match. Throws if the engine throws (not on invalid actions).
 * `onStep(match)` (optional) runs after every agent decision, e.g. to sample statistics.
 */
const playMatch = (engine, getPlayerView, match, agents, { maxTime, onStep } = {}) => {
    const limit = typeof maxTime === 'number' ? maxTime : match.balance.match.timeLimitMs * 2;
    const wakeAt = agents.map(agent => agent.reactionTimeMs * (agent.playerIndex + 1) / 2);
    const stats = { actions: 0, rejected: 0 };
    while (match.phase !== MatchPhase.ENDED && match.t < limit) {
        const index = wakeAt[0] <= wakeAt[1] ? 0 : 1;
        const t = Math.max(match.t, wakeAt[index]);
        engine.advanceTo(match, t);
        const decision = agents[index].decide(getPlayerView(match, index), t);
        if (decision) {
            const result = engine.applyAction(match, { ...decision, player: index, t });
            stats.actions += 1;
            if (!result.ok) {
                stats.rejected += 1;
            }
        }
        wakeAt[index] = t + agents[index].nextReactionTime();
        if (onStep) {
            onStep(match);
        }
    }
    return { match, stats };
};

module.exports = { Agent, RandomBot, playMatch };
