// Real-time rules engine.
//
// The engine never reads a clock. Every function receives the match time `t` in integer
// milliseconds since the match was created. Timers are timestamps on the entities; advanceTo()
// processes everything that is due, applyAction() first advances to the action's time and
// then applies the action. The whole state (including the random generator) lives in the
// match object, so a match is reproducible from its seed and its action log.
//
// Functions mutate the match they receive (like reducers on an Immer draft) and return the
// events they produced. The host (local engine or server) is the only writer of a match.
//
// The rules live in the modules next to this file: enums, selectors (reading a match),
// entities, match (creation), phases, timers, scenarios, build and combat. This file applies
// an action and gathers what the engine offers.

const { BattlechocError, ActionValidationError, GameAlreadyEndedError, InvalidTimeError } = require('../errors');
const { MatchPhase, MatchActionTypes, OutcomeReason, DonutEffect, BUILDABLE } = require('./enums');
const {
    stat,
    buildCosts,
    cellAt,
    hasCream,
    factoryPlaceable,
    entitiesOf,
    isShielded,
    generatorStats,
    producerStats,
    buildCapacity,
    cacaoPerSecond,
    weaponsOf,
    WeaponState,
    weaponStatus,
    hasHarmfulWeapon,
    donutChance,
} = require('./selectors');
const { createMatch } = require('./match');
const { boardValue, checkOutcome } = require('./phases');
const { advanceTo, nextTimerAt } = require('./timers');
const { prepareScenario } = require('./scenarios');
const { chooseField, placeFactory, creamArea, creamFootprint, build, placeDonut } = require('./build');
const { shieldFactor, attack, surrender } = require('./combat');

const handlers = {
    [MatchActionTypes.chooseField]: chooseField,
    [MatchActionTypes.placeFactory]: placeFactory,
    [MatchActionTypes.build]: build,
    [MatchActionTypes.placeDonut]: placeDonut,
    [MatchActionTypes.attack]: attack,
    [MatchActionTypes.surrender]: surrender,
};

/**
 * Applies an action { type, player, t, payload } to the match.
 * The match is first advanced to action.t. On an invalid action the advancement stays, the
 * action itself has no effect, and the returned object carries the error.
 *
 * @returns {{ok: true, events: object[]} | {ok: false, error: Error, events: object[]}}
 */
const applyAction = (match, action) => {
    if (!action || !handlers[action.type] || (action.player !== 0 && action.player !== 1)) {
        return { ok: false, error: new ActionValidationError(action || { type: 'undefined' }), events: [] };
    }
    if (!Number.isFinite(action.t) || action.t < match.t) {
        return { ok: false, error: new InvalidTimeError(action.t, match.t), events: [] };
    }
    const events = advanceTo(match, action.t);
    if (match.phase === MatchPhase.ENDED && action.type !== MatchActionTypes.surrender) {
        return { ok: false, error: new GameAlreadyEndedError(action), events };
    }
    try {
        handlers[action.type](match, events, action);
    } catch (error) {
        if (error instanceof BattlechocError) {
            return { ok: false, error, events };
        }
        throw error;
    }
    checkOutcome(match, events);
    return { ok: true, events };
};

module.exports = {
    MatchPhase,
    MatchActionTypes,
    OutcomeReason,
    DonutEffect,
    WeaponState,
    BUILDABLE,
    createMatch,
    prepareScenario,
    advanceTo,
    applyAction,
    nextTimerAt,
    // derived selectors
    cellAt,
    entitiesOf,
    hasCream,
    factoryPlaceable,
    equippedStat: stat,
    buildCosts,
    isShielded,
    buildCapacity,
    cacaoPerSecond,
    producerStats,
    generatorStats,
    donutChance,
    shieldFactor,
    weaponsOf,
    weaponStatus,
    hasHarmfulWeapon,
    boardValue,
    creamArea,
    creamFootprint,
};
