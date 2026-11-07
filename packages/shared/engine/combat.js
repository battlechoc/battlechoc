// The attacks: choosing a weapon, damage and shields, the defender's donuts as traps, the
// bunny, hot chocolate and projectiles; and giving up.

const { EntityType, isDonut, AttackType } = require('../constants');
const {
    ActionValidationError,
    NoCacaoLeftError,
    NoAttacksLeftError,
    TargetEmptyError,
    GameAlreadyEndedError,
    AlreadyMolten,
    WeaponNotReadyError,
    StunnedError,
} = require('../errors');
const { valueAt } = require('../balance');
const rng = require('./rng');
const { MatchPhase, OutcomeReason, DonutEffect } = require('./enums');
const {
    byEntityOrder,
    spec,
    stat,
    cellAt,
    patch,
    contains,
    nonDonuts,
    entitiesOf,
    cellOfEntity,
    shieldingFountains,
    isShielded,
    weaponSpec,
    weaponsOf,
    WeaponState,
    weaponStatus,
} = require('./selectors');
const { pushEvent, createEntity, startTimers, removeEntity } = require('./entities');
const { endMatch, requirePhase } = require('./phases');

const rollDamage = (match, attacker, weapon) => {
    const ws = weaponSpec(match, weapon);
    const base = valueAt(ws.damage) * (typeof weapon.damageFactor === 'number' ? weapon.damageFactor : 1);
    const spread = ws.spread || 0;
    return base * (1 + spread * (2 * rng.next(match) - 1));
};

const destroyIfDead = (match, attackerIndex, defenderIndex, entity, result) => {
    if (entity.hp < 1) {
        removeEntity(match, defenderIndex, entity);
        match.players[attackerIndex].statistics.attacks += 1;
        result.destroyed.push(entity.type);
        return true;
    }
    return false;
};

const convertXmasFactory = (match, defenderIndex, xmas, targetType) => {
    const cell = cellOfEntity(match, defenderIndex, xmas);
    cell.occupiedBy = cell.occupiedBy.filter(entity => entity.id !== xmas.id);
    const converted = createEntity(match, defenderIndex, targetType, cell);
    cell.occupiedBy.push(converted);
    startTimers(match, defenderIndex, converted, match.t);
    return converted;
};

const removeDonutFromField = (match, defenderIndex, donut) => {
    const cell = cellOfEntity(match, defenderIndex, donut);
    cell.occupiedBy = cell.occupiedBy.filter(entity => entity.id !== donut.id);
};

const findPartner = (match, defenderIndex, donut, partnerType) => entitiesOf(match, defenderIndex)
    .find(entity => entity.type === partnerType && entity.pairId === donut.pairId);

const applyDonutEffect = (match, effect, attackerIndex, defenderIndex, cell, result) => {
    const t = match.t;
    if (effect === DonutEffect.GREEN) {
        patch(match, defenderIndex, cell.row, cell.col, match.balance.donuts.green.area)
            .forEach(target => target.occupiedBy.forEach(entity => { entity.hp = entity.maxHp; }));
    } else if (effect === DonutEffect.WHITE) {
        patch(match, defenderIndex, cell.row, cell.col, match.balance.donuts.white.area)
            .filter(target => !target.molten && !contains(target, EntityType.CREAM))
            .forEach(target => target.occupiedBy.push(createEntity(match, defenderIndex, EntityType.CREAM, target)));
    } else if (effect === DonutEffect.PINK) {
        const attacker = match.players[attackerIndex];
        attacker.stunnedUntil = Math.max(attacker.stunnedUntil, t + match.balance.donuts.pink.stunMs);
    } else if (effect === DonutEffect.XMAS_TO_BALLISTA || effect === DonutEffect.XMAS_TO_FOUNTAIN) {
        const targetType = effect === DonutEffect.XMAS_TO_BALLISTA ? EntityType.HOT_CHOCOLATE_BALLISTA : EntityType.CHOCOLATE_FOUNTAIN;
        entitiesOf(match, defenderIndex).filter(entity => entity.type === EntityType.XMAS_FACTORY).sort(byEntityOrder)
            .forEach(xmas => convertXmasFactory(match, defenderIndex, xmas, targetType));
    }
    result.traps.push(effect);
};

// triggers the defender's donuts in the attacked cell; returns the (possibly swapped) cell contents
const triggerTraps = (match, attackerIndex, defenderIndex, cell, force, result) => {
    if (!force && isShielded(match, defenderIndex, cell.row, cell.col)) {
        return;
    }
    const blue = cell.occupiedBy.find(entity => entity.type === EntityType.DONUT_PORTAL_BLUE);
    if (blue) {
        const red = findPartner(match, defenderIndex, blue, EntityType.DONUT_PORTAL_RED);
        if (red) {
            const redCell = cellOfEntity(match, defenderIndex, red);
            removeDonutFromField(match, defenderIndex, blue);
            removeDonutFromField(match, defenderIndex, red);
            const contents = cell.occupiedBy;
            const type = cell.type;
            cell.occupiedBy = redCell.occupiedBy;
            redCell.occupiedBy = contents;
            cell.type = redCell.type;
            redCell.type = type;
            cell.previewStyle = cell.type.replace('BoardCellTypes.', '').toLowerCase();
            redCell.previewStyle = redCell.type.replace('BoardCellTypes.', '').toLowerCase();
            cell.occupiedBy.forEach(entity => { entity.position = { row: cell.row, col: cell.col }; });
            redCell.occupiedBy.forEach(entity => { entity.position = { row: redCell.row, col: redCell.col }; });
            result.traps.push(DonutEffect.PORTAL);
        }
    }
    const effects = [
        [EntityType.DONUT_HEALTH_GREEN, DonutEffect.GREEN],
        [EntityType.DONUT_CREAM_WHITE, DonutEffect.WHITE],
        [EntityType.DONUT_STOP_PINK, DonutEffect.PINK],
    ];
    for (const [donutType, effect] of effects) {
        const donut = cell.occupiedBy.find(entity => entity.type === donutType);
        if (donut) {
            removeDonutFromField(match, defenderIndex, donut);
            applyDonutEffect(match, effect, attackerIndex, defenderIndex, cell, result);
        }
    }
    const yellow = cell.occupiedBy.find(entity => entity.type === EntityType.DONUT_SURPRISE_YELLOW);
    if (yellow) {
        removeDonutFromField(match, defenderIndex, yellow);
        const effect = DonutEffect[rng.pickWeighted(match, match.balance.donuts.yellow.weights)];
        applyDonutEffect(match, effect, attackerIndex, defenderIndex, cell, result);
    }
};

const resolveBunny = (match, attackerIndex, defenderIndex, cell, bunnyEntity, result) => {
    const area = spec(match, EntityType.SPYING_EASTER_BUNNY).area || 3;
    const cells = patch(match, defenderIndex, cell.row, cell.col, area);
    const xmasFactories = cells.flatMap(target => target.occupiedBy.filter(entity => entity.type === EntityType.XMAS_FACTORY)).sort(byEntityOrder);
    if (xmasFactories.length > 0) {
        removeEntity(match, attackerIndex, bunnyEntity);
        const ballista = convertXmasFactory(match, defenderIndex, xmasFactories[0], EntityType.HOT_CHOCOLATE_BALLISTA);
        result.caught = true;
        result.ballista = { row: ballista.position.row, col: ballista.position.col };
    } else {
        match.players[attackerIndex].statistics.espionages += 1;
        cells.forEach(target => {
            if (contains(target, EntityType.CREAM)) {
                result.revealed.push({ row: target.row, col: target.col });
                target.occupiedBy = target.occupiedBy.filter(entity => entity.type !== EntityType.CREAM);
            }
        });
    }
};

const resolveHotChocolate = (match, attackerIndex, defenderIndex, cell, result) => {
    triggerTraps(match, attackerIndex, defenderIndex, cell, true, result);
    const red = cell.occupiedBy.find(entity => entity.type === EntityType.DONUT_PORTAL_RED);
    if (red) {
        const blue = findPartner(match, defenderIndex, red, EntityType.DONUT_PORTAL_BLUE);
        if (blue) {
            removeDonutFromField(match, defenderIndex, blue);
        }
    }
    if (cell.occupiedBy.some(entity => entity.type !== EntityType.CREAM && !isDonut(entity.type))) {
        match.players[attackerIndex].statistics.moltenFields += 1;
    }
    cell.molten = true;
    [...cell.occupiedBy].forEach(entity => {
        if (isDonut(entity.type)) {
            removeDonutFromField(match, defenderIndex, entity);
        } else {
            entity.hp = 0;
            destroyIfDead(match, attackerIndex, defenderIndex, entity, result);
        }
    });
};

/** How much of a truffle hit a shielding fountain of this player takes. */
const shieldFactor = (match, playerIndex) =>
    stat(match, playerIndex, EntityType.CHOCOLATE_FOUNTAIN, 'shieldFactor', spec(match, EntityType.CHOCOLATE_FOUNTAIN).truffleFactor);

const resolveProjectile = (match, attackerIndex, defenderIndex, cell, weapon, result) => {
    const damage = rollDamage(match, match.players[attackerIndex], weapon);
    const ws = weaponSpec(match, weapon);
    const fountains = shieldingFountains(match, defenderIndex, cell.row, cell.col);
    if (fountains.length > 0) {
        const fountain = fountains[0];
        const factor = weapon.attackType === AttackType.TRUFFLE ? shieldFactor(match, defenderIndex) : 1;
        fountain.hp = Math.round(fountain.hp - damage * factor);
        result.shielded = true;
        const known = match.players[attackerIndex].knownShields;
        if (!known.some(position => position.row === cell.row && position.col === cell.col)) {
            known.push({ row: cell.row, col: cell.col });
        }
        if (destroyIfDead(match, attackerIndex, defenderIndex, fountain, result)) {
            result.fountainDestroyed = true;
            triggerTraps(match, attackerIndex, defenderIndex, cell, false, result);
        }
        return;
    }
    triggerTraps(match, attackerIndex, defenderIndex, cell, false, result);
    const entityFactor = typeof weapon.entityFactor === 'number' ? weapon.entityFactor : ws.entityFactor;
    const factor = weapon.attackType === AttackType.FRUIT ? (entityFactor || 1) : 1;
    nonDonuts(cell).forEach(entity => {
        const before = entity.hp;
        entity.hp = Math.round(entity.hp - damage * factor);
        result.hits.push({ entityType: entity.type, hpBefore: before, hpAfter: Math.max(0, entity.hp) });
        destroyIfDead(match, attackerIndex, defenderIndex, entity, result);
    });
};

const selectWeapon = (match, attackerIndex, attackType, allowRush) => {
    const candidates = weaponsOf(match, attackerIndex, attackType)
        .map(candidate => ({ ...candidate, status: weaponStatus(match, candidate.weapon, match.t) }))
        .sort((a, b) => (a.weapon.chargedAt - b.weapon.chargedAt) || byEntityOrder(a.entity, b.entity));
    if (candidates.length === 0) {
        throw new NoAttacksLeftError();
    }
    const ready = candidates.find(candidate => candidate.status.state === WeaponState.READY);
    if (ready) {
        return { ...ready, rushCost: 0 };
    }
    const rushable = candidates.find(candidate => candidate.status.state === WeaponState.RUSHABLE);
    if (rushable && allowRush) {
        if (match.players[attackerIndex].cacao < rushable.status.rushCost) {
            throw new NoCacaoLeftError();
        }
        return { ...rushable, rushCost: rushable.status.rushCost };
    }
    throw new WeaponNotReadyError();
};

const attack = (match, events, action) => {
    requirePhase(match, MatchPhase.RUNNING);
    const attackerIndex = action.player;
    const defenderIndex = 1 - attackerIndex;
    const attacker = match.players[attackerIndex];
    const { attackType, row, col, allowRush } = action.payload || {};
    if (!AttackType.isInstanceOf(attackType)) {
        throw new ActionValidationError(action);
    }
    if (match.t < attacker.stunnedUntil) {
        throw new StunnedError();
    }
    const cell = cellAt(match, defenderIndex, row, col);
    if (!cell) {
        throw new ActionValidationError(action);
    }
    if (attackType === AttackType.HOT_CHOCOLATE && cell.molten) {
        throw new AlreadyMolten();
    }
    if ((attackType === AttackType.TRUFFLE || attackType === AttackType.FRUIT) && nonDonuts(cell).length === 0) {
        throw new TargetEmptyError();
    }
    const selected = selectWeapon(match, attackerIndex, attackType, allowRush === true);
    const targetBefore = nonDonuts(cell).map(entity => entity.type);

    selected.weapon.chargedAt = match.t;
    attacker.cacao -= selected.rushCost;
    attacker.statistics.spentCacao += selected.rushCost;
    attacker.statistics.shotsFired += 1;
    if (selected.rushCost > 0) {
        attacker.statistics.rushes += 1;
    }

    const result = { shielded: false, fountainDestroyed: false, traps: [], hits: [], destroyed: [], revealed: [], caught: false };
    if (attackType === AttackType.BUNNY) {
        resolveBunny(match, attackerIndex, defenderIndex, cell, selected.entity, result);
    } else if (attackType === AttackType.HOT_CHOCOLATE) {
        resolveHotChocolate(match, attackerIndex, defenderIndex, cell, result);
    } else {
        resolveProjectile(match, attackerIndex, defenderIndex, cell, selected.weapon, result);
    }
    if (result.hits.length > 0 || result.shielded || result.destroyed.length > 0) {
        attacker.statistics.shotsHit += 1;
    }
    pushEvent(match, events, 'attack', attackerIndex, [0, 1], {
        attackType, row, col, rushCost: selected.rushCost, result,
    }, {
        targetBefore,
        oneShot: result.hits.some(hit => hit.entityType !== EntityType.CREAM && hit.hpAfter === 0 && hit.hpBefore > 0),
    });
};

const surrender = (match, events, action) => {
    if (match.phase === MatchPhase.ENDED) {
        throw new GameAlreadyEndedError(action);
    }
    endMatch(match, events, [1 - action.player], OutcomeReason.SURRENDER);
};

module.exports = { shieldFactor, attack, surrender };
