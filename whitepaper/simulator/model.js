"use strict";

// Agent-based model of the CHOC economy. One step is one monthly season.
// CHOC has no decimals, so every amount is an integer and every split
// rounds down; what is left over stays in the pot.

const MAX_SUPPLY = 10_000_000;

function createRng(seed) {
    let a = seed >>> 0;
    const next = () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const normal = () => {
        const u = 1 - next();
        const v = next();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    return { next, normal };
}

// Issuance schedules: season index -> coins minted into that season's pot.
// Each schedule sums to exactly `supply`.
const issuance = {
    // Halving every `seasons` seasons. The rounding remainder is minted in
    // the first season, so the whole supply is issued.
    halving(supply, seasons) {
        const first = Math.floor(supply / (2 * seasons));
        const planned = (t) => Math.floor(first / 2 ** Math.floor(t / seasons));
        let total = 0;
        for (let t = 0; planned(t) > 0; t++) total += planned(t);
        const remainder = supply - total;
        return (t) => planned(t) + (t === 0 ? remainder : 0);
    },
    // Smooth halving: every season mints `ratio` (parts per million) of the
    // previous season, rounded to the nearest coin, which halves the amount
    // every `seasons` seasons. A minting policy can check this with integer
    // arithmetic. The amount levels off at a few dozen coins, and minting
    // stops once the whole supply is issued.
    decay(supply, seasons) {
        const ratio = Math.round(1e6 * 2 ** (-1 / seasons));
        const amounts = [];
        let amount = Math.round((supply * (1e6 - ratio)) / 1e6);
        let total = 0;
        while (total < supply) {
            const minted = Math.min(amount, supply - total);
            amounts.push(minted);
            total += minted;
            amount = Math.round((amount * ratio) / 1e6);
        }
        return (t) => amounts[t] || 0;
    },
    constant(supply, seasons) {
        const each = Math.floor(supply / seasons);
        return (t) => {
            if (t < seasons - 1) return each;
            if (t === seasons - 1) return supply - each * (seasons - 1);
            return 0;
        };
    },
    // Linear decline to zero over `seasons` seasons.
    linear(supply, seasons) {
        const step = (2 * supply) / (seasons * (seasons + 1));
        let total = 0;
        for (let t = 0; t < seasons - 1; t++) total += Math.floor(step * (seasons - t));
        return (t) => {
            if (t < seasons - 1) return Math.floor(step * (seasons - t));
            if (t === seasons - 1) return supply - total;
            return 0;
        };
    },
};

function createSchedule({ kind, seasons }, supply = MAX_SUPPLY) {
    if (!issuance[kind]) throw new Error(`unknown issuance schedule ${kind}`);
    return issuance[kind](supply, seasons);
}

// How players of each kind behave. `fun` is how many coins a player would
// pay for a tournament entry even without expecting a prize.
const PROFILES = {
    spender: { enter: 0.8, craft: 0.4, buys: 0.6, sellSurplus: 0.1, sellOnExit: 0.5, fun: 40 },
    casual: { enter: 0.4, craft: 0.1, buys: 0.2, sellSurplus: 0.3, sellOnExit: 0.3, fun: 10 },
    // Collects coins and never spends, buys or sells them.
    hoarder: { enter: 0.6, craft: 0, buys: 0, sellSurplus: 0, sellOnExit: 0, fun: 0, spends: false },
};

const DEFAULT_POLICY = {
    schedule: { kind: "halving", seasons: 24 },
    // "fixed": `fee` once `feeThreshold` of the supply is issued.
    // "dynamic": the highest multiple of 20 (up to `feeMax`) that at least
    // `affordShare` of last season's interested players could pay, rising
    // by at most 20 per season. Wallet balances are public, so the server
    // can compute it.
    // "free": never a registration fee.
    feeMode: "fixed",
    feeThreshold: 0.5,
    fee: 20,
    feeMax: 100,
    affordShare: 0.85,
    craftFee: 50,
    // Share of the pot kept back each season (a reserve that smooths payouts).
    retention: 0,
    participationShare: 0.15,
    rankExponent: 1,
    eligibleRate: 0.85,
    claimRate: 0.7,
    claimSeasons: 3,
    registrationToPot: 0.95,
    craftingToPot: 0.9,
    // Share of active players, by skill, who qualify on the free open ladder
    // and enter the season tournament without paying the fee.
    qualifierShare: 0,
    // Optional "pantry": prize coins stay in a player-owned contract until
    // withdrawn. Coins a departed player never withdrew return to the pot
    // after `seasons`. `share` is the part of departing players, per kind,
    // who left their coins there.
    pantry: null,
};

// Prize per rank (index 0 = rank 1) for a pot of `payout` coins and `n`
// eligible players: an even participation share plus a rank share that
// falls with 1/rank^s. Every amount is rounded down to whole coins.
function payoutAmounts(payout, n, { participationShare, rankExponent }) {
    if (n === 0 || payout <= 0) return [];
    const participationPool = Math.floor(payout * participationShare);
    const perParticipant = Math.floor(participationPool / n);
    const rankPool = payout - participationPool;
    let weightSum = 0;
    for (let r = 1; r <= n; r++) weightSum += r ** -rankExponent;
    const amounts = new Array(n);
    for (let i = 0; i < n; i++) {
        amounts[i] = perParticipant + Math.floor((rankPool * (i + 1) ** -rankExponent) / weightSum);
    }
    return amounts;
}

function pickKind(mix, r) {
    let acc = 0;
    for (const [kind, share] of Object.entries(mix)) {
        acc += share;
        if (r < acc) return kind;
    }
    return Object.keys(mix)[0];
}

function createSimulation(scenario, policyOverrides = {}, seed = 1) {
    const policy = { ...DEFAULT_POLICY, ...policyOverrides };
    if (policy.fee % 20 !== 0) throw new Error("registration fees must be multiples of 20");
    if (policy.craftFee % 10 !== 0) throw new Error("crafting fees must be multiples of 10");

    const rng = createRng(seed);
    const schedule = createSchedule(policy.schedule);
    const profiles = { ...PROFILES, ...scenario.profiles };

    const state = {
        t: 0,
        unminted: MAX_SUPPLY,
        pot: 0,
        team: 0,
        dormant: 0,
        pending: [],
        players: [],
        nextId: 0,
        feeActive: false,
        lastExpectedPayout: 0,
        lastInterestedBalances: [],
        dynamicFee: policy.fee,
        pantry: [],
        // Coins of players who left: `dormant` holders still have their keys
        // and may sell, `lost` coins are gone for good.
        lost: 0,
    };

    function addPlayer() {
        const kind = pickKind(scenario.mix, rng.next());
        state.players.push({
            id: state.nextId++,
            kind,
            profile: profiles[kind],
            skill: rng.normal(),
            balance: 0,
            active: true,
        });
    }

    function pendingTotal() {
        let sum = 0;
        for (const entry of state.pending) sum += entry.amount;
        return sum;
    }

    function pantryTotal() {
        let sum = 0;
        for (const entry of state.pantry) sum += entry.amount;
        return sum;
    }

    function activeBalance() {
        let sum = 0;
        for (const p of state.players) sum += p.balance;
        return sum;
    }

    function totalCoins() {
        return (
            state.unminted +
            state.pot +
            state.team +
            state.dormant +
            state.lost +
            pantryTotal() +
            pendingTotal() +
            activeBalance()
        );
    }

    function registrationFee(issuedShare) {
        if (policy.feeMode === "free") return 0;
        if (!state.feeActive && issuedShare >= policy.feeThreshold) state.feeActive = true;
        if (!state.feeActive) return 0;
        if (policy.feeMode === "fixed") return policy.fee;
        if (state.dynamicFeeStarted) {
            const balances = state.lastInterestedBalances;
            let affordable = 0;
            for (let fee = 20; fee <= policy.feeMax; fee += 20) {
                const canPay = balances.filter((b) => b >= fee).length;
                if (balances.length === 0 || canPay / balances.length < policy.affordShare) break;
                affordable = fee;
            }
            state.dynamicFee = Math.min(affordable, state.dynamicFee + 20);
        }
        state.dynamicFeeStarted = true;
        return state.dynamicFee;
    }

    function retire(p) {
        if (p.balance === 0) return;
        const pantry = policy.pantry;
        if (pantry && rng.next() < (pantry.share[p.kind] || 0)) {
            state.pantry.push({ amount: p.balance, returns: state.t + pantry.seasons });
        } else if (rng.next() < scenario.lostShare) state.lost += p.balance;
        else state.dormant += p.balance;
        state.flows.leftWithPlayers += p.balance;
        p.balance = 0;
    }

    function step() {
        const t = state.t;
        const m = { t };
        // Coins moved between places this season, for the flow diagrams.
        const flows = {
            minted: 0,
            payout: 0,
            claimed: 0,
            unclaimed: 0,
            pantryReturned: 0,
            registrationToPot: 0,
            registrationToTeam: 0,
            craftingToPot: 0,
            craftingToTeam: 0,
            teamSold: 0,
            dormantSold: 0,
            traded: 0,
            leftWithPlayers: 0,
        };
        state.flows = flows;

        // Churn: leaving players keep their coins, a part of them sells first.
        const exitSales = [];
        let churned = 0;
        const stay = [];
        for (const p of state.players) {
            if (rng.next() < scenario.churn) {
                p.active = false;
                churned++;
                if (p.balance > 0 && rng.next() < p.profile.sellOnExit) exitSales.push(p);
                else retire(p);
            } else stay.push(p);
        }
        state.players = stay;
        const target = Math.round(scenario.population(t));
        let joined = 0;
        while (state.players.length < target) {
            addPlayer();
            joined++;
        }
        m.active = state.players.length;
        m.joined = joined;
        m.churned = churned;

        // Claims of earlier payouts; unclaimed ones go back to the pot.
        const stillPending = [];
        let unclaimed = 0;
        for (const entry of state.pending) {
            if (entry.player.active && rng.next() < policy.claimRate) {
                entry.player.balance += entry.amount;
                flows.claimed += entry.amount;
            } else if (t >= entry.expires) {
                state.pot += entry.amount;
                unclaimed += entry.amount;
            } else stillPending.push(entry);
        }
        state.pending = stillPending;
        m.unclaimedReturned = unclaimed;
        let recycled = 0;
        state.pantry = state.pantry.filter((entry) => {
            if (entry.returns > t) return true;
            recycled += entry.amount;
            return false;
        });
        state.pot += recycled;
        m.pantryReturned = recycled;
        flows.unclaimed = unclaimed;
        flows.pantryReturned = recycled;

        // Minting into the pot.
        const minted = Math.min(schedule(t), state.unminted);
        state.unminted -= minted;
        state.pot += minted;
        m.minted = minted;
        flows.minted = minted;
        m.issuedShare = (MAX_SUPPLY - state.unminted) / MAX_SUPPLY;

        const fee = registrationFee(m.issuedShare);
        m.fee = fee;

        // Free qualification: the best players of the open ladder.
        let qualifyingSkill = Infinity;
        if (fee > 0 && policy.qualifierShare > 0 && state.players.length > 0) {
            const skills = Float64Array.from(state.players, (p) => p.skill).sort();
            qualifyingSkill = skills[Math.floor(skills.length * (1 - policy.qualifierShare))];
        }

        // Intentions for this season.
        for (const p of state.players) {
            const pr = p.profile;
            p.qualified = p.skill >= qualifyingSkill;
            let enter = pr.enter;
            if (fee > 0 && !p.qualified) {
                if (pr.spends === false) enter = 0;
                else enter *= Math.min(1, (state.lastExpectedPayout + pr.fun) / fee);
            }
            p.wantsRegister = rng.next() < enter;
            p.wantsCraft = pr.spends !== false && rng.next() < pr.craft;
            p.need = (p.wantsRegister && !p.qualified ? fee : 0) + (p.wantsCraft ? policy.craftFee : 0);
        }

        // Market: the team, leaving players and players with a surplus sell;
        // players who are short of coins for what they want to do buy.
        const sellers = [];
        if (state.team > 0) sellers.push({ source: "team", amount: state.team });
        for (const p of exitSales) sellers.push({ source: p, amount: p.balance });
        for (const p of state.players) {
            const surplus = p.balance - p.need;
            const amount = Math.floor(surplus * p.profile.sellSurplus);
            if (amount > 0) sellers.push({ source: p, amount });
        }
        // Former players who kept their keys sell a little when buyers are
        // waiting (a rising price brings old coins back).
        const fromDormant = Math.floor(state.dormant * scenario.dormantSellRate);
        if (fromDormant > 0) sellers.push({ source: "dormant", amount: fromDormant });
        let traded = 0;
        let unmet = 0;
        let seller = 0;
        for (const p of state.players) {
            const shortfall = p.need - p.balance;
            if (shortfall <= 0 || rng.next() >= p.profile.buys) continue;
            let missing = shortfall;
            while (missing > 0 && seller < sellers.length) {
                const s = sellers[seller];
                const amount = Math.min(missing, s.amount);
                s.amount -= amount;
                if (s.source === "team") {
                    state.team -= amount;
                    flows.teamSold += amount;
                } else if (s.source === "dormant") {
                    state.dormant -= amount;
                    flows.dormantSold += amount;
                } else s.source.balance -= amount;
                p.balance += amount;
                missing -= amount;
                traded += amount;
                if (s.amount === 0) seller++;
            }
            unmet += missing;
        }
        // Leaving players who found no buyer keep their coins, now dormant.
        for (const p of exitSales) retire(p);
        m.traded = traded;
        flows.traded = traded;
        m.unmetDemand = unmet;

        // Registration.
        const registered = [];
        let willing = 0;
        state.lastInterestedBalances = [];
        for (const p of state.players) {
            if (!p.wantsRegister) continue;
            willing++;
            state.lastInterestedBalances.push(p.balance);
            if (p.qualified) {
                registered.push(p);
                m.qualified = (m.qualified || 0) + 1;
                continue;
            }
            if (p.balance < fee) continue;
            if (fee > 0) {
                p.balance -= fee;
                const toPot = Math.round(fee * policy.registrationToPot);
                state.pot += toPot;
                state.team += fee - toPot;
                flows.registrationToPot += toPot;
                flows.registrationToTeam += fee - toPot;
            }
            registered.push(p);
        }
        m.willing = willing;
        m.registered = registered.length;
        m.affordability = willing ? registered.length / willing : 1;

        // Payout: an even participation share plus a rank share 1/rank^s.
        const eligible = registered.filter(() => rng.next() < policy.eligibleRate);
        const payout = Math.floor(state.pot * (1 - policy.retention));
        let paid = 0;
        let paidPlayers = 0;
        let perParticipant = 0;
        if (eligible.length > 0 && payout > 0) {
            const scored = eligible.map((p) => ({ p, score: p.skill + 0.5 * rng.normal() }));
            scored.sort((a, b) => b.score - a.score);
            const amounts = payoutAmounts(payout, scored.length, policy);
            perParticipant = Math.floor(Math.floor(payout * policy.participationShare) / scored.length);
            for (let i = 0; i < scored.length; i++) {
                const amount = amounts[i];
                if (amount <= 0) continue;
                paid += amount;
                paidPlayers++;
                state.pending.push({ player: scored[i].p, amount, expires: t + policy.claimSeasons });
            }
            state.pot -= paid;
        }
        m.eligible = eligible.length;
        m.payout = paid;
        flows.payout = paid;
        m.perParticipant = perParticipant;
        m.paidShare = eligible.length ? paidPlayers / eligible.length : 0;
        state.lastExpectedPayout = registered.length ? paid / registered.length : 0;

        // Crafting fees go to the next pot.
        let crafted = 0;
        for (const p of state.players) {
            if (!p.wantsCraft || p.balance < policy.craftFee) continue;
            p.balance -= policy.craftFee;
            const toPot = Math.round(policy.craftFee * policy.craftingToPot);
            state.pot += toPot;
            state.team += policy.craftFee - toPot;
            flows.craftingToPot += toPot;
            flows.craftingToTeam += policy.craftFee - toPot;
            crafted++;
        }
        m.crafted = crafted;

        const active = activeBalance();
        m.coinsPerActive = m.active ? active / m.active : 0;
        m.coins = {
            unminted: state.unminted,
            pot: state.pot,
            team: state.team,
            dormant: state.dormant,
            lost: state.lost,
            pantry: pantryTotal(),
            pending: pendingTotal(),
            active,
        };
        m.flows = flows;
        state.t++;
        return m;
    }

    return { step, state, policy, totalCoins };
}

function simulate(scenario, policy, { seasons, seed = 1 } = {}) {
    const sim = createSimulation(scenario, policy, seed);
    const history = [];
    for (let t = 0; t < seasons; t++) history.push(sim.step());
    return history;
}

module.exports = {
    MAX_SUPPLY,
    PROFILES,
    DEFAULT_POLICY,
    createRng,
    createSchedule,
    createSimulation,
    simulate,
    payoutAmounts,
};
