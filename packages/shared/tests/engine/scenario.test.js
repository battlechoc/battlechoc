const { engine, MatchPhase, EntityType, BoardCellTypes, newMatch, cellOf } = require('./helper');
const { AttackType } = require('../../index');

describe('scenarios', () => {
    test('a placement scenario rewrites cells and waits for the factories', () => {
        const match = newMatch({ size: 8 });
        engine.prepareScenario(match, {
            cells: [
                { row: 7, col: 7, type: BoardCellTypes.BLACK, cream: true },
                { row: 6, col: 7, type: BoardCellTypes.BROWN, cream: false },
            ],
        });
        expect(match.phase).toBe(MatchPhase.PLACEMENT);
        expect(cellOf(match, 0, 7, 7).type).toBe(BoardCellTypes.BLACK);
        expect(cellOf(match, 0, 7, 7).occupiedBy.map(entity => entity.type)).toEqual([EntityType.CREAM]);
        expect(cellOf(match, 0, 6, 7).occupiedBy).toHaveLength(0);
    });

    test('a running scenario starts with prepared buildings, timers and cacao', () => {
        const match = newMatch({ size: 6 });
        engine.prepareScenario(match, {
            phase: MatchPhase.RUNNING,
            cacao: [200, 50],
            cells: [
                { row: 0, col: 0, type: BoardCellTypes.BLACK, cream: true, entities: [EntityType.FACTORY] },
                { row: 3, col: 4, cream: true, entities: [EntityType.RUM_TRUFFLE_CANNON] },
                { row: 1, col: 1, cream: true, entities: [EntityType.FRUIT_CANNON] },
                { player: 1, row: 3, col: 0, cream: true, entities: [EntityType.FACTORY] },
            ],
        });
        expect(match.phase).toBe(MatchPhase.RUNNING);
        expect(match.players.map(player => player.cacao)).toEqual([200, 50]);
        expect(match.players[0].buildTokens).toBe(3);
        expect(engine.weaponsOf(match, 0, AttackType.TRUFFLE)).toHaveLength(2);
        expect(engine.weaponsOf(match, 0, AttackType.FRUIT)).toHaveLength(1);
        engine.advanceTo(match, match.t + 10000);
        expect(match.players[0].cacao).toBe(200 + 5);
    });

    test('missing factories are placed when a scenario starts running', () => {
        const match = newMatch();
        engine.prepareScenario(match, { phase: MatchPhase.RUNNING });
        [0, 1].forEach(player => expect(engine.entitiesOf(match, player).some(entity => entity.type === EntityType.FACTORY)).toBe(true));
    });

    test('a scenario needs a fresh match', () => {
        const match = newMatch();
        engine.prepareScenario(match, {});
        expect(() => engine.prepareScenario(match, {})).toThrow();
    });
});

describe('scenario extras for the tutorial', () => {
    const { engine, PlayerType } = require('./helper');
    const { EntityType } = require('../../index');
    const newMatch = () => engine.createMatch({
        players: [
            { id: 'a', name: 'A', type: PlayerType.HUMAN },
            { id: 'b', name: 'B', type: PlayerType.AI_TUTORIAL },
        ],
        boardSize: { rows: 6, cols: 6 },
        seed: 'extras',
    });

    test('damaged entities and unplaced donuts', () => {
        const match = newMatch();
        engine.prepareScenario(match, {
            phase: engine.MatchPhase.RUNNING,
            cells: [
                { player: 0, row: 0, col: 0, cream: false, entities: [EntityType.FACTORY] },
                { player: 1, row: 1, col: 1, cream: false, entities: [{ type: EntityType.FACTORY, hp: 3 }] },
            ],
            donuts: [[EntityType.DONUT_PORTAL_BLUE, EntityType.DONUT_PORTAL_RED], []],
        });
        const factory = engine.cellAt(match, 1, 1, 1).occupiedBy.find(entity => entity.type === EntityType.FACTORY);
        expect(factory.hp).toBe(3);
        expect(factory.maxHp).toBeGreaterThan(3);
        const [blue, red] = match.players[0].donuts;
        expect(blue.pairId).toBeDefined();
        expect(red.pairId).toBe(blue.pairId);
        expect(engine.applyAction(match, { type: engine.MatchActionTypes.placeDonut, player: 0, t: 0, payload: { donutType: EntityType.DONUT_PORTAL_BLUE, row: 2, col: 2 } }).ok).toBe(true);
    });

    test('a scripted agent plays its actions at their times', () => {
        const match = newMatch();
        engine.prepareScenario(match, {
            phase: engine.MatchPhase.RUNNING,
            cells: [
                { player: 0, row: 0, col: 0, cream: false, entities: [EntityType.FACTORY] },
                { player: 1, row: 5, col: 5, cream: false, entities: [EntityType.FACTORY] },
            ],
        });
        const build = (at, row) => ({ at, type: engine.MatchActionTypes.build, payload: { entityType: EntityType.CACAOTREE, row, col: 3 } });
        const agent = engine.createAgent({ kind: 'ScriptedAgent', playerIndex: 0, options: { script: [build(500, 1), build(500, 2), build(16000, 3)] } });
        const applied = [];
        let next = engine.nextWakeAt(match, [agent]);
        while (next !== null && next <= 17000) {
            engine.advanceTo(match, next);
            applied.push(...engine.runDueAgents(match, [agent]));
            next = engine.nextWakeAt(match, [agent]);
        }
        // two build slots at the start, the third one after the factory's 15 s refill
        expect(applied.map(action => [action.t, action.payload.row])).toEqual([[500, 1], [600, 2], [16000, 3]]);
        expect(agent.done).toBe(true);
        const restored = engine.createAgent(engine.serializeAgent(agent));
        expect(restored.index).toBe(3);
    });
});
