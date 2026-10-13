const { engine, MatchPhase, EntityType, PlayerType, newMatch, act, expectOk, players } = require('./helper');
const { valueAt, DefaultBalance } = require('../../index');

describe('balance values', () => {
    test('numbers, linear ranges, tiers and exponential coins', () => {
        expect(valueAt(42, 7)).toBe(42);
        expect(valueAt([10, 29], 0)).toBe(10);
        expect(valueAt([10, 29], 19)).toBe(29);
        expect(valueAt({ tiers: [[0, 2], [7, 3], [15, 4]] }, 6)).toBe(2);
        expect(valueAt({ tiers: [[0, 2], [7, 3], [15, 4]] }, 7)).toBe(3);
        expect(valueAt({ tiers: [[0, 2], [7, 3], [15, 4]] }, 20)).toBe(4);
        expect(valueAt({ exp: [102, 13002] }, 0)).toBe(102);
    });

    test('a match keeps its own snapshot of the balance', () => {
        const match = newMatch();
        expect(match.balance).toEqual(JSON.parse(JSON.stringify(DefaultBalance)));
        expect(match.balance).not.toBe(DefaultBalance);
    });
});

describe('match creation', () => {
    test('the same seed creates the same board, another seed a different one', () => {
        const a = newMatch({ seed: 'same' });
        const b = newMatch({ seed: 'same' });
        const c = newMatch({ seed: 'other' });
        expect(a.board).toEqual(b.board);
        expect(a.board).not.toEqual(c.board);
    });

    test('the board has two fields with roughly 70 % cream', () => {
        const match = newMatch({ size: 10 });
        expect(match.board.fields).toHaveLength(2);
        const creamed = match.board.fields.flatMap(field => field.grid).filter(cell => cell.occupiedBy.length > 0).length;
        expect(creamed / 200).toBeGreaterThan(0.55);
        expect(creamed / 200).toBeLessThan(0.85);
    });

    test('against an AI the human chooses the field', () => {
        const match = engine.createMatch({ players: players(PlayerType.AI_EASY, PlayerType.HUMAN), boardSize: { rows: 6, cols: 6 }, seed: 1 });
        expect(match.fieldChooser).toBe(1);
    });
});

describe('phases', () => {
    test('field choice, simultaneous placement, countdown, running', () => {
        const match = newMatch();
        expect(match.phase).toBe(MatchPhase.FIELD_CHOICE);
        expectOk(act(match, 0, 'chooseField', { fieldIndex: 1 }, 2000));
        expect(match.players.map(player => player.fieldIndex)).toEqual([1, 0]);
        expect(match.phase).toBe(MatchPhase.PLACEMENT);
        expect(match.phaseEndsAt).toBe(2000 + DefaultBalance.match.placementTimeoutMs);

        const free = (player) => match.board.fields[match.players[player].fieldIndex].grid.find(cell => cell.occupiedBy.length <= 1);
        expectOk(act(match, 1, 'placeFactory', { row: free(1).row, col: free(1).col }, 3000));
        expect(match.phase).toBe(MatchPhase.PLACEMENT);
        expectOk(act(match, 0, 'placeFactory', { row: free(0).row, col: free(0).col }, 4000));
        expect(match.phase).toBe(MatchPhase.COUNTDOWN);

        engine.advanceTo(match, 4000 + DefaultBalance.match.countdownMs);
        expect(match.phase).toBe(MatchPhase.RUNNING);
        expect(match.startedAt).toBe(7000);
        expect(match.endsAt).toBe(7000 + DefaultBalance.match.timeLimitMs);
        expect(match.players.map(player => player.buildTokens)).toEqual([2, 2]);
    });

    test('only the chooser can choose the field', () => {
        const match = newMatch();
        expect(act(match, 1, 'chooseField', { fieldIndex: 0 }, 0).ok).toBe(false);
    });

    test('timeouts choose a field and place missing factories on creamed cells', () => {
        const match = newMatch();
        engine.advanceTo(match, DefaultBalance.match.fieldChoiceTimeoutMs + DefaultBalance.match.placementTimeoutMs);
        expect(match.phase).toBe(MatchPhase.COUNTDOWN);
        [0, 1].forEach(player => {
            const factoryCell = match.board.fields[match.players[player].fieldIndex].grid
                .find(cell => cell.occupiedBy.some(entity => entity.type === EntityType.FACTORY));
            expect(factoryCell.occupiedBy.some(entity => entity.type === EntityType.CREAM)).toBe(true);
        });
        expect(match.events.filter(event => event.type === 'factoryPlaced').every(event => event.data.automatic)).toBe(true);
    });

    test('a factory cannot be placed twice or on an occupied cell', () => {
        const match = newMatch();
        expectOk(act(match, 0, 'chooseField', { fieldIndex: 0 }, 0));
        const grid = match.board.fields[0].grid;
        expectOk(act(match, 0, 'placeFactory', { row: grid[0].row, col: grid[0].col }, 0));
        expect(act(match, 0, 'placeFactory', { row: grid[1].row, col: grid[1].col }, 0).ok).toBe(false);
        expect(act(match, 1, 'placeFactory', { row: 99, col: 0 }, 0).ok).toBe(false);
    });

    test('actions in the past are rejected', () => {
        const match = newMatch();
        engine.advanceTo(match, 5000);
        const result = act(match, 0, 'chooseField', { fieldIndex: 0 }, 4000);
        expect(result.ok).toBe(false);
        expect(result.error.constructor.name).toBe('InvalidTimeError');
    });
});
