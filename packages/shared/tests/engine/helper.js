const { engine, PlayerType, BoardCellTypes, EntityType } = require('../../index');

const { MatchActionTypes, MatchPhase } = engine;

const players = (typeA = PlayerType.HUMAN, typeB = PlayerType.AI_STRONG) => [
    { id: 'p0', name: 'Carolin Cacao', type: typeA },
    { id: 'p1', name: 'Gustav Ganache', type: typeB },
];

const newMatch = ({ seed = 'test', size = 6, balance } = {}) => engine.createMatch({
    players: players(),
    boardSize: { rows: size, cols: size },
    seed,
    fieldChooser: 0,
    ...(balance ? { balance } : {}),
});

const act = (match, player, type, payload, t = match.t) => engine.applyAction(match, { type: MatchActionTypes[type], player, t, payload });

const expectOk = result => {
    if (!result.ok) {
        throw result.error;
    }
    return result;
};

const fieldOf = (match, player) => match.board.fields[match.players[player].fieldIndex];
const cellOf = (match, player, row, col) => engine.cellAt(match, player, row, col);

/**
 * A match in the RUNNING phase on a board without cream where every cell is brown,
 * unless `cells` overrides single cells: { 'player:row:col': BoardCellTypes.X }.
 * Factories stand at (0,0) for both players. Running starts at t = countdown end.
 */
const runningMatch = ({ size = 6, seed = 'test', factories = [{ row: 0, col: 0 }, { row: 0, col: 0 }], cells = {}, balance } = {}) => {
    const match = newMatch({ seed, size, balance });
    expectOk(act(match, 0, 'chooseField', { fieldIndex: 0 }, 0));
    [0, 1].forEach(player => fieldOf(match, player).grid.forEach(cell => {
        cell.occupiedBy = [];
        cell.type = cells[`${player}:${cell.row}:${cell.col}`] || BoardCellTypes.BROWN;
        cell.previewStyle = cell.type.replace('BoardCellTypes.', '').toLowerCase();
    }));
    expectOk(act(match, 0, 'placeFactory', factories[0], 0));
    expectOk(act(match, 1, 'placeFactory', factories[1], 0));
    engine.advanceTo(match, match.phaseEndsAt);
    if (match.phase !== MatchPhase.RUNNING) {
        throw new Error('expected a running match');
    }
    return match;
};

// builds an entity with plenty of resources, without changing the player's cacao or tokens afterwards
const place = (match, player, entityType, row, col) => {
    const p = match.players[player];
    const { cacao, buildTokens } = p;
    p.cacao = 100000;
    p.buildTokens = 99;
    const result = expectOk(act(match, player, 'build', { entityType, row, col }));
    p.cacao = cacao;
    p.buildTokens = buildTokens;
    return result.events.find(event => event.type === 'built').data.entityIds;
};

const entityAt = (match, player, row, col, entityType) => cellOf(match, player, row, col).occupiedBy.find(entity => entity.type === entityType);

module.exports = { engine, MatchPhase, EntityType, BoardCellTypes, PlayerType, newMatch, act, expectOk, runningMatch, place, entityAt, cellOf, fieldOf, players };
