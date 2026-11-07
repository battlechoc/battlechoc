// Prepared starts of a match, for the first game of new players, debug boards and tests.

const { EntityType } = require('../constants');
const { sanitizeLoadout } = require('../equipment');
const { MatchPhase } = require('./enums');
const { field, cellAt, contains } = require('./selectors');
const { newId, createEntity } = require('./entities');
const { enterPlacement, ownFactory, autoPlaceFactories, startRunning, requirePhase } = require('./phases');

/**
 * Prepares a freshly created match from a scenario, for the first game of new players,
 * debug boards and tests. Assigns the fields, rewrites cells, then either stays in the
 * placement phase (until both factories stand) or starts the running phase right away.
 *
 * @param {object} scenario
 * @param {0|1} [scenario.fieldIndex] field of the field chooser
 * @param {boolean} [scenario.clear] remove all initial cream first
 * @param {Array<{player, row, col, type, cream, entities}>} [scenario.cells] cell overrides;
 *        `entities` lists entity types (factory, buildings, single donuts) or { type, hp }
 * @param {Array<Array<string>>} [scenario.donuts] unplaced donuts per player (a set, e.g. the portal pair)
 * @param {Array<object>} [scenario.loadouts] equipment per player
 * @param {Array<number>} [scenario.cacao] cacao per player
 * @param {string} [scenario.phase] MatchPhase.PLACEMENT (default) or MatchPhase.RUNNING
 */
const prepareScenario = (match, { fieldIndex = 0, clear = false, cells = [], loadouts = [], cacao, donuts, phase = MatchPhase.PLACEMENT } = {}) => {
    requirePhase(match, MatchPhase.FIELD_CHOICE);
    const events = [];
    loadouts.forEach((loadout, index) => {
        if (loadout) {
            match.players[index].loadout = sanitizeLoadout(loadout);
        }
    });
    enterPlacement(match, events, fieldIndex);
    if (clear) {
        [0, 1].forEach(playerIndex => field(match, playerIndex).grid.forEach(cell => { cell.occupiedBy = []; }));
    }
    cells.forEach(({ player = 0, row, col, type, cream, entities }) => {
        const cell = cellAt(match, player, row, col);
        if (!cell) {
            throw new Error(`Scenario cell ${row}/${col} is outside the board`);
        }
        if (type) {
            cell.type = type;
            cell.previewStyle = type.replace('BoardCellTypes.', '').toLowerCase();
        }
        if (typeof cream === 'boolean' || Array.isArray(entities)) {
            const creamed = typeof cream === 'boolean' ? cream : contains(cell, EntityType.CREAM);
            cell.occupiedBy = [];
            if (creamed) {
                cell.occupiedBy.push(createEntity(match, player, EntityType.CREAM, cell));
            }
            // an entity is its type, or { type, hp } for a damaged one (tutorial boards)
            (entities || []).forEach(entry => {
                const entity = createEntity(match, player, typeof entry === 'string' ? entry : entry.type, cell);
                if (typeof entry === 'object' && Number.isFinite(entry.hp)) {
                    entity.hp = Math.max(1, Math.min(entity.maxHp, entry.hp));
                }
                cell.occupiedBy.push(entity);
            });
        }
    });
    if (Array.isArray(cacao)) {
        cacao.forEach((value, index) => { match.players[index].cacao = value; });
    }
    if (Array.isArray(donuts)) {
        donuts.forEach((set, index) => {
            const pairId = set && set.length > 1 ? newId(match) : undefined;
            match.players[index].donuts = (set || []).map(type => ({
                id: newId(match), type, hp: 1, maxHp: 1, position: null, ...(pairId ? { pairId } : {}),
            }));
        });
    }
    const bothFactories = [0, 1].every(index => ownFactory(match, index));
    if (phase === MatchPhase.RUNNING) {
        if (!bothFactories) {
            autoPlaceFactories(match, events);
        }
        startRunning(match, events);
    } else if (bothFactories) {
        match.phase = MatchPhase.COUNTDOWN;
        match.phaseEndsAt = match.t + match.balance.match.countdownMs;
    }
    return events;
};

module.exports = { prepareScenario };
