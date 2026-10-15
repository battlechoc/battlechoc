const { engine, EntityType, AttackType, Items, LOADOUT_BUDGET, sanitizeLoadout } = require('../../index');
const { runningMatch, place, entityAt, newMatch } = require('./helper');

const T = EntityType;
const withItems = (loadout0, extra = {}) => runningMatch({ loadouts: [loadout0, extra.opponent], ...extra });
const factoryOf = (match, player) => engine.entitiesOf(match, player).find(entity => entity.type === T.FACTORY);
const weaponOf = (entity, attackType) => entity.weapons.find(weapon => weapon.attackType === attackType);

describe('items', () => {
    test('every item belongs to an upgradable building and has an effect and a trade-off', () => {
        expect(Object.keys(Items)).toHaveLength(18);
        Object.values(Items).forEach(item => {
            expect(Object.values(T)).toContain(item.entityType);
            expect([2, 3, 5]).toContain(item.points);
            expect(item.effects.length).toBeGreaterThanOrEqual(2);
        });
        expect(LOADOUT_BUDGET).toBe(10);
    });
});

describe('sanitizeLoadout', () => {
    test('drops unknown items, wrong buildings, duplicates, a third slot and anything over the budget', () => {
        expect(sanitizeLoadout({
            [T.FACTORY]: ['TURBO_CONVEYOR', 'TURBO_CONVEYOR', 'NOPE', 'LIGHT_BARREL'],
            [T.RUM_TRUFFLE_CANNON]: ['HEAVY_BARREL', 'LIGHT_BARREL', 'HEAVY_BARREL'],
            [T.DONUT_FACTORY]: ['GLAZED_OVEN'],
            'EntityType.NOPE': ['DARK_WALLS'],
        })).toEqual({
            // 5 + 3 + 2 = 10 points; the glazed oven (5) no longer fits
            [T.FACTORY]: ['TURBO_CONVEYOR'],
            [T.RUM_TRUFFLE_CANNON]: ['HEAVY_BARREL', 'LIGHT_BARREL'],
        });
        expect(sanitizeLoadout(undefined)).toEqual({});
        expect(sanitizeLoadout('nonsense')).toEqual({});
    });
});

describe('equipment in a match', () => {
    test('without equipment the base values are the old level-0 values, whatever levels a player had', () => {
        const match = engine.createMatch({
            players: [
                { id: 'a', name: 'A', type: 'PlayerType.HUMAN', level: { [T.FACTORY]: 19 } },
                { id: 'b', name: 'B', type: 'PlayerType.AI_STRONG' },
            ],
            boardSize: { rows: 6, cols: 6 },
            seed: 'x',
        });
        expect(match.players[0].loadout).toEqual({});
        expect(match.players[0].level).toBeUndefined();
        const plain = runningMatch();
        expect(factoryOf(plain, 0).maxHp).toBe(11);
    });

    test('hit points, build interval and capacity of the factory', () => {
        expect(factoryOf(withItems({ [T.FACTORY]: ['DARK_WALLS'] }), 0).maxHp).toBe(14);
        const turbo = withItems({ [T.FACTORY]: ['TURBO_CONVEYOR'] });
        expect(engine.generatorStats(turbo, 0, factoryOf(turbo, 0))).toEqual({ capacity: 1, intervalMs: 12750 });
        expect(engine.buildCapacity(turbo, 0)).toBe(1);
        // the opponent is not affected
        expect(engine.buildCapacity(turbo, 1)).toBe(2);
    });

    test('building costs and cacao production', () => {
        const match = withItems({ [T.FACTORY_EXTENSION]: ['NUT_BRICKS'], [T.CACAOTREE]: ['SUGAR_FERTILIZER'] });
        const before = match.players[0].cacao = 500;
        match.players[0].buildTokens = 5;
        engine.applyAction(match, { type: engine.MatchActionTypes.build, player: 0, t: match.t, payload: { entityType: T.FACTORY_EXTENSION, row: 0, col: 1 } });
        expect(match.players[0].cacao).toBe(before - 144);
        const [treeId] = place(match, 0, T.CACAOTREE, 3, 3);
        const tree = engine.entitiesOf(match, 0).find(entity => entity.id === treeId);
        expect(engine.producerStats(match, 0, tree).amount).toBe(12);
        expect(tree.maxHp).toBe(4);
    });

    test('weapons: reload, damage, early-shot price and start, fruit factor', () => {
        const match = withItems({
            [T.RUM_TRUFFLE_CANNON]: ['LIGHT_BARREL'],
            [T.FRUIT_CANNON]: ['JUICY_RELOAD'],
            [T.SPYING_EASTER_BUNNY]: ['LONG_EARS'],
        });
        place(match, 0, T.RUM_TRUFFLE_CANNON, 2, 2);
        const truffle = weaponOf(entityAt(match, 0, 2, 2, T.RUM_TRUFFLE_CANNON), AttackType.TRUFFLE);
        expect(engine.weaponStatus(match, truffle, truffle.chargedAt).readyAt - truffle.chargedAt).toBe(16000);
        expect(truffle.damageFactor).toBeCloseTo(0.85);
        place(match, 0, T.FRUIT_CANNON, 2, 2);
        const fruit = weaponOf(entityAt(match, 0, 2, 2, T.FRUIT_CANNON), AttackType.FRUIT);
        expect(engine.weaponStatus(match, fruit, fruit.chargedAt).rushCost).toBe(11);
        place(match, 0, T.SPYING_EASTER_BUNNY, 4, 4);
        const bunny = weaponOf(entityAt(match, 0, 4, 4, T.SPYING_EASTER_BUNNY), AttackType.BUNNY);
        const status = engine.weaponStatus(match, bunny, bunny.chargedAt);
        expect(status.rushableAt - bunny.chargedAt).toBe(24000);
        expect(status.rushCost).toBe(39);
        const bomb = withItems({ [T.FRUIT_CANNON]: ['CHERRY_BOMB'] });
        place(bomb, 0, T.RUM_TRUFFLE_CANNON, 2, 2);
        place(bomb, 0, T.FRUIT_CANNON, 2, 2);
        const bombFruit = weaponOf(entityAt(bomb, 0, 2, 2, T.FRUIT_CANNON), AttackType.FRUIT);
        expect(bombFruit.entityFactor).toBeCloseTo(0.13);
        expect(engine.weaponStatus(bomb, bombFruit, bombFruit.chargedAt).readyAt - bombFruit.chargedAt).toBe(36000);
    });

    test('heavier damage is rolled from the weapon factor (same seed, same roll)', () => {
        const lost = match => {
            place(match, 0, T.RUM_TRUFFLE_CANNON, 2, 2);
            engine.advanceTo(match, match.t + 30000);
            engine.applyAction(match, { type: engine.MatchActionTypes.attack, player: 0, t: match.t, payload: { attackType: AttackType.TRUFFLE, row: 0, col: 0 } });
            const factory = factoryOf(match, 1);
            return factory ? factory.maxHp - factory.hp : factoryOf(runningMatch(), 1).maxHp;
        };
        const plain = lost(runningMatch({ seed: 'dmg' }));
        const heavy = lost(withItems({ [T.RUM_TRUFFLE_CANNON]: ['HEAVY_BARREL'] }, { seed: 'dmg' }));
        expect(heavy).toBeGreaterThan(plain);
    });

    test('the fountain shield of the defender and its hit points', () => {
        const spray = withItems({}, { opponent: { [T.CHOCOLATE_FOUNTAIN]: ['WIDE_SPRAY'] } });
        expect(engine.shieldFactor(spray, 1)).toBeCloseTo(0.07);
        expect(engine.shieldFactor(spray, 0)).toBeCloseTo(0.1);
        const [id] = place(spray, 1, T.CHOCOLATE_FOUNTAIN, 4, 4);
        const fountain = engine.entitiesOf(spray, 1).find(entity => entity.id === id);
        expect(fountain.maxHp).toBe(Math.round(18 * 0.8));
    });

    test('donut factory interval and chance', () => {
        const match = withItems({ [T.DONUT_FACTORY]: ['SPRINKLE_SORTER'] });
        const [id] = place(match, 0, T.DONUT_FACTORY, 3, 3);
        const factory = engine.entitiesOf(match, 0).find(entity => entity.id === id);
        expect(factory.donutAt - match.t).toBe(24000);
        const glazed = engine.donutChance(withItems({ [T.DONUT_FACTORY]: ['GLAZED_OVEN'] }), 0);
        expect(glazed).toBeCloseTo(0.766);
        expect(engine.donutChance(runningMatch(), 0)).toBeCloseTo(0.666);
    });

    test("a player sees their own loadout in the view, never the opponent's", () => {
        const match = withItems({ [T.FACTORY]: ['DARK_WALLS'] });
        expect(engine.getPlayerView(match, 1).players[0].loadout).toBeUndefined();
        const own = engine.getPlayerView(match, 0);
        expect(own.players[0].loadout).toEqual({ [T.FACTORY]: ['DARK_WALLS'] });
        // the app computes its own production and reloads from the view
        expect(engine.generatorStats(own, 0, factoryOf(match, 0)).intervalMs).toBe(16500);
        expect(newMatch().players[0].loadout).toEqual({});
    });
});
