// The actions that put something on a field: choosing the field, placing the factory,
// building, and placing donuts.

const { EntityType, isDonut } = require('../constants');
const {
    ActionValidationError,
    InvalidActionIssuerError,
    NoBuildingsLeftError,
    NoCacaoLeftError,
    BuildNotPossibleError,
} = require('../errors');
const { MatchPhase, BUILDABLE } = require('./enums');
const {
    spec,
    buildCosts,
    cellAt,
    contains,
    nonDonuts,
    factoryPlaceable,
    entitiesOf,
    createWeapon,
} = require('./selectors');
const { pushEvent, createEntity, startTimers } = require('./entities');
const { enterPlacement, ownFactory, placeFactoryInternal, requirePhase } = require('./phases');

const chooseField = (match, events, action) => {
    requirePhase(match, MatchPhase.FIELD_CHOICE);
    if (action.player !== match.fieldChooser) {
        throw new InvalidActionIssuerError(action, action.player, match.fieldChooser);
    }
    const fieldIndex = action.payload && action.payload.fieldIndex;
    if (fieldIndex !== 0 && fieldIndex !== 1) {
        throw new ActionValidationError(action);
    }
    enterPlacement(match, events, fieldIndex);
};

const placeFactory = (match, events, action) => {
    requirePhase(match, MatchPhase.PLACEMENT);
    if (ownFactory(match, action.player)) {
        throw new BuildNotPossibleError('The factory has already been placed.');
    }
    const { row, col } = action.payload || {};
    const cell = cellAt(match, action.player, row, col);
    if (!cell || !factoryPlaceable(cell)) {
        throw new BuildNotPossibleError('The factory cannot be placed on this cell.');
    }
    placeFactoryInternal(match, events, action.player, cell);
};

/**
 * The cells (row, col) one cream build covers when tapped at (row, col), from a balance
 * (match.balance or view.balance) and the board size. Pure, so the AIs and the UI can use it.
 * - `area: n`: the n×n square centred on the tapped cell, clipped at the board edges (like the
 *   bunny and the fountain; since 2026-10-19).
 * - `footprint: n` (balance snapshots of matches created before): the n×n square anchored
 *   top-left at the tapped cell, shifted inward at the edges. Kept so that saved matches and
 *   logged actions replay as they were played.
 */
const creamArea = (balance, boardSize, row, col) => {
    const { rows, cols } = boardSize;
    const creamSpec = balance.entities[EntityType.CREAM] || {};
    const inBoard = (r, c) => r >= 0 && c >= 0 && r < rows && c < cols;
    const square = (top, left, size) => {
        const cells = [];
        for (let r = top; r < top + size; r++) {
            for (let c = left; c < left + size; c++) {
                if (inBoard(r, c)) {
                    cells.push({ row: r, col: c });
                }
            }
        }
        return cells;
    };
    if (!inBoard(row, col)) {
        return [];
    }
    if (creamSpec.area) {
        const radius = Math.floor(creamSpec.area / 2);
        return square(row - radius, col - radius, 2 * radius + 1);
    }
    const size = creamSpec.footprint || 1;
    return square(Math.max(0, Math.min(row, rows - size)), Math.max(0, Math.min(col, cols - size)), size);
};

const creamFootprint = (match, playerIndex, row, col) => creamArea(match.balance, match.board.size, row, col)
    .map(position => cellAt(match, playerIndex, position.row, position.col));

const countOnField = (match, playerIndex, entityType) => entitiesOf(match, playerIndex).filter(entity => entity.type === entityType).length;

const adjacentToFactory = (match, playerIndex, row, col) => [[0, -1], [0, 1], [-1, 0], [1, 0]]
    .map(([dr, dc]) => cellAt(match, playerIndex, row + dr, col + dc))
    .some(cell => cell && contains(cell, EntityType.FACTORY));

const build = (match, events, action) => {
    requirePhase(match, MatchPhase.RUNNING);
    const playerIndex = action.player;
    const player = match.players[playerIndex];
    const { entityType, row, col } = action.payload || {};
    if (!BUILDABLE.includes(entityType)) {
        throw new BuildNotPossibleError('This entity cannot be built: ' + entityType);
    }
    const cell = cellAt(match, playerIndex, row, col);
    if (!cell) {
        throw new BuildNotPossibleError('Invalid cell row: ' + row + ' col: ' + col);
    }
    if (player.buildTokens < 1) {
        throw new NoBuildingsLeftError();
    }
    const costs = buildCosts(match, playerIndex, entityType);
    if (player.cacao < costs) {
        throw new NoCacaoLeftError();
    }

    const built = [];
    if (entityType === EntityType.CREAM) {
        const targets = creamFootprint(match, playerIndex, row, col).filter(target => !target.molten && !contains(target, EntityType.CREAM));
        if (targets.length === 0) {
            throw new BuildNotPossibleError('Every cell of the cream area already has cream.');
        }
        targets.forEach(target => {
            const cream = createEntity(match, playerIndex, EntityType.CREAM, target);
            target.occupiedBy.push(cream);
            built.push(cream);
        });
    } else {
        if (cell.molten) {
            throw new BuildNotPossibleError('Cannot build on molten cells.');
        }
        const maxPerField = spec(match, entityType).maxPerField;
        if (maxPerField && countOnField(match, playerIndex, entityType) >= maxPerField) {
            throw new BuildNotPossibleError('Can only build ' + maxPerField + ' of ' + entityType + '.');
        }
        const occupants = nonDonuts(cell);
        let replacedCannon;
        if (entityType === EntityType.FRUIT_CANNON) {
            replacedCannon = occupants.find(entity => entity.type === EntityType.RUM_TRUFFLE_CANNON);
            if (!replacedCannon) {
                throw new BuildNotPossibleError('A fruit cannon needs a truffle cannon on the cell.');
            }
        } else if (!occupants.every(entity => entity.type === EntityType.CREAM)) {
            throw new BuildNotPossibleError('The cell is occupied.');
        }
        if (entityType === EntityType.FACTORY_EXTENSION && !adjacentToFactory(match, playerIndex, row, col)) {
            throw new BuildNotPossibleError('A factory extension needs an adjacent factory.');
        }
        const entity = createEntity(match, playerIndex, entityType, cell);
        if (replacedCannon) {
            if (spec(match, EntityType.FRUIT_CANNON).keepsTruffleWeapon) {
                entity.weapons = replacedCannon.weapons.map(weapon => ({ ...weapon }));
                entity.weapons.push(...spec(match, EntityType.FRUIT_CANNON).weapons
                    .map(ws => createWeapon(match, playerIndex, EntityType.FRUIT_CANNON, ws, match.t)));
            }
            cell.occupiedBy = cell.occupiedBy.filter(other => other.id !== replacedCannon.id);
        }
        cell.occupiedBy.push(entity);
        startTimers(match, playerIndex, entity, match.t);
        built.push(entity);
    }

    player.buildTokens -= 1;
    player.cacao -= costs;
    player.statistics.spentCacao += costs;
    player.statistics.builtEntities += 1;
    const visibleToOpponent = entityType === EntityType.CREAM || !contains(cell, EntityType.CREAM);
    pushEvent(match, events, 'built', playerIndex, visibleToOpponent ? [0, 1] : [playerIndex], {
        entityType,
        cells: built.map(entity => ({ row: entity.position.row, col: entity.position.col })),
        entityIds: built.map(entity => entity.id),
    }, { cellType: cell.type, creamed: contains(cell, EntityType.CREAM) });
};

const placeDonut = (match, events, action) => {
    requirePhase(match, MatchPhase.RUNNING);
    const playerIndex = action.player;
    const player = match.players[playerIndex];
    const { donutType, row, col } = action.payload || {};
    const donut = player.donuts.find(candidate => candidate.type === donutType);
    if (!donut) {
        throw new BuildNotPossibleError('No donut of this type to place: ' + donutType);
    }
    if (donutType === EntityType.DONUT_PORTAL_RED && player.donuts.some(candidate => candidate.type === EntityType.DONUT_PORTAL_BLUE)) {
        throw new BuildNotPossibleError('Place the blue portal donut first.');
    }
    const cell = cellAt(match, playerIndex, row, col);
    if (!cell || cell.molten || cell.occupiedBy.some(entity => isDonut(entity.type))) {
        throw new BuildNotPossibleError('The donut cannot be placed on this cell.');
    }
    donut.position = { row, col };
    cell.occupiedBy.push(donut);
    player.donuts = player.donuts.filter(candidate => candidate.id !== donut.id);
    pushEvent(match, events, 'donutPlaced', playerIndex, [playerIndex], { donutType, row, col, entityId: donut.id });
};

module.exports = { chooseField, placeFactory, creamArea, creamFootprint, build, placeDonut };
