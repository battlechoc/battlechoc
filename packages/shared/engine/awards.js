// Awards of the real-time engine, computed by the host from the match and its event log.
// Same titles and coins as the turn-based awards; turn counts became durations, the
// "chose the first turn" award is gone, and PERSONALCONCERN got cheaper because cream
// is free and covers 2x2 cells now.

const { BoardCellTypes, EntityType, AttackType, PlayerType } = require('../constants');
const { MatchPhase, entitiesOf } = require('./index');

// lazy, because the translations live in the package index which requires this module
const tr = key => () => {
    const shared = require('../index');
    return shared.translate(shared.translationKeys[key]);
};

const eventsOf = (match, type, player) => match.events.filter(event => event.type === type && (typeof player === 'undefined' || event.player === player));
const builtCount = (match, player, entityType) => eventsOf(match, 'built', player).filter(event => event.data.entityType === entityType).length;
const attacksOf = (match, player, attackType) => eventsOf(match, 'attack', player).filter(event => typeof attackType === 'undefined' || event.data.attackType === attackType);
const ownCells = (match, player) => match.board.fields[match.players[player].fieldIndex].grid;
const countOwn = (match, player, entityType) => entitiesOf(match, player).filter(entity => entity.type === entityType).length;
const duration = match => (match.outcome && match.startedAt !== null ? match.outcome.t - match.startedAt : 0);
const factoryPlacement = (match, player) => eventsOf(match, 'factoryPlaced', player)[0];
const hitCreamedFactory = event => event && event.secret.targetBefore.includes(EntityType.FACTORY) && event.secret.targetBefore.includes(EntityType.CREAM);

const award = (key, coins, isFulfilled) => ({
    key,
    title: tr(`AWARDS_${key}_TITLE`),
    subtitle: tr(`AWARDS_${key}_SUBTITLE`),
    coins,
    isFulfilled,
});

const awards = [
    award('WINNER', 25, () => true),
    award('NERD', 50, (m, p) => {
        const trees = ownCells(m, p).filter(cell => cell.occupiedBy.some(entity => entity.type === EntityType.CACAOTREE));
        return trees.length > 0 && trees.every(cell => cell.type === BoardCellTypes.WHITE);
    }),
    award('UNUSED', 50, (m, p) => countOwn(m, p, EntityType.SPYING_EASTER_BUNNY) > 0 && m.players[p].statistics.espionages === 0),
    award('RUSHHOUR', 100, m => duration(m) <= m.balance.awards.rushHourMs),
    award('MINIMALIST', 150, (m, p) => builtCount(m, p, EntityType.RUM_TRUFFLE_CANNON) === 1),
    award('ONEHITWONDER', 1800, (m, p) => hitCreamedFactory(attacksOf(m, p)[0])),
    award('SPY', 50, (m, p) => attacksOf(m, p, AttackType.BUNNY).length >= 4),
    award('SECRETAGENT', 500, (m, p) => attacksOf(m, p, AttackType.BUNNY).length >= 8),
    award('GROUNDHOGDAY', 100, (m, p) => builtCount(m, p, EntityType.SPYING_EASTER_BUNNY) >= 4),
    award('REPEATOFFENDER', 800, (m, p) => builtCount(m, p, EntityType.SPYING_EASTER_BUNNY) >= 8),
    award('FIRSTCOMEFIRSTSERVED', 200, (m, p) => {
        const first = eventsOf(m, 'attack').find(event => event.data.result.hits.length > 0 || event.data.result.shielded);
        return typeof first !== 'undefined' && first.player === p;
    }),
    award('HINDSIGHT', 1000, (m, p) => {
        const attacks = attacksOf(m, p);
        return hitCreamedFactory(attacks[attacks.length - 1]) &&
            !ownCells(m, 1 - p).some(cell => cell.occupiedBy.some(entity => entity.type === EntityType.CREAM));
    }),
    award('MOLTEN', 300, (m, p) => attacksOf(m, p, AttackType.HOT_CHOCOLATE)
        .some(event => event.secret.targetBefore.some(type => type !== EntityType.CREAM))),
    award('OMG', 2000, (m, p) => ownCells(m, 1 - p).filter(cell => cell.molten).length >= 30),
    award('HORCRUXES', 1200, (m, p) => countOwn(m, p, EntityType.FACTORY_EXTENSION) > 4),
    award('PICKY', 5, (m, p) => eventsOf(m, 'fieldChosen', p).some(event => !event.data.automatic)),
    award('GREEDY', 10, (m, p) => {
        const placement = factoryPlacement(m, p);
        return typeof placement !== 'undefined' && placement.secret.cellType === BoardCellTypes.BLACK;
    }),
    award('STRATEGIST', 10, (m, p) => {
        const placement = factoryPlacement(m, p);
        return typeof placement !== 'undefined' && placement.secret.cellType !== BoardCellTypes.BLACK;
    }),
    award('RANDOM', 5, (m, p) => eventsOf(m, 'fieldChosen', 1 - p).some(event => !event.data.automatic)),
    award('MULTIPLAYERBONUS', 5, (m, p) => m.players[1 - p].type === PlayerType.HUMAN),
    award('GOLDENMULTIPLAYERBONUS', 200, (m, p) => m.players[1 - p].type === PlayerType.HUMAN && duration(m) >= m.balance.awards.goldenMultiplayerMs),
    award('DIAMONDMULTIPLAYERBONUS', 500, (m, p) => m.players[1 - p].type === PlayerType.HUMAN && duration(m) >= m.balance.awards.diamondMultiplayerMs),
    award('CONCRETEJUNGLE', 600, (m, p) => builtCount(m, p, EntityType.CACAOTREE) === 0),
    award('GREENSPOT', 20, (m, p) => builtCount(m, p, EntityType.CACAOTREE) >= 1),
    award('RANDOMFOREST', 50, (m, p) => builtCount(m, p, EntityType.CACAOTREE) >= 5),
    award('RAINFOREST', 1000, (m, p) => builtCount(m, p, EntityType.CACAOTREE) >= 15),
    award('SMALLOFFENSIVE', 30, (m, p) => builtCount(m, p, EntityType.RUM_TRUFFLE_CANNON) >= 2),
    award('OFFENSIVE', 70, (m, p) => builtCount(m, p, EntityType.RUM_TRUFFLE_CANNON) >= 5),
    award('MAJOROFFENSIVE', 1500, (m, p) => builtCount(m, p, EntityType.RUM_TRUFFLE_CANNON) >= 20),
    award('UNBREAKABLE', 200, (m, p) => !attacksOf(m, 1 - p).some(event => event.secret.oneShot)),
    award('MRGLASS', 600, (m, p) => attacksOf(m, 1 - p).filter(event => event.secret.oneShot).length >= 20),
    award('OUVERT', 800, (m, p) => {
        const placement = factoryPlacement(m, p);
        return typeof placement !== 'undefined' && !placement.secret.creamed;
    }),
    award('SETTLER', 50, (m, p) => typeof factoryPlacement(m, p) !== 'undefined' &&
        builtCount(m, p, EntityType.CACAOTREE) > 0 && builtCount(m, p, EntityType.RUM_TRUFFLE_CANNON) > 0),
    award('UPGRADE', 50, (m, p) => builtCount(m, p, EntityType.FRUIT_CANNON) > 0),
    award('REFILLED', 30, (m, p) => builtCount(m, p, EntityType.CREAM) > 0),
    award('PERSONALCONCERN', 100, (m, p) => ownCells(m, p).every(cell => cell.occupiedBy.some(entity => entity.type === EntityType.CREAM))),
];

/**
 * Awards of player `playerIndex` for an ended match: only winners get awards, the 5 most
 * valuable fulfilled ones, sorted ascending by coins (like the turn-based computeAwards).
 */
const computeMatchAwards = (match, playerIndex) => {
    if (match.phase !== MatchPhase.ENDED || !match.outcome || !match.outcome.winners.includes(playerIndex)) {
        return [];
    }
    return awards
        .filter(candidate => candidate.isFulfilled(match, playerIndex))
        .sort((a, b) => b.coins - a.coins)
        .slice(0, 5)
        .sort((a, b) => a.coins - b.coins);
};

module.exports = { matchAwards: awards, computeMatchAwards };
