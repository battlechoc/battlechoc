// Per-player view of a match. Only views leave the host: a client never receives the full
// match, the random generator state or the seed, so hidden information cannot leak.
//
// What a viewer sees of the opponent's field:
// - cell colour, molten state and whether the cell has cream,
// - the entities of cells WITHOUT cream (no timers, no weapons),
// - never the opponent's donuts (placed or not),
// - a shield only where a visible fountain covers the cell, or where the viewer hit a shield
//   before and the cell is still shielded.

const { EntityType, isDonut } = require('../constants');
const { MatchPhase, isShielded } = require('./index');

const publicEntity = entity => ({
    id: entity.id,
    type: entity.type,
    hp: entity.hp,
    maxHp: entity.maxHp,
    position: { row: entity.position.row, col: entity.position.col },
});

const redactCell = (match, viewer, owner, cell) => {
    const creamed = cell.occupiedBy.some(entity => entity.type === EntityType.CREAM);
    const visible = cell.occupiedBy.filter(entity => !isDonut(entity.type) && (!creamed || entity.type === EntityType.CREAM));
    const known = match.players[viewer].knownShields.some(position => position.row === cell.row && position.col === cell.col);
    const shielded = isShielded(match, owner, cell.row, cell.col) && (known || visibleFountainShields(match, owner, cell));
    return {
        type: cell.type,
        previewStyle: cell.previewStyle,
        row: cell.row,
        col: cell.col,
        molten: cell.molten,
        cream: creamed,
        shielded,
        occupiedBy: visible.map(publicEntity),
    };
};

// true when a fountain whose own cell has no cream covers this cell
const visibleFountainShields = (match, owner, cell) => {
    const grid = match.board.fields[match.players[owner].fieldIndex].grid;
    const { cols } = match.board.size;
    for (let row = cell.row - 1; row <= cell.row + 1; row++) {
        for (let col = cell.col - 1; col <= cell.col + 1; col++) {
            if (row < 0 || col < 0 || row >= match.board.size.rows || col >= cols) {
                continue;
            }
            const neighbour = grid[row * cols + col];
            const hasFountain = neighbour.occupiedBy.some(entity => entity.type === EntityType.CHOCOLATE_FOUNTAIN);
            const creamed = neighbour.occupiedBy.some(entity => entity.type === EntityType.CREAM);
            if (hasFountain && !creamed) {
                return true;
            }
        }
    }
    return false;
};

const ownCell = (match, owner, cell) => ({
    ...structuredClone(cell),
    shielded: isShielded(match, owner, cell.row, cell.col),
});

const publicPlayer = (match, player) => {
    const view = {
        id: player.id,
        name: player.name,
        type: player.type,
        fieldIndex: player.fieldIndex,
    };
    if (match.phase === MatchPhase.ENDED) {
        view.statistics = structuredClone(player.statistics);
    }
    return view;
};

const publicEvent = event => {
    const { secret, visibleTo, ...rest } = event;
    return structuredClone(rest);
};

/**
 * Returns what player `viewer` (0 or 1) may know about the match.
 * The shape mirrors the match: board.fields is indexed by field index, players by player index.
 *
 * @param {object} match
 * @param {0|1} viewer
 * @param {object} [options]
 * @param {number} [options.eventsAfter] only include events with seq > eventsAfter (for incremental updates)
 */
const getPlayerView = (match, viewer, { eventsAfter = -1 } = {}) => {
    const opponent = 1 - viewer;
    const fieldsAssigned = match.players[viewer].fieldIndex !== null;
    const fields = match.board.fields.map((fieldData, fieldIndex) => {
        // before the field choice both fields only contain the initial cream, which is public
        if (!fieldsAssigned) {
            return {
                grid: fieldData.grid.map(cell => ({
                    type: cell.type,
                    previewStyle: cell.previewStyle,
                    row: cell.row,
                    col: cell.col,
                    molten: cell.molten,
                    cream: cell.occupiedBy.some(entity => entity.type === EntityType.CREAM),
                    shielded: false,
                    occupiedBy: cell.occupiedBy.filter(entity => entity.type === EntityType.CREAM).map(publicEntity),
                })),
            };
        }
        const owner = match.players[viewer].fieldIndex === fieldIndex ? viewer : opponent;
        return {
            grid: fieldData.grid.map(cell => (owner === viewer ? ownCell(match, viewer, cell) : redactCell(match, viewer, owner, cell))),
        };
    });

    return {
        engineVersion: match.engineVersion,
        viewer,
        phase: match.phase,
        t: match.t,
        phaseEndsAt: match.phaseEndsAt,
        startedAt: match.startedAt,
        endsAt: match.endsAt,
        fieldChooser: match.fieldChooser,
        outcome: structuredClone(match.outcome),
        balance: match.balance,
        board: { size: { ...match.board.size }, fields },
        players: match.players.map((player, index) => (index === viewer ? structuredClone(player) : publicPlayer(match, player))),
        events: match.events
            .filter(event => event.seq > eventsAfter && event.visibleTo.includes(viewer))
            .map(publicEvent),
    };
};

module.exports = { getPlayerView };
