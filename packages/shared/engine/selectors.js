// Reads a match: its cells and entities, and every value that is derived from the balance and
// the players' equipment instead of being stored (costs, shields, production, weapons).
// Nothing in here changes the match.

const { BoardCellTypes, EntityType, isDonut, AttackType, PlayerType } = require('../constants');
const { valueAt } = require('../balance');
const { applyStat } = require('../equipment');

const entityOrder = entity => parseInt(entity.id.slice(1), 10);
const byEntityOrder = (a, b) => entityOrder(a) - entityOrder(b);
const isAi = type => type !== PlayerType.HUMAN;
const spec = (match, entityType) => match.balance.entities[entityType] || {};
// a building value of a player: the base value (balance) changed by the player's equipment
const stat = (match, playerIndex, entityType, name, base) => applyStat(match.players[playerIndex].loadout, entityType, name, base);
// what building `entityType` costs `playerIndex` with its equipment (also on the player's own view)
const buildCosts = (match, playerIndex, entityType) => stat(match, playerIndex, entityType, 'costs', spec(match, entityType).costs || 0);

const field = (match, playerIndex) => match.board.fields[match.players[playerIndex].fieldIndex];

const cellAt = (match, playerIndex, row, col) => {
    const { rows, cols } = match.board.size;
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= rows || col >= cols) {
        return undefined;
    }
    return field(match, playerIndex).grid[row * cols + col];
};

const patch = (match, playerIndex, row, col, area) => {
    const radius = Math.floor(area / 2);
    const cells = [];
    for (let r = row - radius; r <= row + radius; r++) {
        for (let c = col - radius; c <= col + radius; c++) {
            const cell = cellAt(match, playerIndex, r, c);
            if (cell) {
                cells.push(cell);
            }
        }
    }
    return cells;
};

const contains = (cell, entityType) => cell.occupiedBy.some(entity => entity.type === entityType);
const nonDonuts = cell => cell.occupiedBy.filter(entity => !isDonut(entity.type));
const hasCream = cell => contains(cell, EntityType.CREAM);
// a factory can stand where nothing but cream (and donuts) lies; holds for a cell of a view too
const factoryPlaceable = cell => !cell.molten && nonDonuts(cell).every(entity => entity.type === EntityType.CREAM);

const entitiesOf = (match, playerIndex) => {
    if (match.players[playerIndex].fieldIndex === null) {
        return [];
    }
    return field(match, playerIndex).grid.flatMap(cell => cell.occupiedBy);
};

const cellOfEntity = (match, playerIndex, entity) => cellAt(match, playerIndex, entity.position.row, entity.position.col);

const shieldingFountains = (match, playerIndex, row, col) => {
    const area = spec(match, EntityType.CHOCOLATE_FOUNTAIN).area || 3;
    return patch(match, playerIndex, row, col, area)
        .flatMap(cell => cell.occupiedBy.filter(entity => entity.type === EntityType.CHOCOLATE_FOUNTAIN))
        .sort(byEntityOrder);
};

const isShielded = (match, playerIndex, row, col) => shieldingFountains(match, playerIndex, row, col).length > 0;

const generatorStats = (match, playerIndex, entity) => {
    const buildSpec = spec(match, entity.type).build;
    const black = cellOfEntity(match, playerIndex, entity).type === BoardCellTypes.BLACK;
    const blackSpec = match.balance.cells.black;
    const capacity = stat(match, playerIndex, entity.type, 'buildCapacity', valueAt(buildSpec.capacity));
    const intervalMs = stat(match, playerIndex, entity.type, 'buildIntervalMs', valueAt(buildSpec.intervalMs));
    return {
        capacity: capacity + (black ? blackSpec.buildCapacityBonus : 0),
        intervalMs: Math.round(intervalMs * (black ? blackSpec.buildIntervalFactor : 1)),
    };
};

const producerStats = (match, playerIndex, entity) => {
    const cacaoSpec = spec(match, entity.type).cacao;
    const white = cellOfEntity(match, playerIndex, entity).type === BoardCellTypes.WHITE;
    const amount = stat(match, playerIndex, entity.type, 'cacaoAmount', valueAt(cacaoSpec.amount));
    return {
        amount: Math.round(amount * (white ? match.balance.cells.white.cacaoFactor : 1)),
        intervalMs: valueAt(cacaoSpec.intervalMs),
    };
};

const isGenerator = entity => entity.type === EntityType.FACTORY || entity.type === EntityType.FACTORY_EXTENSION;
const isProducer = entity => entity.type === EntityType.FACTORY || entity.type === EntityType.CACAOTREE;

const buildCapacity = (match, playerIndex) => entitiesOf(match, playerIndex)
    .filter(isGenerator)
    .reduce((sum, entity) => sum + generatorStats(match, playerIndex, entity).capacity, 0);

const cacaoPerSecond = (match, playerIndex) => entitiesOf(match, playerIndex)
    .filter(isProducer)
    .map(entity => producerStats(match, playerIndex, entity))
    .reduce((sum, stats) => sum + stats.amount * 1000 / stats.intervalMs, 0);

const weaponSpec = (match, weapon) => spec(match, weapon.source).weapons.find(w => w.attackType === weapon.attackType);

// a new weapon of `source` (an entity type) with the values of its owner's equipment; weapons
// keep them for the whole match (saved matches from before equipment fall back to the balance)
const createWeapon = (match, playerIndex, source, ws, t) => {
    const rush = ws.rush || {};
    const cooldownMs = stat(match, playerIndex, source, 'cooldownMs', ws.cooldownMs);
    const weapon = {
        attackType: ws.attackType,
        source,
        chargedAt: ws.startReady ? t - cooldownMs : t,
        cooldownMs,
        damageFactor: stat(match, playerIndex, source, 'damage', 1),
    };
    if (typeof ws.entityFactor === 'number') {
        weapon.entityFactor = stat(match, playerIndex, source, 'entityFactor', ws.entityFactor);
    }
    if (rush.enabled) {
        weapon.rushCost = stat(match, playerIndex, source, 'rushCost', rush.cost);
        weapon.rushFrom = stat(match, playerIndex, source, 'rushFrom', rush.fromProgress);
    }
    return weapon;
};

const weaponsOf = (match, playerIndex, attackType) => entitiesOf(match, playerIndex)
    .filter(entity => Array.isArray(entity.weapons))
    .flatMap(entity => entity.weapons
        .filter(weapon => typeof attackType === 'undefined' || weapon.attackType === attackType)
        .map(weapon => ({ entity, weapon })));

const WeaponState = Object.freeze({ CHARGING: 'charging', RUSHABLE: 'rushable', READY: 'ready' });

// progress, state, ready time and rush price of a weapon at time t
const weaponStatus = (match, weapon, t) => {
    const ws = weaponSpec(match, weapon);
    const cooldownMs = typeof weapon.cooldownMs === 'number' ? weapon.cooldownMs : ws.cooldownMs;
    const rush = ws.rush || {};
    const rushFrom = typeof weapon.rushFrom === 'number' ? weapon.rushFrom : rush.fromProgress;
    const rushCost = typeof weapon.rushCost === 'number' ? weapon.rushCost : rush.cost;
    const progress = Math.min(1, Math.max(0, (t - weapon.chargedAt) / cooldownMs));
    let state = WeaponState.CHARGING;
    if (progress >= 1) {
        state = WeaponState.READY;
    } else if (rush.enabled && progress >= rushFrom) {
        state = WeaponState.RUSHABLE;
    }
    return {
        progress,
        state,
        readyAt: weapon.chargedAt + cooldownMs,
        rushableAt: rush.enabled ? weapon.chargedAt + Math.ceil(cooldownMs * rushFrom) : null,
        rushCost: rush.enabled ? rushCost : null,
    };
};

const hasHarmfulWeapon = (match, playerIndex) => weaponsOf(match, playerIndex)
    .some(({ weapon }) => weapon.attackType === AttackType.TRUFFLE || weapon.attackType === AttackType.HOT_CHOCOLATE);

const hasGenerator = (match, playerIndex) => entitiesOf(match, playerIndex).some(isGenerator);
const hasIncome = (match, playerIndex) => entitiesOf(match, playerIndex).some(isProducer);

const donutInterval = (match, playerIndex) =>
    stat(match, playerIndex, EntityType.DONUT_FACTORY, 'donutIntervalMs', valueAt(spec(match, EntityType.DONUT_FACTORY).donuts.intervalMs));

/** The chance of a donut factory of this player to make a set of donuts on each roll. */
const donutChance = (match, playerIndex) =>
    stat(match, playerIndex, EntityType.DONUT_FACTORY, 'donutProbability', valueAt(spec(match, EntityType.DONUT_FACTORY).donuts.probability));

module.exports = {
    byEntityOrder,
    isAi,
    spec,
    stat,
    buildCosts,
    field,
    cellAt,
    patch,
    contains,
    nonDonuts,
    hasCream,
    factoryPlaceable,
    entitiesOf,
    cellOfEntity,
    shieldingFountains,
    isShielded,
    generatorStats,
    producerStats,
    isGenerator,
    buildCapacity,
    cacaoPerSecond,
    weaponSpec,
    createWeapon,
    weaponsOf,
    WeaponState,
    weaponStatus,
    hasHarmfulWeapon,
    hasGenerator,
    hasIncome,
    donutInterval,
    donutChance,
};
