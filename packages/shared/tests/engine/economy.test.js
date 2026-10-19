const { engine, EntityType, BoardCellTypes, act, expectOk, runningMatch, place, entityAt, cellOf, fieldOf } = require('./helper');

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

describe('3x3 cream', () => {
    const creamCells = match => fieldOf(match, 0).grid
        .filter(cell => cell.occupiedBy.some(entity => entity.type === EntityType.CREAM))
        .map(cell => [cell.row, cell.col]);
    const square = (top, left, bottom, right) => {
        const cells = [];
        for (let row = top; row <= bottom; row++) {
            for (let col = left; col <= right; col++) {
                cells.push([row, col]);
            }
        }
        return cells;
    };

    test('covers the 3x3 area centred on the tapped cell for one token and no cocoa', () => {
        const match = runningMatch();
        const player = match.players[0];
        const cacao = player.cacao;
        place(match, 0, EntityType.CREAM, 3, 3); // pre-cream 2..4 x 2..4
        expectOk(act(match, 0, 'build', { entityType: EntityType.CREAM, row: 2, col: 2 }));
        expect(player.cacao).toBe(cacao);
        expect(player.buildTokens).toBe(1);
        expect(creamCells(match)).toEqual(square(1, 1, 4, 4).filter(([row, col]) => !(row === 1 && col === 4) && !(row === 4 && col === 1)));
        // one cream per cell, also where the areas overlap
        square(1, 1, 3, 3).forEach(([row, col]) => {
            expect(cellOf(match, 0, row, col).occupiedBy.filter(entity => entity.type === EntityType.CREAM)).toHaveLength(1);
        });
    });

    test('is clipped at the edges and in the corners instead of shifting inward', () => {
        const match = runningMatch();
        const corner = expectOk(act(match, 0, 'build', { entityType: EntityType.CREAM, row: 5, col: 5 })).events.find(event => event.type === 'built');
        expect(corner.data.cells).toEqual([{ row: 4, col: 4 }, { row: 4, col: 5 }, { row: 5, col: 4 }, { row: 5, col: 5 }]);
        const edge = expectOk(act(match, 0, 'build', { entityType: EntityType.CREAM, row: 0, col: 2 })).events.find(event => event.type === 'built');
        expect(edge.data.cells).toEqual([{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }, { row: 1, col: 1 }, { row: 1, col: 2 }, { row: 1, col: 3 }]);
    });

    test('skips molten cells', () => {
        const match = runningMatch();
        cellOf(match, 0, 2, 2).molten = true;
        cellOf(match, 0, 3, 4).molten = true;
        const built = expectOk(act(match, 0, 'build', { entityType: EntityType.CREAM, row: 3, col: 3 })).events.find(event => event.type === 'built');
        expect(built.data.cells).toHaveLength(7);
        expect(creamCells(match)).toEqual(square(2, 2, 4, 4).filter(([row, col]) => !(row === 2 && col === 2) && !(row === 3 && col === 4)));
    });

    test('works on a molten tapped cell as long as the area has a cell to cover', () => {
        const match = runningMatch();
        cellOf(match, 0, 3, 3).molten = true;
        const built = expectOk(act(match, 0, 'build', { entityType: EntityType.CREAM, row: 3, col: 3 })).events.find(event => event.type === 'built');
        expect(built.data.cells).toHaveLength(8);
        expect(cellOf(match, 0, 3, 3).occupiedBy).toEqual([]);
    });

    test('covers only the uncovered cells and is rejected when every cell of the area has cream', () => {
        const match = runningMatch();
        place(match, 0, EntityType.CREAM, 4, 1); // 3..5 x 0..2
        const built = expectOk(act(match, 0, 'build', { entityType: EntityType.CREAM, row: 4, col: 2 })).events.find(event => event.type === 'built');
        expect(built.data.cells).toEqual([{ row: 3, col: 3 }, { row: 4, col: 3 }, { row: 5, col: 3 }]);
        const tokens = match.players[0].buildTokens;
        const result = act(match, 0, 'build', { entityType: EntityType.CREAM, row: 4, col: 2 });
        expect(result.ok).toBe(false);
        expect(result.error.constructor.name).toBe('BuildNotPossibleError');
        // the corner area (4..5 x 0..1) is fully covered too
        expect(act(match, 0, 'build', { entityType: EntityType.CREAM, row: 5, col: 0 }).ok).toBe(false);
        expect(match.players[0].buildTokens).toBe(tokens);
    });

    test('is rejected when the only cells without cream are molten', () => {
        const match = runningMatch();
        place(match, 0, EntityType.CREAM, 1, 1); // 0..2 x 0..2
        [0, 1, 2].forEach(row => {
            cellOf(match, 0, row, 3).molten = true;
        });
        const result = act(match, 0, 'build', { entityType: EntityType.CREAM, row: 1, col: 2 });
        expect(result.ok).toBe(false);
        expect(result.error.constructor.name).toBe('BuildNotPossibleError');
    });

    test('matches created with the old 2x2 balance keep the top-left footprint (replays)', () => {
        const legacy = JSON.parse(JSON.stringify(require('../../balance').DefaultBalance));
        legacy.entities[EntityType.CREAM] = { hp: 1, costs: 0, footprint: 2 };
        const match = runningMatch({ balance: legacy });
        const built = expectOk(act(match, 0, 'build', { entityType: EntityType.CREAM, row: 5, col: 5 })).events.find(event => event.type === 'built');
        expect(built.data.cells).toEqual([{ row: 4, col: 4 }, { row: 4, col: 5 }, { row: 5, col: 4 }, { row: 5, col: 5 }]);
        const inner = expectOk(act(match, 0, 'build', { entityType: EntityType.CREAM, row: 2, col: 2 })).events.find(event => event.type === 'built');
        expect(inner.data.cells).toEqual([{ row: 2, col: 2 }, { row: 2, col: 3 }, { row: 3, col: 2 }, { row: 3, col: 3 }]);
    });

    test('creamArea is pure and works on views (balance + board size)', () => {
        const { DefaultBalance } = require('../../balance');
        expect(engine.creamArea(DefaultBalance, { rows: 6, cols: 6 }, 0, 0)).toEqual([{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }]);
        expect(engine.creamArea(DefaultBalance, { rows: 6, cols: 6 }, 2, 3)).toHaveLength(9);
        expect(engine.creamArea(DefaultBalance, { rows: 6, cols: 6 }, 6, 0)).toEqual([]);
    });

    test('can cover existing buildings', () => {
        const match = runningMatch();
        place(match, 0, EntityType.CACAOTREE, 1, 1);
        expectOk(act(match, 0, 'build', { entityType: EntityType.CREAM, row: 0, col: 0 }));
        expect(cellOf(match, 0, 0, 0).occupiedBy.map(entity => entity.type)).toEqual([EntityType.FACTORY, EntityType.CREAM]);
        expect(cellOf(match, 0, 1, 1).occupiedBy.map(entity => entity.type)).toEqual([EntityType.CACAOTREE, EntityType.CREAM]);
    });
});
