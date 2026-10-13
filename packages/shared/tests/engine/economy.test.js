const { engine, EntityType, BoardCellTypes, act, expectOk, runningMatch, place, entityAt, cellOf } = require('./helper');

describe('cocoa production', () => {
    test('the factory yields 5 cocoa every 10 s on brown', () => {
        const match = runningMatch();
        const start = match.t;
        const cacao = match.players[0].cacao;
        engine.advanceTo(match, start + 9999);
        expect(match.players[0].cacao).toBe(cacao);
        engine.advanceTo(match, start + 10000);
        expect(match.players[0].cacao).toBe(cacao + 5);
        engine.advanceTo(match, start + 60000);
        expect(match.players[0].cacao).toBe(cacao + 30);
    });

    test('a cacao tree yields 10 every 10 s, 15 on white, starting 10 s after it was built', () => {
        const match = runningMatch({ cells: { '0:2:2': BoardCellTypes.WHITE } });
        place(match, 0, EntityType.CACAOTREE, 1, 1);
        place(match, 0, EntityType.CACAOTREE, 2, 2);
        const cacao = match.players[0].cacao;
        engine.advanceTo(match, match.t + 10000);
        // factory 5 + brown tree 10 + white tree 15
        expect(match.players[0].cacao).toBe(cacao + 30);
    });

    test('a factory on white yields 1.5 times the cocoa', () => {
        const match = runningMatch({ cells: { '0:0:0': BoardCellTypes.WHITE } });
        const cacao = match.players[0].cacao;
        engine.advanceTo(match, match.t + 10000);
        expect(match.players[0].cacao).toBe(cacao + 8);
    });

    test('a destroyed producer stops producing and loses its interval', () => {
        const match = runningMatch();
        place(match, 0, EntityType.CACAOTREE, 1, 1);
        engine.advanceTo(match, match.t + 5000);
        entityAt(match, 0, 1, 1, EntityType.CACAOTREE).hp = 0;
        cellOf(match, 0, 1, 1).occupiedBy = [];
        const cacao = match.players[0].cacao;
        engine.advanceTo(match, match.t + 5000);
        expect(match.players[0].cacao).toBe(cacao + 5);
    });
});

describe('build tokens', () => {
    test('the bucket starts full, refills one token per 15 s and is capped', () => {
        const match = runningMatch();
        const player = match.players[0];
        expect(player.buildTokens).toBe(2);
        expectOk(act(match, 0, 'build', { entityType: EntityType.CACAOTREE, row: 1, col: 1 }));
        expectOk(act(match, 0, 'build', { entityType: EntityType.CACAOTREE, row: 1, col: 2 }));
        expect(player.buildTokens).toBe(0);
        expect(act(match, 0, 'build', { entityType: EntityType.CACAOTREE, row: 1, col: 3 }).error.constructor.name).toBe('NoBuildingsLeftError');
        const start = match.startedAt;
        engine.advanceTo(match, start + 15000);
        expect(player.buildTokens).toBe(1);
        engine.advanceTo(match, start + 60000);
        expect(player.buildTokens).toBe(2);
    });

    test('a factory on black has one more token and an interval of 11.25 s', () => {
        const match = runningMatch({ cells: { '0:0:0': BoardCellTypes.BLACK } });
        const player = match.players[0];
        expect(player.buildTokens).toBe(3);
        player.buildTokens = 0;
        engine.advanceTo(match, match.startedAt + 11249);
        expect(player.buildTokens).toBe(0);
        engine.advanceTo(match, match.startedAt + 11250);
        expect(player.buildTokens).toBe(1);
    });

    test('an extension adds capacity, needs an adjacent factory, and losing it clamps the tokens', () => {
        const match = runningMatch();
        const player = match.players[0];
        player.cacao = 1000;
        expect(act(match, 0, 'build', { entityType: EntityType.FACTORY_EXTENSION, row: 3, col: 3 }).ok).toBe(false);
        expectOk(act(match, 0, 'build', { entityType: EntityType.FACTORY_EXTENSION, row: 0, col: 1 }));
        expect(engine.buildCapacity(match, 0)).toBe(4);
        player.buildTokens = 4;
        // destroy the extension through an attack of the opponent
        place(match, 1, EntityType.RUM_TRUFFLE_CANNON, 2, 2);
        entityAt(match, 0, 0, 1, EntityType.FACTORY_EXTENSION).hp = 1;
        engine.advanceTo(match, match.t + 20000);
        expectOk(act(match, 1, 'attack', { attackType: 'AttackType.TRUFFLE', row: 0, col: 1 }));
        expect(engine.buildCapacity(match, 0)).toBe(2);
        expect(player.buildTokens).toBe(2);
    });
});

describe('building rules', () => {
    test('building costs a token and its cocoa', () => {
        const match = runningMatch();
        const player = match.players[0];
        player.cacao = 50;
        expectOk(act(match, 0, 'build', { entityType: EntityType.RUM_TRUFFLE_CANNON, row: 1, col: 1 }));
        expect(player.cacao).toBe(10);
        expect(player.buildTokens).toBe(1);
        expect(act(match, 0, 'build', { entityType: EntityType.CACAOTREE, row: 1, col: 2 }).error.constructor.name).toBe('NoCacaoLeftError');
    });

    test('occupied, molten and invalid cells are rejected; only one bunny per field', () => {
        const match = runningMatch();
        match.players[0].cacao = 1000;
        expect(act(match, 0, 'build', { entityType: EntityType.CACAOTREE, row: 0, col: 0 }).ok).toBe(false);
        cellOf(match, 0, 2, 2).molten = true;
        expect(act(match, 0, 'build', { entityType: EntityType.CACAOTREE, row: 2, col: 2 }).ok).toBe(false);
        expect(act(match, 0, 'build', { entityType: EntityType.FACTORY, row: 3, col: 3 }).ok).toBe(false);
        expect(act(match, 0, 'build', { entityType: EntityType.CACAOTREE, row: -1, col: 3 }).ok).toBe(false);
        place(match, 0, EntityType.SPYING_EASTER_BUNNY, 4, 4);
        match.players[0].buildTokens = 2;
        expect(act(match, 0, 'build', { entityType: EntityType.SPYING_EASTER_BUNNY, row: 5, col: 5 }).ok).toBe(false);
    });

    test('buildings can be hidden under cream', () => {
        const match = runningMatch();
        place(match, 0, EntityType.CREAM, 2, 2);
        expectOk(act(match, 0, 'build', { entityType: EntityType.CACAOTREE, row: 2, col: 2 }));
        expect(cellOf(match, 0, 2, 2).occupiedBy.map(entity => entity.type)).toEqual([EntityType.CREAM, EntityType.CACAOTREE]);
    });
});

describe('2x2 cream', () => {
    test('covers every uncovered cell of the footprint for one token and no cocoa', () => {
        const match = runningMatch();
        const player = match.players[0];
        const cacao = player.cacao;
        place(match, 0, EntityType.CREAM, 3, 3); // pre-cream one cell
        expectOk(act(match, 0, 'build', { entityType: EntityType.CREAM, row: 2, col: 2 }));
        expect(player.cacao).toBe(cacao);
        expect(player.buildTokens).toBe(1);
        [[2, 2], [2, 3], [3, 2], [3, 3]].forEach(([row, col]) => {
            expect(cellOf(match, 0, row, col).occupiedBy.filter(entity => entity.type === EntityType.CREAM)).toHaveLength(1);
        });
    });

    test('works with two covered and two uncovered cells, and is rejected only when all four are covered', () => {
        const match = runningMatch();
        place(match, 0, EntityType.CREAM, 4, 1);
        const built = expectOk(act(match, 0, 'build', { entityType: EntityType.CREAM, row: 4, col: 0 })).events.find(event => event.type === 'built');
        expect(built.data.cells).toEqual([{ row: 4, col: 0 }, { row: 5, col: 0 }]);
        const result = act(match, 0, 'build', { entityType: EntityType.CREAM, row: 4, col: 0 });
        expect(result.ok).toBe(false);
        expect(result.error.constructor.name).toBe('BuildNotPossibleError');
    });

    test('shifts inward at the board edge and skips molten cells', () => {
        const match = runningMatch();
        cellOf(match, 0, 5, 4).molten = true;
        const built = expectOk(act(match, 0, 'build', { entityType: EntityType.CREAM, row: 5, col: 5 })).events.find(event => event.type === 'built');
        expect(built.data.cells).toEqual([{ row: 4, col: 4 }, { row: 4, col: 5 }, { row: 5, col: 5 }]);
    });

    test('can cover existing buildings', () => {
        const match = runningMatch();
        place(match, 0, EntityType.CACAOTREE, 1, 1);
        expectOk(act(match, 0, 'build', { entityType: EntityType.CREAM, row: 0, col: 0 }));
        expect(cellOf(match, 0, 0, 0).occupiedBy.map(entity => entity.type)).toEqual([EntityType.FACTORY, EntityType.CREAM]);
        expect(cellOf(match, 0, 1, 1).occupiedBy.map(entity => entity.type)).toEqual([EntityType.CACAOTREE, EntityType.CREAM]);
    });
});
