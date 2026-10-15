// Achievements of the real-time engine, computed by the host from the match and its event log.
// Each one gives XP (its former coin value) and, in verified online matches, rolls a drop table
// (progression.js). `who`: W = winners only (a draw makes both players winners), B = both.

const { BoardCellTypes, EntityType, AttackType, PlayerType } = require('../constants');
const { MatchPhase, OutcomeReason, DonutEffect, entitiesOf } = require('./index');

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

const W = 'W';
const B = 'B';

const award = (key, xp, who, isFulfilled) => ({
    key,
    title: tr(`AWARDS_${key}_TITLE`),
    subtitle: tr(`AWARDS_${key}_SUBTITLE`),
    xp,
    who,
    // the former name of the value; removed once every consumer reads xp
    coins: xp,
    isFulfilled,
});

const stats = (m, p) => m.players[p].statistics;
const opponentAttacks = (m, p) => attacksOf(m, 1 - p);
const trapsTriggered = (m, p) => opponentAttacks(m, p).flatMap(event => event.data.result.traps);
const ownFactory = (m, p) => entitiesOf(m, p).find(entity => entity.type === EntityType.FACTORY);
const surrendered = (m, p) => m.outcome.reason === OutcomeReason.SURRENDER && !m.outcome.winners.includes(p);

const awards = [
    award('WINNER', 25, W, () => true),
    award('NERD', 50, B, (m, p) => {
        const trees = ownCells(m, p).filter(cell => cell.occupiedBy.some(entity => entity.type === EntityType.CACAOTREE));
        return trees.length > 0 && trees.every(cell => cell.type === BoardCellTypes.WHITE);
    }),
    award('UNUSED', 50, B, (m, p) => countOwn(m, p, EntityType.SPYING_EASTER_BUNNY) > 0 && m.players[p].statistics.espionages === 0),
    award('RUSHHOUR', 100, W, m => duration(m) <= m.balance.awards.rushHourMs),
    award('MINIMALIST', 150, W, (m, p) => builtCount(m, p, EntityType.RUM_TRUFFLE_CANNON) === 1),
    award('ONEHITWONDER', 1800, B, (m, p) => hitCreamedFactory(attacksOf(m, p)[0])),
    award('SPY', 50, B, (m, p) => attacksOf(m, p, AttackType.BUNNY).length >= 4),
    award('SECRETAGENT', 500, B, (m, p) => attacksOf(m, p, AttackType.BUNNY).length >= 8),
    award('GROUNDHOGDAY', 100, B, (m, p) => builtCount(m, p, EntityType.SPYING_EASTER_BUNNY) >= 4),
    award('REPEATOFFENDER', 800, B, (m, p) => builtCount(m, p, EntityType.SPYING_EASTER_BUNNY) >= 8),
    award('FIRSTCOMEFIRSTSERVED', 200, B, (m, p) => {
        const first = eventsOf(m, 'attack').find(event => event.data.result.hits.length > 0 || event.data.result.shielded);
        return typeof first !== 'undefined' && first.player === p;
    }),
    award('HINDSIGHT', 1000, W, (m, p) => {
        const attacks = attacksOf(m, p);
        return hitCreamedFactory(attacks[attacks.length - 1]) &&
            !ownCells(m, 1 - p).some(cell => cell.occupiedBy.some(entity => entity.type === EntityType.CREAM));
    }),
    award('MOLTEN', 300, B, (m, p) => attacksOf(m, p, AttackType.HOT_CHOCOLATE)
        .some(event => event.secret.targetBefore.some(type => type !== EntityType.CREAM))),
    award('OMG', 2000, W, (m, p) => ownCells(m, 1 - p).filter(cell => cell.molten).length >= 30),
    award('HORCRUXES', 1200, B, (m, p) => countOwn(m, p, EntityType.FACTORY_EXTENSION) > 4),
    award('PICKY', 5, B, (m, p) => eventsOf(m, 'fieldChosen', p).some(event => !event.data.automatic)),
    award('GREEDY', 10, B, (m, p) => {
        const placement = factoryPlacement(m, p);
        return typeof placement !== 'undefined' && placement.secret.cellType === BoardCellTypes.BLACK;
    }),
    award('STRATEGIST', 10, B, (m, p) => {
        const placement = factoryPlacement(m, p);
        return typeof placement !== 'undefined' && placement.secret.cellType !== BoardCellTypes.BLACK;
    }),
    award('RANDOM', 5, B, (m, p) => eventsOf(m, 'fieldChosen', 1 - p).some(event => !event.data.automatic)),
    award('MULTIPLAYERBONUS', 5, B, (m, p) => m.players[1 - p].type === PlayerType.HUMAN),
    award('GOLDENMULTIPLAYERBONUS', 200, B, (m, p) => m.players[1 - p].type === PlayerType.HUMAN && duration(m) >= m.balance.awards.goldenMultiplayerMs),
    award('DIAMONDMULTIPLAYERBONUS', 500, B, (m, p) => m.players[1 - p].type === PlayerType.HUMAN && duration(m) >= m.balance.awards.diamondMultiplayerMs),
    award('CONCRETEJUNGLE', 600, W, (m, p) => builtCount(m, p, EntityType.CACAOTREE) === 0),
    award('GREENSPOT', 20, B, (m, p) => builtCount(m, p, EntityType.CACAOTREE) >= 1),
    award('RANDOMFOREST', 50, B, (m, p) => builtCount(m, p, EntityType.CACAOTREE) >= 5),
    award('RAINFOREST', 1000, B, (m, p) => builtCount(m, p, EntityType.CACAOTREE) >= 15),
    award('SMALLOFFENSIVE', 30, B, (m, p) => builtCount(m, p, EntityType.RUM_TRUFFLE_CANNON) >= 2),
    award('OFFENSIVE', 70, B, (m, p) => builtCount(m, p, EntityType.RUM_TRUFFLE_CANNON) >= 5),
    award('MAJOROFFENSIVE', 1500, B, (m, p) => builtCount(m, p, EntityType.RUM_TRUFFLE_CANNON) >= 20),
    award('UNBREAKABLE', 200, B, (m, p) => !attacksOf(m, 1 - p).some(event => event.secret.oneShot)),
    award('MRGLASS', 600, B, (m, p) => attacksOf(m, 1 - p).filter(event => event.secret.oneShot).length >= 20),
    award('OUVERT', 800, W, (m, p) => {
        const placement = factoryPlacement(m, p);
        return typeof placement !== 'undefined' && !placement.secret.creamed;
    }),
    award('SETTLER', 50, B, (m, p) => typeof factoryPlacement(m, p) !== 'undefined' &&
        builtCount(m, p, EntityType.CACAOTREE) > 0 && builtCount(m, p, EntityType.RUM_TRUFFLE_CANNON) > 0),
    award('UPGRADE', 50, B, (m, p) => builtCount(m, p, EntityType.FRUIT_CANNON) > 0),
    award('REFILLED', 30, B, (m, p) => builtCount(m, p, EntityType.CREAM) > 0),
    award('PERSONALCONCERN', 100, B, (m, p) => ownCells(m, p).every(cell => cell.occupiedBy.some(entity => entity.type === EntityType.CREAM))),
    // new with the ingredients (2026-10)
    award('GOODSPORT', 30, B, (m, p) => !surrendered(m, p)),
    award('SURVIVOR', 150, B, m => m.outcome.reason === OutcomeReason.TIME_LIMIT),
    award('SWEETTOOTH', 100, B, (m, p) => stats(m, p).producedCacao >= 1000),
    award('CHOCOHOLIC', 400, B, (m, p) => stats(m, p).producedCacao >= 3000),
    award('PATIENCE', 150, W, (m, p) => stats(m, p).shotsFired >= 5 && stats(m, p).rushes === 0),
    award('CANTWAIT', 50, B, (m, p) => stats(m, p).rushes >= 10),
    award('SHARPSHOOTER', 300, B, (m, p) => stats(m, p).shotsFired >= 10 && stats(m, p).shotsHit / stats(m, p).shotsFired >= 0.9),
    award('SHIELDWALL', 200, B, (m, p) => opponentAttacks(m, p).filter(event => event.data.result.shielded).length >= 5),
    award('FORTRESS', 600, B, (m, p) => opponentAttacks(m, p).filter(event => event.data.result.shielded).length >= 15),
    award('TRAPPER', 250, B, (m, p) => trapsTriggered(m, p).length >= 3),
    award('SUGARRUSH', 150, B, (m, p) => trapsTriggered(m, p).includes(DonutEffect.PINK)),
    award('PORTALHOPPER', 200, B, (m, p) => trapsTriggered(m, p).includes(DonutEffect.PORTAL)),
    award('BUNNYCATCHER', 400, B, (m, p) => attacksOf(m, 1 - p, AttackType.BUNNY).some(event => event.data.result.caught)),
    award('CLOSECALL', 300, W, (m, p) => {
        const factory = ownFactory(m, p);
        return typeof factory !== 'undefined' && factory.hp <= 0.1 * factory.maxHp;
    }),
    award('UNTOUCHED', 250, W, (m, p) => !opponentAttacks(m, p).some(event =>
        event.data.result.hits.some(hit => hit.entityType === EntityType.FACTORY && hit.hpAfter < hit.hpBefore))),
];

const isMatchWinner = (match, playerIndex) => Boolean(match.outcome) && match.outcome.winners.includes(playerIndex);

/**
 * The achievements of player `playerIndex` in an ended match that ran: the five most valuable ones
 * the player earned (winner-only ones need a win or a draw), sorted ascending by xp.
 */
const computeMatchAwards = (match, playerIndex) => {
    // a match that ended before it ran (a surrender during field choice) earns nothing
    if (match.phase !== MatchPhase.ENDED || !match.outcome || match.startedAt === null || typeof match.startedAt === 'undefined') {
        return [];
    }
    const winner = isMatchWinner(match, playerIndex);
    return awards
        .filter(candidate => (candidate.who === B || winner) && candidate.isFulfilled(match, playerIndex))
        .sort((a, b) => b.xp - a.xp)
        .slice(0, 5)
        .sort((a, b) => a.xp - b.xp);
};

module.exports = { matchAwards: awards, computeMatchAwards, isMatchWinner };
