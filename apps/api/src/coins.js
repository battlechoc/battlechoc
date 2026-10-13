// Coins of a finished match, computed on the server: the client reports which awards it won
// (by key), the server takes the coin values from the shared award list. Losses and open
// matches give nothing, draws half, a win without any own building (the opponent gave up
// right away) the surrender costs.

const { engine, SurrenderCosts } = require('@battlechoc/battlechoc-shared-functions');

const awardCoins = new Map(engine.matchAwards.map(award => [award.key, award.coins]));
const MAX_AWARDS = 5;

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

const coinsOf = (record, result = resultOf(record)) => {
    if (result === 'lost' || result === 'open') {
        return 0;
    }
    if (result === 'won' && record.builtEntities === 0) {
        return SurrenderCosts;
    }
    const keys = [...new Set((Array.isArray(record.awards) ? record.awards : [])
        .map(award => (typeof award === 'string' ? award : award && award.key))
        .filter(key => awardCoins.has(key)))];
    const coins = keys.map(key => awardCoins.get(key)).sort((a, b) => b - a).slice(0, MAX_AWARDS).reduce((sum, value) => sum + value, 0);
    return result === 'draw' ? Math.floor(coins / 2) : coins;
};

module.exports = { resultOf, coinsOf };
