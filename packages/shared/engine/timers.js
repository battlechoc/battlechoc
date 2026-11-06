// Time. Timers are timestamps on the entities and on the match; advanceTo() processes
// everything that is due up to a time, in a fixed order, so a match replays the same way.

const { EntityType } = require('../constants');
const { InvalidTimeError } = require('../errors');
const { valueAt } = require('../balance');
const rng = require('./rng');
const { MatchPhase, DONUT_SETS } = require('./enums');
const {
    byEntityOrder,
    spec,
    entitiesOf,
    generatorStats,
    producerStats,
    buildCapacity,
    donutInterval,
    donutChance,
} = require('./selectors');
const { pushEvent, newId } = require('./entities');
const { enterPlacement, autoPlaceFactories, startRunning, endByTimeLimit } = require('./phases');

const TimerKind = { CACAO: 0, BUILD: 1, DONUT: 2, DEADLINE: 3 };

const dueTimers = match => {
    const timers = [];
    if (match.phase === MatchPhase.ENDED) {
        return timers;
    }
    if (match.phase === MatchPhase.RUNNING) {
        match.players.forEach((player, playerIndex) => {
            entitiesOf(match, playerIndex).forEach(entity => {
                if (typeof entity.cacaoAt === 'number') {
                    timers.push({ at: entity.cacaoAt, kind: TimerKind.CACAO, playerIndex, entity });
                }
                if (typeof entity.buildAt === 'number') {
                    timers.push({ at: entity.buildAt, kind: TimerKind.BUILD, playerIndex, entity });
                }
                if (typeof entity.donutAt === 'number') {
                    timers.push({ at: entity.donutAt, kind: TimerKind.DONUT, playerIndex, entity });
                }
            });
        });
        timers.push({ at: match.endsAt, kind: TimerKind.DEADLINE, playerIndex: -1 });
    } else {
        timers.push({ at: match.phaseEndsAt, kind: TimerKind.DEADLINE, playerIndex: -1 });
    }
    return timers;
};

const timerOrder = (a, b) => (a.at - b.at) || (a.kind - b.kind) || (a.playerIndex - b.playerIndex) ||
    ((a.entity && b.entity) ? byEntityOrder(a.entity, b.entity) : 0);

const nextTimer = match => {
    const timers = dueTimers(match);
    if (timers.length === 0) {
        return undefined;
    }
    return timers.reduce((earliest, timer) => (timerOrder(timer, earliest) < 0 ? timer : earliest));
};

const spawnDonuts = (match, events, playerIndex, factory) => {
    const player = match.players[playerIndex];
    const donutSpec = spec(match, EntityType.DONUT_FACTORY).donuts;
    if (player.donuts.length === 0 && rng.next(match) < donutChance(match, playerIndex)) {
        const set = DONUT_SETS[rng.nextInt(match, valueAt(donutSpec.types))];
        const pairId = set.length > 1 ? newId(match) : undefined;
        player.donuts = set.map(type => {
            const donut = { id: newId(match), type, hp: 1, maxHp: 1, position: null };
            if (pairId) {
                donut.pairId = pairId;
            }
            return donut;
        });
        pushEvent(match, events, 'donutsSpawned', playerIndex, [playerIndex], { types: set, factoryId: factory.id });
    }
};

const processTimer = (match, events, timer) => {
    const { entity, playerIndex } = timer;
    const player = playerIndex >= 0 ? match.players[playerIndex] : undefined;
    if (timer.kind === TimerKind.CACAO) {
        const stats = producerStats(match, playerIndex, entity);
        const cap = match.balance.match.cacaoCap;
        const before = player.cacao;
        player.cacao = cap === null ? player.cacao + stats.amount : Math.min(cap, player.cacao + stats.amount);
        player.statistics.producedCacao += player.cacao - before;
        entity.cacaoAt += stats.intervalMs;
    } else if (timer.kind === TimerKind.BUILD) {
        player.buildTokens = Math.min(buildCapacity(match, playerIndex), player.buildTokens + 1);
        entity.buildAt += generatorStats(match, playerIndex, entity).intervalMs;
    } else if (timer.kind === TimerKind.DONUT) {
        spawnDonuts(match, events, playerIndex, entity);
        entity.donutAt += donutInterval(match, playerIndex);
    } else if (match.phase === MatchPhase.FIELD_CHOICE) {
        enterPlacement(match, events, rng.nextInt(match, 2), true);
    } else if (match.phase === MatchPhase.PLACEMENT) {
        autoPlaceFactories(match, events);
    } else if (match.phase === MatchPhase.COUNTDOWN) {
        startRunning(match, events);
    } else if (match.phase === MatchPhase.RUNNING) {
        endByTimeLimit(match, events);
    }
};

/**
 * Processes every timer that is due up to time t (inclusive) in a deterministic order:
 * by time, then production before deadlines, then player index, then entity creation order.
 * Returns the produced events.
 */
const advanceTo = (match, t) => {
    if (!Number.isFinite(t) || t < match.t) {
        throw new InvalidTimeError(t, match.t);
    }
    const events = [];
    let timer = nextTimer(match);
    while (timer && timer.at <= t) {
        match.t = timer.at;
        processTimer(match, events, timer);
        timer = nextTimer(match);
    }
    match.t = t;
    return events;
};

/** Time of the next timer (production, donut roll, phase deadline or time limit), or null. */
const nextTimerAt = match => {
    const timer = nextTimer(match);
    return timer ? timer.at : null;
};

module.exports = { advanceTo, nextTimerAt };
