const { engine, EntityType, AttackType } = require('../../index');
const { runningMatch } = require('./helper');

const keys = (match, player) => engine.computeMatchAwards(match, player).map(award => award.key);
const fulfilled = (match, player) => engine.matchAwards.filter(award => award.isFulfilled(match, player)).map(award => award.key);
const end = (match, winners, reason = engine.OutcomeReason.TIME_LIMIT) => {
    match.phase = engine.MatchPhase.ENDED;
    match.outcome = { winners, reason, t: match.t };
};
// an attack of `player` as the engine logs it
const attackBy = (match, player, result, attackType = AttackType.TRUFFLE) => match.events.push({
    seq: match.eventSeq++,
    t: match.t,
    type: 'attack',
    player,
    visibleTo: [0, 1],
    data: {
        attackType, row: 1, col: 1, rushCost: 0,
        result: { shielded: false, traps: [], hits: [], destroyed: [], revealed: [], caught: false, ...result },
    },
    secret: { targetBefore: [], oneShot: false },
});

describe('achievements', () => {
    test('every achievement has an xp value and a who flag', () => {
        engine.matchAwards.forEach(award => {
            expect(Number.isInteger(award.xp)).toBe(true);
            expect(['W', 'B']).toContain(award.who);
        });
        expect(engine.matchAwards.map(award => award.key)).toEqual(expect.arrayContaining([
            'GOODSPORT', 'SURVIVOR', 'SWEETTOOTH', 'CHOCOHOLIC', 'PATIENCE', 'CANTWAIT', 'SHARPSHOOTER',
            'SHIELDWALL', 'FORTRESS', 'TRAPPER', 'SUGARRUSH', 'PORTALHOPPER', 'BUNNYCATCHER', 'CLOSECALL', 'UNTOUCHED',
        ]));
    });

    // on the bare test board both players placed their factory without cream (OUVERT, winners
    // only, 800 xp) and the match ends at the time limit (SURVIVOR, both, 150 xp)
    test('losers earn the achievements open to both players, never the winner ones', () => {
        const match = runningMatch();
        end(match, [0]);
        expect(keys(match, 0)).toEqual(expect.arrayContaining(['OUVERT', 'SURVIVOR']));
        expect(keys(match, 1)).toContain('SURVIVOR');
        expect(keys(match, 1)).not.toContain('OUVERT');
        engine.computeMatchAwards(match, 1).forEach(award => expect(award.who).toBe('B'));
    });

    test('a draw makes both players winners', () => {
        const match = runningMatch();
        end(match, [0, 1]);
        expect(keys(match, 0)).toContain('OUVERT');
        expect(keys(match, 1)).toContain('OUVERT');
        expect(engine.isMatchWinner(match, 1)).toBe(true);
        expect(engine.isMatchWinner(match, 0)).toBe(true);
    });

    test('a player who surrendered is no good sport', () => {
        const match = runningMatch();
        end(match, [0], engine.OutcomeReason.SURRENDER);
        expect(fulfilled(match, 1)).not.toContain('GOODSPORT');
        expect(fulfilled(match, 0)).toContain('GOODSPORT');
    });

    test('at most five achievements count, sorted ascending by xp', () => {
        const match = runningMatch();
        Object.assign(match.players[0].statistics, { producedCacao: 3200, shotsFired: 12, shotsHit: 11, rushes: 0 });
        end(match, [0]);
        const counted = engine.computeMatchAwards(match, 0);
        expect(counted.length).toBeLessThanOrEqual(5);
        expect(counted.map(award => award.xp)).toEqual([...counted.map(award => award.xp)].sort((a, b) => a - b));
    });

    test('statistics achievements', () => {
        const match = runningMatch();
        Object.assign(match.players[0].statistics, { producedCacao: 3200, shotsFired: 12, shotsHit: 11, rushes: 0 });
        Object.assign(match.players[1].statistics, { producedCacao: 1100, shotsFired: 12, shotsHit: 2, rushes: 10 });
        end(match, [0]);
        expect(fulfilled(match, 0)).toEqual(expect.arrayContaining(['CHOCOHOLIC', 'SWEETTOOTH', 'SHARPSHOOTER', 'PATIENCE']));
        expect(fulfilled(match, 1)).toEqual(expect.arrayContaining(['SWEETTOOTH', 'CANTWAIT']));
        expect(fulfilled(match, 1)).not.toContain('SHARPSHOOTER');
        expect(fulfilled(match, 1)).not.toContain('CHOCOHOLIC');
    });

    test('defence achievements read the opponent attacks', () => {
        const match = runningMatch();
        for (let i = 0; i < 15; i++) {
            attackBy(match, 1, { shielded: true });
        }
        attackBy(match, 1, { traps: [engine.DonutEffect.PINK, engine.DonutEffect.PORTAL, engine.DonutEffect.GREEN] });
        attackBy(match, 1, { caught: true }, AttackType.BUNNY);
        end(match, [0]);
        expect(fulfilled(match, 0)).toEqual(expect.arrayContaining([
            'SHIELDWALL', 'FORTRESS', 'TRAPPER', 'SUGARRUSH', 'PORTALHOPPER', 'BUNNYCATCHER', 'UNTOUCHED',
        ]));
        expect(fulfilled(match, 1)).not.toContain('SHIELDWALL');
    });

    test('close call and untouched look at the own factory', () => {
        const match = runningMatch();
        const factory = engine.entitiesOf(match, 0).find(entity => entity.type === EntityType.FACTORY);
        factory.hp = Math.floor(factory.maxHp * 0.1);
        attackBy(match, 1, { hits: [{ entityType: EntityType.FACTORY, hpBefore: factory.maxHp, hpAfter: factory.hp }] });
        end(match, [0]);
        expect(fulfilled(match, 0)).toContain('CLOSECALL');
        expect(fulfilled(match, 0)).not.toContain('UNTOUCHED');
    });
});
