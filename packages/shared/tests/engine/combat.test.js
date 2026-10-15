const { engine, EntityType, BoardCellTypes, act, expectOk, runningMatch, place, entityAt, cellOf } = require('./helper');
const { AttackType } = require('../../index');

const TRUFFLE = AttackType.TRUFFLE;
const shoot = (match, player, row, col, attackType = TRUFFLE, allowRush = false) => act(match, player, 'attack', { attackType, row, col, allowRush });

describe('rush cooldowns', () => {
    test('a new cannon charges for 10 s, is blue (rushable for 10 cocoa) until 20 s and then green (free)', () => {
        const match = runningMatch();
        place(match, 0, EntityType.RUM_TRUFFLE_CANNON, 1, 1);
        place(match, 1, EntityType.CACAOTREE, 3, 3);
        const built = match.t;
        const player = match.players[0];
        player.cacao = 100;

        engine.advanceTo(match, built + 9999);
        expect(shoot(match, 0, 3, 3, TRUFFLE, true).error.constructor.name).toBe('WeaponNotReadyError');

        engine.advanceTo(match, built + 10000);
        const [{ weapon }] = engine.weaponsOf(match, 0, TRUFFLE);
        expect(engine.weaponStatus(match, weapon, match.t).state).toBe(engine.WeaponState.RUSHABLE);
        expect(shoot(match, 0, 3, 3, TRUFFLE, false).error.constructor.name).toBe('WeaponNotReadyError');
        const cacao = player.cacao;
        const rushed = expectOk(shoot(match, 0, 3, 3, TRUFFLE, true));
        expect(player.cacao).toBe(cacao - 10);
        expect(rushed.events.find(event => event.type === 'attack').data.rushCost).toBe(10);

        // fired at t, so blue again at t+10 s and green at t+20 s
        place(match, 1, EntityType.CACAOTREE, 3, 4);
        engine.advanceTo(match, match.t + 20000);
        const free = expectOk(shoot(match, 0, 3, 4, TRUFFLE, true));
        expect(free.events.find(event => event.type === 'attack').data.rushCost).toBe(0);
        expect(player.statistics.rushes).toBe(1);
    });

    test('a green weapon is preferred over a blue one, and rushing needs enough cocoa', () => {
        const match = runningMatch();
        place(match, 0, EntityType.RUM_TRUFFLE_CANNON, 1, 1);
        engine.advanceTo(match, match.t + 10000);
        place(match, 0, EntityType.RUM_TRUFFLE_CANNON, 1, 2);
        place(match, 1, EntityType.CACAOTREE, 3, 3);
        engine.advanceTo(match, match.t + 10000);
        // first cannon green (20 s), second blue (10 s)
        expect(expectOk(shoot(match, 0, 3, 3, TRUFFLE, true)).events.find(event => event.type === 'attack').data.rushCost).toBe(0);
        place(match, 1, EntityType.CACAOTREE, 3, 4);
        match.players[0].cacao = 5;
        expect(shoot(match, 0, 3, 4, TRUFFLE, true).error.constructor.name).toBe('NoCacaoLeftError');
    });

    test('the ballista cannot rush', () => {
        const match = runningMatch();
        const status = { ...match.balance.entities[EntityType.HOT_CHOCOLATE_BALLISTA].weapons[0].rush };
        expect(status.enabled).toBe(false);
    });

    test('a fruit cannon keeps the truffle weapon and its timer and adds a fruit weapon', () => {
        const match = runningMatch();
        place(match, 0, EntityType.RUM_TRUFFLE_CANNON, 1, 1);
        const chargedAt = engine.weaponsOf(match, 0, TRUFFLE)[0].weapon.chargedAt;
        engine.advanceTo(match, match.t + 5000);
        place(match, 0, EntityType.FRUIT_CANNON, 1, 1);
        const cell = cellOf(match, 0, 1, 1);
        expect(cell.occupiedBy.map(entity => entity.type)).toEqual([EntityType.FRUIT_CANNON]);
        const weapons = cell.occupiedBy[0].weapons;
        expect(weapons.map(weapon => weapon.attackType)).toEqual([TRUFFLE, AttackType.FRUIT]);
        expect(weapons[0].chargedAt).toBe(chargedAt);
        expect(weapons[1].chargedAt).toBe(match.t);
        expect(act(match, 0, 'build', { entityType: EntityType.FRUIT_CANNON, row: 2, col: 2 }).ok).toBe(false);
    });
});

describe('attacks', () => {
    const armed = () => {
        const match = runningMatch();
        place(match, 0, EntityType.RUM_TRUFFLE_CANNON, 1, 1);
        engine.advanceTo(match, match.t + 20000);
        return match;
    };

    test('damage is rolled by the engine within the spread and is reproducible', () => {
        const damages = ['a', 'b'].map(() => {
            const match = armed();
            place(match, 1, EntityType.CHOCOLATE_FOUNTAIN, 4, 4);
            const fountain = entityAt(match, 1, 4, 4, EntityType.CHOCOLATE_FOUNTAIN);
            fountain.hp = 1000;
            expectOk(act(match, 0, 'attack', { attackType: AttackType.TRUFFLE, row: 4, col: 4 }));
            return 1000 - fountain.hp;
        });
        expect(damages[0]).toBe(damages[1]);
        // truffle on a shield does 10 % of 9 ± 20 %
        expect(damages[0]).toBeGreaterThanOrEqual(0);
        expect(damages[0]).toBeLessThanOrEqual(2);
    });

    test('a truffle hit destroys cream and damages what is beneath', () => {
        const match = armed();
        place(match, 1, EntityType.CREAM, 3, 3);
        place(match, 1, EntityType.CACAOTREE, 3, 3);
        const result = expectOk(shoot(match, 0, 3, 3)).events.find(event => event.type === 'attack').data.result;
        expect(result.destroyed).toEqual(expect.arrayContaining([EntityType.CREAM, EntityType.CACAOTREE]));
        expect(cellOf(match, 1, 3, 3).occupiedBy).toHaveLength(0);
    });

    test('empty cells cannot be attacked with truffles', () => {
        const match = armed();
        expect(shoot(match, 0, 5, 5).error.constructor.name).toBe('TargetEmptyError');
    });

    test('a shielded cell redirects the hit to the fountain, fruit does full damage to it', () => {
        const match = armed();
        place(match, 1, EntityType.CHOCOLATE_FOUNTAIN, 3, 3);
        place(match, 1, EntityType.CACAOTREE, 3, 4);
        const fountain = entityAt(match, 1, 3, 3, EntityType.CHOCOLATE_FOUNTAIN);
        const result = expectOk(shoot(match, 0, 3, 4)).events.find(event => event.type === 'attack').data.result;
        expect(result.shielded).toBe(true);
        expect(entityAt(match, 1, 3, 4, EntityType.CACAOTREE)).toBeDefined();
        expect(match.players[0].knownShields).toEqual([{ row: 3, col: 4 }]);

        place(match, 0, EntityType.FRUIT_CANNON, 1, 1);
        engine.advanceTo(match, match.t + 30000);
        const before = fountain.hp;
        expectOk(act(match, 0, 'attack', { attackType: AttackType.FRUIT, row: 3, col: 4 }));
        expect(before - fountain.hp).toBeGreaterThanOrEqual(7);
    });

    test('a pink donut stuns the attacker for 15 s', () => {
        const match = armed();
        place(match, 0, EntityType.RUM_TRUFFLE_CANNON, 1, 2);
        engine.advanceTo(match, match.t + 20000);
        place(match, 1, EntityType.CACAOTREE, 3, 3);
        place(match, 1, EntityType.CACAOTREE, 3, 5);
        match.players[1].donuts = [{ id: 'e9999', type: EntityType.DONUT_STOP_PINK, hp: 1, maxHp: 1, position: null }];
        expectOk(act(match, 1, 'placeDonut', { donutType: EntityType.DONUT_STOP_PINK, row: 3, col: 3 }));
        const result = expectOk(shoot(match, 0, 3, 3)).events.find(event => event.type === 'attack').data.result;
        expect(result.traps).toEqual(['DonutEffect.PINK']);
        expect(shoot(match, 0, 3, 5).error.constructor.name).toBe('StunnedError');
        engine.advanceTo(match, match.t + 15000);
        expectOk(shoot(match, 0, 3, 5));
    });

    test('a portal donut swaps contents and colours with its partner', () => {
        const match = runningMatch({ cells: { '1:2:2': BoardCellTypes.WHITE, '1:5:5': BoardCellTypes.BLACK } });
        place(match, 0, EntityType.RUM_TRUFFLE_CANNON, 1, 1);
        engine.advanceTo(match, match.t + 20000);
        place(match, 1, EntityType.CACAOTREE, 2, 2);
        place(match, 1, EntityType.RUM_TRUFFLE_CANNON, 5, 5);
        match.players[1].donuts = [
            { id: 'e9001', type: EntityType.DONUT_PORTAL_BLUE, hp: 1, maxHp: 1, position: null, pairId: 'e9000' },
            { id: 'e9002', type: EntityType.DONUT_PORTAL_RED, hp: 1, maxHp: 1, position: null, pairId: 'e9000' },
        ];
        expect(act(match, 1, 'placeDonut', { donutType: EntityType.DONUT_PORTAL_RED, row: 5, col: 5 }).ok).toBe(false);
        expectOk(act(match, 1, 'placeDonut', { donutType: EntityType.DONUT_PORTAL_BLUE, row: 2, col: 2 }));
        expectOk(act(match, 1, 'placeDonut', { donutType: EntityType.DONUT_PORTAL_RED, row: 5, col: 5 }));
        expectOk(shoot(match, 0, 2, 2));
        // the cannon from (5,5) was swapped into the attacked cell and took the hit; the tree moved away
        expect(entityAt(match, 1, 5, 5, EntityType.CACAOTREE)).toBeDefined();
        expect(cellOf(match, 1, 5, 5).type).toBe(BoardCellTypes.WHITE);
        expect(cellOf(match, 1, 2, 2).type).toBe(BoardCellTypes.BLACK);
        expect(engine.entitiesOf(match, 1).some(entity => entity.type === EntityType.DONUT_PORTAL_BLUE)).toBe(false);
    });

    test('a bunny reveals a 3x3 area, or is caught by an xmas factory that becomes a ready ballista', () => {
        const match = runningMatch();
        place(match, 0, EntityType.SPYING_EASTER_BUNNY, 2, 2);
        place(match, 1, EntityType.CREAM, 0, 4);
        engine.advanceTo(match, match.t + 60000);
        const reveal = expectOk(act(match, 0, 'attack', { attackType: AttackType.BUNNY, row: 1, col: 5 })).events.find(event => event.type === 'attack');
        expect(reveal.data.result.revealed.length).toBeGreaterThan(0);
        expect(match.players[0].statistics.espionages).toBe(1);

        place(match, 1, EntityType.XMAS_FACTORY, 4, 4);
        engine.advanceTo(match, match.t + 60000);
        const caught = expectOk(act(match, 0, 'attack', { attackType: AttackType.BUNNY, row: 3, col: 3 })).events.find(event => event.type === 'attack');
        expect(caught.data.result.caught).toBe(true);
        expect(engine.weaponsOf(match, 0, AttackType.BUNNY)).toHaveLength(0);
        const [{ weapon }] = engine.weaponsOf(match, 1, AttackType.HOT_CHOCOLATE);
        expect(engine.weaponStatus(match, weapon, match.t).state).toBe(engine.WeaponState.READY);
    });

    test('hot chocolate melts a cell permanently and kills everything in it', () => {
        const match = runningMatch();
        place(match, 1, EntityType.SPYING_EASTER_BUNNY, 2, 2);
        place(match, 0, EntityType.XMAS_FACTORY, 3, 3);
        engine.advanceTo(match, match.t + 60000);
        expectOk(act(match, 1, 'attack', { attackType: AttackType.BUNNY, row: 3, col: 3 }));
        place(match, 1, EntityType.CACAOTREE, 4, 4);
        expectOk(act(match, 0, 'attack', { attackType: AttackType.HOT_CHOCOLATE, row: 4, col: 4 }));
        expect(cellOf(match, 1, 4, 4).molten).toBe(true);
        expect(cellOf(match, 1, 4, 4).occupiedBy).toHaveLength(0);
        engine.advanceTo(match, match.t + 30000);
        expect(act(match, 0, 'attack', { attackType: AttackType.HOT_CHOCOLATE, row: 4, col: 4 }).error.constructor.name).toBe('AlreadyMolten');
    });
});

describe('outcome', () => {
    test('a player without generators and weapons is eliminated', () => {
        const match = runningMatch();
        place(match, 0, EntityType.RUM_TRUFFLE_CANNON, 1, 1);
        engine.advanceTo(match, match.t + 20000);
        entityAt(match, 1, 0, 0, EntityType.FACTORY).hp = 1;
        const result = expectOk(shoot(match, 0, 0, 0));
        expect(result.events.some(event => event.type === 'ended')).toBe(true);
        expect(match.phase).toBe(engine.MatchPhase.ENDED);
        expect(match.outcome).toMatchObject({ winners: [0], reason: engine.OutcomeReason.ELIMINATION });
        expect(act(match, 0, 'build', { entityType: EntityType.CACAOTREE, row: 2, col: 2 }).error.constructor.name).toBe('GameAlreadyEndedError');
    });

    test('a player with a weapon survives the loss of the factory', () => {
        const match = runningMatch();
        place(match, 0, EntityType.RUM_TRUFFLE_CANNON, 1, 1);
        place(match, 1, EntityType.RUM_TRUFFLE_CANNON, 1, 1);
        engine.advanceTo(match, match.t + 20000);
        entityAt(match, 1, 0, 0, EntityType.FACTORY).hp = 1;
        expectOk(shoot(match, 0, 0, 0));
        expect(match.phase).toBe(engine.MatchPhase.RUNNING);
    });

    test('surrender makes the other player win', () => {
        const match = runningMatch();
        expectOk(act(match, 1, 'surrender', {}));
        expect(match.outcome).toMatchObject({ winners: [0], reason: engine.OutcomeReason.SURRENDER });
    });

    test('at the time limit the higher board value wins', () => {
        const match = runningMatch();
        place(match, 0, EntityType.CHOCOLATE_FOUNTAIN, 3, 3);
        engine.advanceTo(match, match.endsAt);
        expect(match.outcome).toMatchObject({ winners: [0], reason: engine.OutcomeReason.TIME_LIMIT });
        expect(engine.nextTimerAt(match)).toBeNull();
    });

    test('the winner gets winner-only awards, the loser only those open to both', () => {
        const match = runningMatch();
        expectOk(act(match, 1, 'surrender', {}));
        const awards = engine.computeMatchAwards(match, 0);
        expect(awards.map(award => award.key)).toContain('OUVERT');
        expect(awards.length).toBeLessThanOrEqual(5);
        expect(typeof awards[0].title()).toBe('string');
        const loser = engine.computeMatchAwards(match, 1);
        expect(loser.length).toBeGreaterThan(0);
        loser.forEach(award => expect(award.who).toBe('B'));
    });
});
