// Equipment: items crafted in the lab change the values of one building type, always with a
// trade-off. Every player has two slots per building type and the same loadout budget.
// A loadout is { [entityType]: [itemKey, itemKey] }; the engine reads it through applyStat.

const { EntityType } = require('./constants');

const LOADOUT_BUDGET = 10;
const SLOTS_PER_BUILDING = 2;

const Tier = Object.freeze({
    COMMON: Object.freeze({ key: 'COMMON', points: 2, craftingFee: 50 }),
    RARE: Object.freeze({ key: 'RARE', points: 3, craftingFee: 100 }),
    EPIC: Object.freeze({ key: 'EPIC', points: 5, craftingFee: 200 }),
});

// stats an item can change; `kind` decides how the result is rounded
const Stat = Object.freeze({
    hp: 'whole',
    costs: 'whole',
    cacaoAmount: 'whole',
    buildIntervalMs: 'whole',
    buildCapacity: 'whole',
    cooldownMs: 'whole',
    damage: 'factor',
    entityFactor: 'factor',
    rushCost: 'whole',
    rushFrom: 'share',
    shieldFactor: 'factor',
    donutIntervalMs: 'whole',
    donutProbability: 'chance',
});

const times = (stat, factor) => ({ stat, factor });
const plus = (stat, add) => ({ stat, add });

const T = EntityType;
const item = (key, entityType, tier, effects) => [key, Object.freeze({
    key, entityType, tier: tier.key, points: tier.points, craftingFee: tier.craftingFee, effects: Object.freeze(effects),
})];

// the first effect is the item's purpose, the others are its price
const Items = Object.freeze(Object.fromEntries([
    item('DARK_WALLS', T.FACTORY, Tier.RARE, [times('hp', 1.3), times('buildIntervalMs', 1.1)]),
    item('TURBO_CONVEYOR', T.FACTORY, Tier.EPIC, [times('buildIntervalMs', 0.85), plus('buildCapacity', -1)]),
    item('NUT_BRICKS', T.FACTORY_EXTENSION, Tier.COMMON, [times('hp', 1.25), times('costs', 1.2)]),
    item('SECOND_SHIFT', T.FACTORY_EXTENSION, Tier.RARE, [times('buildIntervalMs', 0.85), times('hp', 0.8)]),
    item('SUGAR_FERTILIZER', T.CACAOTREE, Tier.COMMON, [times('cacaoAmount', 1.2), times('hp', 0.75)]),
    item('DEEP_ROOTS', T.CACAOTREE, Tier.COMMON, [times('hp', 1.3), times('cacaoAmount', 0.9)]),
    item('HEAVY_BARREL', T.RUM_TRUFFLE_CANNON, Tier.RARE, [times('damage', 1.25), times('cooldownMs', 1.3)]),
    item('LIGHT_BARREL', T.RUM_TRUFFLE_CANNON, Tier.COMMON, [times('cooldownMs', 0.8), times('damage', 0.85)]),
    item('CHERRY_BOMB', T.FRUIT_CANNON, Tier.RARE, [times('entityFactor', 1.3), times('cooldownMs', 1.2)]),
    item('JUICY_RELOAD', T.FRUIT_CANNON, Tier.COMMON, [times('rushCost', 0.7), times('damage', 0.85)]),
    item('MARZIPAN_CARROTS', T.SPYING_EASTER_BUNNY, Tier.RARE, [times('cooldownMs', 0.8), times('hp', 0.75)]),
    item('LONG_EARS', T.SPYING_EASTER_BUNNY, Tier.EPIC, [plus('rushFrom', -0.1), times('rushCost', 1.3)]),
    item('CINNAMON_LURE', T.XMAS_FACTORY, Tier.RARE, [times('hp', 1.3), times('costs', 1.25)]),
    item('HOT_BOILER', T.HOT_CHOCOLATE_BALLISTA, Tier.EPIC, [times('cooldownMs', 0.8), times('hp', 0.75)]),
    item('THICK_SHIELD', T.CHOCOLATE_FOUNTAIN, Tier.RARE, [times('hp', 1.3), times('costs', 1.25)]),
    item('WIDE_SPRAY', T.CHOCOLATE_FOUNTAIN, Tier.EPIC, [times('shieldFactor', 0.7), times('hp', 0.8)]),
    item('SPRINKLE_SORTER', T.DONUT_FACTORY, Tier.RARE, [times('donutIntervalMs', 0.8), times('hp', 0.75)]),
    item('GLAZED_OVEN', T.DONUT_FACTORY, Tier.EPIC, [plus('donutProbability', 0.1), times('costs', 1.25)]),
]));

/**
 * The part of `loadout` that is allowed: known items of the right building, no item twice on
 * one building, at most two per building, and within the budget (in the order given).
 */
const sanitizeLoadout = loadout => {
    const result = {};
    if (!loadout || typeof loadout !== 'object' || Array.isArray(loadout)) {
        return result;
    }
    let points = 0;
    Object.entries(loadout).forEach(([entityType, keys]) => {
        if (!Array.isArray(keys)) {
            return;
        }
        const kept = [];
        keys.forEach(key => {
            const definition = Items[key];
            if (!definition || definition.entityType !== entityType || kept.includes(key) ||
                kept.length >= SLOTS_PER_BUILDING || points + definition.points > LOADOUT_BUDGET) {
                return;
            }
            kept.push(key);
            points += definition.points;
        });
        if (kept.length > 0) {
            result[entityType] = kept;
        }
    });
    return result;
};

const loadoutPoints = loadout => Object.values(sanitizeLoadout(loadout))
    .flat()
    .reduce((sum, key) => sum + Items[key].points, 0);

const round = (kind, value, base) => {
    if (kind === 'whole') {
        // zero stays zero (free buildings), everything else stays at least 1
        return base === 0 ? 0 : Math.max(1, Math.round(value));
    }
    if (kind === 'share') {
        return Math.min(0.95, Math.max(0.1, value));
    }
    if (kind === 'chance') {
        return Math.min(0.999, Math.max(0, value));
    }
    return value;
};

/** `base` changed by the items of `entityType` in `loadout` (already sanitized by the match). */
const applyStat = (loadout, entityType, stat, base) => {
    const keys = (loadout && loadout[entityType]) || [];
    let value = base;
    let changed = false;
    keys.forEach(key => {
        const definition = Items[key];
        (definition ? definition.effects : []).filter(effect => effect.stat === stat).forEach(effect => {
            changed = true;
            value = typeof effect.factor === 'number' ? value * effect.factor : value + effect.add;
        });
    });
    return changed ? round(Stat[stat], value, base) : base;
};

module.exports = { LOADOUT_BUDGET, SLOTS_PER_BUILDING, Tier, Stat, Items, sanitizeLoadout, loadoutPoints, applyStat };
