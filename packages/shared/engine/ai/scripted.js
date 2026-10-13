// Plays a fixed script of actions at given match times: [{ at, type, payload }]. Used by the
// tutorial demos, which show a building in a short, scripted match on the real engine.

const { Agent } = require('../agents');

class ScriptedAgent extends Agent {
    /**
     * @param {object} options
     * @param {Array<{at: number, type: string, payload: object}>} options.script sorted by `at`
     */
    constructor({ playerIndex, seed = 'script', reactionTimeMs = 100, script = [] }) {
        super({ playerIndex, seed, reactionTimeMs });
        this.script = script;
        this.index = 0;
    }

    // one action per decision; several actions at the same time follow each other quickly
    decide(view, t) {
        const next = this.script[this.index];
        if (!next || next.at > t) {
            return null;
        }
        this.index += 1;
        return { type: next.type, payload: next.payload };
    }

    get done() {
        return this.index >= this.script.length;
    }

    exportState() {
        return { index: this.index };
    }

    importState(state) {
        this.index = (state && state.index) || 0;
    }
}

module.exports = { ScriptedAgent };
