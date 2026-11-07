// The course of a match: choosing a field, placing the factories, the running phase, and
// how and for whom it ends.

const { EntityType, isDonut } = require('../constants');
const { UnexpectedStateError } = require('../errors');
const rng = require('./rng');
const { MatchPhase, OutcomeReason } = require('./enums');
const {
    spec,
    field,
    contains,
    hasCream,
    factoryPlaceable,
    entitiesOf,
    buildCapacity,
    hasHarmfulWeapon,
    hasGenerator,
    hasIncome,
} = require('./selectors');
const { pushEvent, createEntity, startTimers } = require('./entities');

const enterPlacement = (match, events, fieldIndex, automatic = false) => {
    const chooser = match.fieldChooser;
    match.players[chooser].fieldIndex = fieldIndex;
    match.players[1 - chooser].fieldIndex = 1 - fieldIndex;
    match.phase = MatchPhase.PLACEMENT;
    match.phaseEndsAt = match.t + match.balance.match.placementTimeoutMs;
    pushEvent(match, events, 'fieldChosen', chooser, [0, 1], { fieldIndex, automatic });
};

const ownFactory = (match, playerIndex) => entitiesOf(match, playerIndex).find(entity => entity.type === EntityType.FACTORY);

const placeFactoryInternal = (match, events, playerIndex, cell, automatic = false) => {
    const factory = createEntity(match, playerIndex, EntityType.FACTORY, cell);
    cell.occupiedBy.push(factory);
    match.players[playerIndex].statistics.builtEntities += 1;
    const creamed = contains(cell, EntityType.CREAM);
    pushEvent(match, events, 'factoryPlaced', playerIndex, creamed ? [playerIndex] : [0, 1],
        { row: cell.row, col: cell.col, entityId: factory.id, automatic },
        { cellType: cell.type, creamed });
    if (match.players.every((player, index) => ownFactory(match, index))) {
        match.phase = MatchPhase.COUNTDOWN;
        match.phaseEndsAt = match.t + match.balance.match.countdownMs;
        pushEvent(match, events, 'phase', null, [0, 1], { phase: match.phase, endsAt: match.phaseEndsAt });
    }
};

const autoPlaceFactories = (match, events) => {
    match.players.forEach((player, playerIndex) => {
        if (!ownFactory(match, playerIndex)) {
            const grid = field(match, playerIndex).grid;
            const creamed = grid.filter(cell => factoryPlaceable(cell) && hasCream(cell));
            const candidates = creamed.length > 0 ? creamed : grid.filter(factoryPlaceable);
            placeFactoryInternal(match, events, playerIndex, rng.pick(match, candidates), true);
        }
    });
};

const startRunning = (match, events) => {
    const t = match.t;
    match.phase = MatchPhase.RUNNING;
    match.phaseEndsAt = null;
    match.startedAt = t;
    match.endsAt = t + match.balance.match.timeLimitMs;
    match.players.forEach((player, playerIndex) => {
        entitiesOf(match, playerIndex).filter(entity => !isDonut(entity.type) && entity.type !== EntityType.CREAM)
            .forEach(entity => startTimers(match, playerIndex, entity, t));
        player.buildTokens = match.balance.match.buildTokens.startFull ? buildCapacity(match, playerIndex) : 0;
    });
    pushEvent(match, events, 'phase', null, [0, 1], { phase: match.phase, startedAt: match.startedAt, endsAt: match.endsAt });
};

const endMatch = (match, events, winners, reason) => {
    match.phase = MatchPhase.ENDED;
    match.phaseEndsAt = null;
    match.outcome = { winners, reason, t: match.t };
    match.players.forEach((player, index) => {
        player.statistics.won = winners.length === 1 && winners[0] === index;
        player.statistics.lost = winners.length === 1 && winners[0] !== index;
    });
    pushEvent(match, events, 'ended', null, [0, 1], { winners, reason });
};

const boardValue = (match, playerIndex) => match.players[playerIndex].cacao + entitiesOf(match, playerIndex)
    .filter(entity => entity.type !== EntityType.CREAM && !isDonut(entity.type))
    .reduce((sum, entity) => sum + (entity.type === EntityType.FACTORY
        ? match.balance.match.factoryBoardValue
        : (spec(match, entity.type).costs || 0)), 0);

const treeCount = (match, playerIndex) => entitiesOf(match, playerIndex).filter(entity => entity.type === EntityType.CACAOTREE).length;

const hasLost = (match, playerIndex) => {
    if (hasHarmfulWeapon(match, playerIndex)) {
        return false;
    }
    const treeCost = spec(match, EntityType.CACAOTREE).costs;
    return !hasGenerator(match, playerIndex) ||
        (!hasIncome(match, playerIndex) && match.players[playerIndex].cacao < treeCost);
};

// decides the winner of two players that lost at the same moment: more cacao, then more trees, else a draw
const tiebreak = (match, first, second) => {
    const a = match.players[first].cacao;
    const b = match.players[second].cacao;
    if (a !== b) {
        return [a > b ? first : second];
    }
    const treesA = treeCount(match, first);
    const treesB = treeCount(match, second);
    if (treesA !== treesB) {
        return [treesA > treesB ? first : second];
    }
    return [0, 1];
};

const checkOutcome = (match, events) => {
    if (match.phase !== MatchPhase.RUNNING) {
        return;
    }
    const losers = [0, 1].filter(index => hasLost(match, index));
    if (losers.length === 1) {
        endMatch(match, events, [1 - losers[0]], OutcomeReason.ELIMINATION);
    } else if (losers.length === 2) {
        endMatch(match, events, tiebreak(match, 0, 1), OutcomeReason.ELIMINATION);
    }
};

const endByTimeLimit = (match, events) => {
    const a = boardValue(match, 0);
    const b = boardValue(match, 1);
    endMatch(match, events, a === b ? [0, 1] : [a > b ? 0 : 1], OutcomeReason.TIME_LIMIT);
};

const requirePhase = (match, phase) => {
    if (match.phase !== phase) {
        throw new UnexpectedStateError(match.phase);
    }
};

module.exports = {
    enterPlacement,
    ownFactory,
    placeFactoryInternal,
    autoPlaceFactories,
    startRunning,
    endMatch,
    boardValue,
    checkOutcome,
    endByTimeLimit,
    requirePhase,
};
