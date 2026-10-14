"use strict";

// Player populations to test the economy against. `population(t)` is the
// number of active players in season t; `churn` the share that leaves each
// season (they are replaced by new players to reach the target).

function logistic(start, peak, midpoint, steepness) {
    return (t) => start + (peak - start) / (1 + Math.exp(-steepness * (t - midpoint)));
}

const baselineMix = { spender: 0.3, casual: 0.5, hoarder: 0.2 };

const scenarios = {
    baseline: {
        title: "Baseline",
        description:
            "Grows from 300 to 10,000 active players in about three years; 20 % hoarders; 5 % of players leave each month.",
        population: logistic(300, 10_000, 18, 0.2),
        churn: 0.05,
        dormantSellRate: 0.02,
        lostShare: 0.2,
        mix: baselineMix,
    },
    hoarding: {
        title: "Hoarding",
        description:
            "Same players as the baseline, but 80 % of them hold every coin, and players who leave never sell.",
        population: logistic(300, 10_000, 18, 0.2),
        churn: 0.05,
        dormantSellRate: 0,
        lostShare: 0.2,
        mix: { spender: 0.05, casual: 0.15, hoarder: 0.8 },
    },
    boom: {
        title: "Boom",
        description: "Grows to 50,000 active players within two years.",
        population: logistic(500, 50_000, 12, 0.3),
        churn: 0.05,
        dormantSellRate: 0.02,
        lostShare: 0.2,
        mix: baselineMix,
    },
    bust: {
        title: "Bust",
        description: "Grows to 5,000 players, then shrinks to a core of 200 from year three on.",
        population: (t) => {
            const growth = logistic(300, 5_000, 12, 0.3)(t);
            if (t < 30) return growth;
            return Math.max(200, growth * Math.exp(-(t - 30) / 8));
        },
        churn: 0.05,
        dormantSellRate: 0.02,
        lostShare: 0.2,
        mix: baselineMix,
    },
};

// Policy variants, each a set of overrides of DEFAULT_POLICY in model.js.
const PANTRY = { seasons: 24, share: { spender: 0.3, casual: 0.6, hoarder: 0 } };

const policies = {
    drafted: {
        title: "Draft v0.2",
        description: "Halving every 2 years, a fixed fee of 20 CHOC once 50 % is issued, the whole pot paid out.",
        overrides: {},
    },
    dynamicFee: {
        title: "Dynamic fee",
        description:
            "The fee is the highest multiple of 20 (0 to 100 CHOC) that 85 % of interested players could pay last season.",
        overrides: { feeMode: "dynamic" },
    },
    freeEntry: {
        title: "Free entry",
        description: "Tournaments never charge a registration fee.",
        overrides: { feeMode: "free" },
    },
    reserve: {
        title: "Pot reserve",
        description: "Each season pays out only 75 % of the pot.",
        overrides: { retention: 0.25 },
    },
    slowIssuance: {
        title: "Smooth 4-year halving",
        description:
            "Issuance shrinks every season and halves every 4 years instead of halving in steps every 2 years.",
        overrides: { schedule: { kind: "decay", seasons: 48 } },
    },
    pantry: {
        title: "Pantry",
        description:
            "Prizes stay in a player-owned contract until withdrawn; what departed players left there returns to the pot after 2 years.",
        overrides: { pantry: PANTRY },
    },
    qualifiers: {
        title: "Free qualifiers",
        description:
            "Like the recommendation, but the best 10 % of the open ladder enter the paid season tournament for free.",
        overrides: { schedule: { kind: "decay", seasons: 48 }, pantry: PANTRY, qualifierShare: 0.1 },
    },
    recommended: {
        title: "Recommended",
        description:
            "Smooth 4-year halving, the pantry, and a fixed fee of 20 CHOC once 50 % of the supply is issued (whitepaper v1.0).",
        overrides: { schedule: { kind: "decay", seasons: 48 }, pantry: PANTRY },
    },
};

const issuanceVariants = {
    halving24: { title: "Halving every 2 years", schedule: { kind: "halving", seasons: 24 } },
    halving48: { title: "Halving every 4 years", schedule: { kind: "halving", seasons: 48 } },
    decay48: { title: "Smooth halving, 4-year half-life", schedule: { kind: "decay", seasons: 48 } },
    constant120: { title: "Constant for 10 years", schedule: { kind: "constant", seasons: 120 } },
    linear120: { title: "Linear decline over 10 years", schedule: { kind: "linear", seasons: 120 } },
};

module.exports = { scenarios, policies, issuanceVariants, logistic };
