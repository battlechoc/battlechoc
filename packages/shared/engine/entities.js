// What happens to entities: the events a change produces, new entities with their timers,
// and their removal.

const { EntityType, isDonut } = require('../constants');
const { valueAt } = require('../balance');
const {
    spec,
    stat,
    cellOfEntity,
    generatorStats,
    producerStats,
    isGenerator,
    buildCapacity,
    createWeapon,
    donutInterval,
} = require('./selectors');

// visibleTo: player indices that may see the event; secret: host-only facts (awards), never sent to clients
const pushEvent = (match, events, type, player, visibleTo, data = {}, secret = undefined) => {
    const event = { seq: match.eventSeq++, t: match.t, type, player, visibleTo, data };
    if (typeof secret !== 'undefined') {
        event.secret = secret;
    }
    match.events.push(event);
    events.push(event);
    return event;
};

const newId = match => 'e' + match.nextId++;

const createEntity = (match, playerIndex, entityType, position) => {
    const entity = { id: newId(match), type: entityType, position: { row: position.row, col: position.col } };
    if (isDonut(entityType)) {
        entity.hp = 1;
        entity.maxHp = 1;
        return entity;
    }
    const hp = stat(match, playerIndex, entityType, 'hp', valueAt(spec(match, entityType).hp));
    entity.hp = hp;
    entity.maxHp = hp;
    return entity;
};

// starts the timers of an entity that becomes active at time t
const startTimers = (match, playerIndex, entity, t) => {
    const entitySpec = spec(match, entity.type);
    if (entitySpec.cacao) {
        entity.cacaoAt = t + producerStats(match, playerIndex, entity).intervalMs;
    }
    if (entitySpec.build) {
        entity.buildAt = t + generatorStats(match, playerIndex, entity).intervalMs;
    }
    if (entitySpec.donuts) {
        entity.donutAt = t + donutInterval(match, playerIndex);
    }
    if (entitySpec.weapons && !entity.weapons) {
        entity.weapons = entitySpec.weapons.map(ws => createWeapon(match, playerIndex, entity.type, ws, t));
        // a fruit cannon that did not replace a truffle cannon (scenarios) still has both weapons
        if (entity.type === EntityType.FRUIT_CANNON && entitySpec.keepsTruffleWeapon) {
            entity.weapons.unshift(...spec(match, EntityType.RUM_TRUFFLE_CANNON).weapons
                .map(ws => ({ ...createWeapon(match, playerIndex, EntityType.RUM_TRUFFLE_CANNON, ws, t), chargedAt: t })));
        }
    }
};

const clampTokens = (match, playerIndex) => {
    if (match.balance.match.buildTokens.clampOnCapacityLoss) {
        const player = match.players[playerIndex];
        player.buildTokens = Math.min(player.buildTokens, buildCapacity(match, playerIndex));
    }
};

const removeEntity = (match, playerIndex, entity) => {
    const cell = cellOfEntity(match, playerIndex, entity);
    cell.occupiedBy = cell.occupiedBy.filter(other => other.id !== entity.id);
    if (isGenerator(entity)) {
        clampTokens(match, playerIndex);
    }
};

module.exports = { pushEvent, newId, createEntity, startTimers, removeEntity };
