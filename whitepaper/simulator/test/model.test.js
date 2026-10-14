"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { MAX_SUPPLY, createSchedule, createSimulation, simulate, payoutAmounts } = require("../model");
const { scenarios, policies, issuanceVariants } = require("../scenarios");

test("every issuance schedule mints exactly the maximum supply", () => {
    for (const { schedule } of Object.values(issuanceVariants)) {
        const mint = createSchedule(schedule);
        let total = 0;
        for (let t = 0; t < 2000; t++) {
            const amount = mint(t);
            assert.ok(Number.isInteger(amount) && amount >= 0);
            total += amount;
        }
        assert.equal(total, MAX_SUPPLY, schedule.kind);
    }
});

test("no coin is created or lost, and all amounts are whole coins", () => {
    for (const scenario of Object.values(scenarios)) {
        for (const policy of Object.values(policies)) {
            const sim = createSimulation(scenario, policy.overrides, 7);
            for (let t = 0; t < 120; t++) {
                const m = sim.step();
                assert.equal(sim.totalCoins(), MAX_SUPPLY, `${scenario.title}, ${policy.title}, season ${t}`);
                for (const [where, amount] of Object.entries(m.coins)) {
                    assert.ok(Number.isInteger(amount) && amount >= 0, `${where} = ${amount}`);
                }
                for (const p of sim.state.players) assert.ok(Number.isInteger(p.balance) && p.balance >= 0);
                assert.equal(m.fee % 20, 0);
            }
        }
    }
});

test("the same seed gives the same history", () => {
    const a = simulate(scenarios.baseline, {}, { seasons: 60, seed: 3 });
    const b = simulate(scenarios.baseline, {}, { seasons: 60, seed: 3 });
    assert.deepEqual(a, b);
});

test("the registration fee starts once the threshold is issued", () => {
    const history = simulate(scenarios.baseline, { feeThreshold: 0.5 }, { seasons: 60 });
    for (const m of history) {
        if (m.issuedShare < 0.5) assert.equal(m.fee, 0);
        else assert.equal(m.fee, 20);
    }
});

test("fees must be round amounts", () => {
    assert.throws(() => createSimulation(scenarios.baseline, { fee: 30 }), /multiples of 20/);
    assert.throws(() => createSimulation(scenarios.baseline, { craftFee: 25 }), /multiples of 10/);
});

test("the pot changes exactly by its recorded inflows and payouts", () => {
    const sim = createSimulation(scenarios.baseline, policies.recommended.overrides, 5);
    let pot = 0;
    for (let t = 0; t < 120; t++) {
        const { flows: f, coins } = sim.step();
        pot += f.minted + f.unclaimed + f.pantryReturned + f.registrationToPot + f.craftingToPot - f.payout;
        assert.equal(coins.pot, pot, `season ${t}`);
    }
});

test("payouts never exceed the pot and favour higher ranks", () => {
    const policy = { participationShare: 0.15, rankExponent: 1 };
    for (const [pot, n] of [
        [100_000, 2_000],
        [37, 50],
        [1_000, 1],
        [5, 10_000],
    ]) {
        const amounts = payoutAmounts(pot, n, policy);
        assert.equal(amounts.length, n);
        assert.ok(amounts.reduce((a, b) => a + b, 0) <= pot);
        for (let i = 1; i < n; i++) assert.ok(amounts[i] <= amounts[i - 1]);
        for (const a of amounts) assert.ok(Number.isInteger(a) && a >= 0);
    }
});
