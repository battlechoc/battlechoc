// XP of a match record the client reports (offline matches): the client says which achievements
// it earned (by key), the server takes their xp from the shared list. Open matches give nothing,
// losers half, a win without any own building (the opponent gave up right away) the surrender XP.

const { engine, SurrenderCosts } = require('@battlechoc/battlechoc-shared-functions');

const achievementXp = new Map(engine.matchAwards.map(award => [award.key, award.xp]));
const MAX_ACHIEVEMENTS = 5;

const resultOf = record => {
    const winners = Array.isArray(record.winners) ? record.winners : [];
    if (record.won === true) {
        return 'won';
    } else if (record.lost === true) {
        return 'lost';
    } else if (winners.length === 2) {
        return 'draw';
    }
    return 'open';
};

const xpOf = (record, result = resultOf(record)) => {
    if (result === 'open') {
        return 0;
    }
    if (result === 'won' && record.builtEntities === 0) {
        return SurrenderCosts;
    }
    const keys = [...new Set((Array.isArray(record.awards) ? record.awards : [])
        .map(award => (typeof award === 'string' ? award : award && award.key))
        .filter(key => achievementXp.has(key)))];
    const xp = keys.map(key => achievementXp.get(key)).sort((a, b) => b - a).slice(0, MAX_ACHIEVEMENTS)
        .reduce((sum, value) => sum + value, 0);
    return result === 'lost' ? Math.floor(xp / 2) : xp;
};

module.exports = { resultOf, xpOf };
