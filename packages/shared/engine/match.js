// A new match: the board with its two fields, and the players.

const { BoardCellTypes, EntityType } = require('../constants');
const { DefaultBalance } = require('../balance');
const { sanitizeLoadout } = require('../equipment');
const rng = require('./rng');
const { MatchPhase } = require('./enums');
const { isAi } = require('./selectors');
const { newId } = require('./entities');

const generateBoard = (match, size) => {
    const { creamProbability, cellTypeWeights } = match.balance.board;
    const fields = [];
    for (let f = 0; f < 2; f++) {
        const grid = [];
        for (let row = 0; row < size.rows; row++) {
            for (let col = 0; col < size.cols; col++) {
                const type = BoardCellTypes[rng.pickWeighted(match, cellTypeWeights)];
                const cell = { type, previewStyle: type.replace('BoardCellTypes.', '').toLowerCase(), row, col, occupiedBy: [], molten: false };
                if (rng.next(match) < creamProbability) {
                    cell.occupiedBy.push({ id: newId(match), type: EntityType.CREAM, hp: 1, maxHp: 1, position: { row, col } });
                }
                grid.push(cell);
            }
        }
        fields.push({ grid });
    }
    return { size: { rows: size.rows, cols: size.cols }, fields };
};

/**
 * Creates a new match in the FIELD_CHOICE phase at match time 0.
 *
 * @param {object} options
 * @param {Array<{id, name, type, loadout}>} options.players exactly two players (loadout: equipment)
 * @param {{rows, cols}} options.boardSize
 * @param {string|number} options.seed seed of the board and of every random decision
 * @param {object} [options.balance] balance config, snapshotted into the match
 * @param {0|1} [options.fieldChooser] player choosing the field; default: the human against an AI, otherwise a coin toss
 */
const createMatch = ({ players, boardSize, seed, balance = DefaultBalance, fieldChooser }) => {
    if (!Array.isArray(players) || players.length !== 2) {
        throw new Error('A match needs exactly two players');
    }
    const snapshot = JSON.parse(JSON.stringify(balance));
    const match = {
        engineVersion: 1,
        balance: snapshot,
        seed: String(seed),
        rng: rng.seedFrom(seed),
        nextId: 1,
        eventSeq: 0,
        t: 0,
        phase: MatchPhase.FIELD_CHOICE,
        phaseEndsAt: snapshot.match.fieldChoiceTimeoutMs,
        startedAt: null,
        endsAt: null,
        fieldChooser: null,
        board: null,
        players: players.map(player => ({
            id: player.id,
            name: player.name,
            type: player.type,
            loadout: sanitizeLoadout(player.loadout),
            fieldIndex: null,
            cacao: snapshot.match.startCacao,
            buildTokens: 0,
            stunnedUntil: 0,
            donuts: [],
            knownShields: [],
            statistics: {
                attacks: 0, builtEntities: 0, espionages: 0, moltenFields: 0,
                shotsFired: 0, shotsHit: 0, rushes: 0, producedCacao: 0, spentCacao: 0,
            },
        })),
        events: [],
        outcome: null,
    };
    match.board = generateBoard(match, boardSize);
    if (fieldChooser === 0 || fieldChooser === 1) {
        match.fieldChooser = fieldChooser;
    } else if (isAi(players[0].type) !== isAi(players[1].type)) {
        match.fieldChooser = isAi(players[0].type) ? 1 : 0;
    } else {
        match.fieldChooser = rng.nextInt(match, 2);
    }
    return match;
};

module.exports = { createMatch };
