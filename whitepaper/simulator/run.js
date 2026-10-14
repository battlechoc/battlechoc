"use strict";

// Runs every scenario against every policy over several seeds and writes
// the figures to ../figures and a results table to results.md.
//
//   node whitepaper/simulator/run.js [--seeds 8] [--years 25]

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Worker, isMainThread, parentPort, workerData } = require("node:worker_threads");
const { MAX_SUPPLY, DEFAULT_POLICY, createSchedule, simulate, payoutAmounts } = require("./model");
const { scenarios, policies, issuanceVariants } = require("./scenarios");
const { figure, formatNumber, SERIES_COLORS, COLORS } = require("./charts");
const { flowDiagram } = require("./flowdiagram");

function arg(name, fallback) {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? Number(process.argv[i + 1]) : fallback;
}

const SEEDS = arg("seeds", 8);
const YEARS = arg("years", 25);
const SEASONS = YEARS * 12;
const FIGURES = path.join(__dirname, "..", "figures");

// Policies drawn in the figures; all of them are in the results table.
const CHART_POLICIES = ["drafted", "freeEntry", "slowIssuance", "pantry", "recommended"];
const policyColor = (key) => SERIES_COLORS[CHART_POLICIES.indexOf(key)];

function quantile(sorted, q) {
    const i = (sorted.length - 1) * q;
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

// Median and 10–90 % band of a metric over all seeds, per season,
// optionally as a rolling mean over `smooth` seasons.
function aggregate(runs, metric, smooth = 1) {
    const median = [];
    const band = [];
    const value = (h, t) => {
        let sum = 0;
        let n = 0;
        for (let i = Math.max(0, t - smooth + 1); i <= t; i++) {
            sum += metric(h[i]);
            n++;
        }
        return sum / n;
    };
    for (let t = 0; t < SEASONS; t++) {
        const values = runs.map((h) => value(h, t)).sort((a, b) => a - b);
        const x = (t + 1) / 12;
        median.push([x, quantile(values, 0.5)]);
        band.push([x, quantile(values, 0.1), quantile(values, 0.9)]);
    }
    return { median, band };
}

function write(name, svg) {
    fs.writeFileSync(path.join(FIGURES, name), svg);
    console.log(`  figures/${name}`);
}

// Runs every case (scenario × policy × seed) on a pool of worker threads.
async function runAll() {
    const jobs = [];
    for (const sk of Object.keys(scenarios)) {
        for (const pk of Object.keys(policies)) {
            for (let seed = 1; seed <= SEEDS; seed++) jobs.push({ sk, pk, seed });
        }
    }
    const results = {};
    for (const sk of Object.keys(scenarios)) {
        results[sk] = {};
        for (const pk of Object.keys(policies)) results[sk][pk] = new Array(SEEDS);
    }
    let next = 0;
    let done = 0;
    const started = Date.now();
    const threads = Math.max(1, Math.min(os.cpus().length - 1, jobs.length));
    await Promise.all(
        Array.from({ length: threads }, () => {
            const worker = new Worker(__filename, { workerData: { seasons: SEASONS } });
            return new Promise((resolve, reject) => {
                const send = () => {
                    if (next >= jobs.length) {
                        worker.terminate().then(resolve);
                        return;
                    }
                    worker.postMessage(jobs[next++]);
                };
                worker.on("message", ({ sk, pk, seed, history }) => {
                    results[sk][pk][seed - 1] = history;
                    done++;
                    if (done % 20 === 0 || done === jobs.length)
                        process.stdout.write(`\r  ${done}/${jobs.length} runs`);
                    send();
                });
                worker.on("error", reject);
                send();
            });
        })
    );
    console.log(` in ${((Date.now() - started) / 1000).toFixed(1)} s on ${threads} threads`);
    return results;
}

function workerMain() {
    parentPort.on("message", ({ sk, pk, seed }) => {
        const history = simulate(scenarios[sk], policies[pk].overrides, { seasons: workerData.seasons, seed });
        parentPort.postMessage({ sk, pk, seed, history });
    });
}

function issuanceFigure() {
    const perSeason = [];
    const cumulative = [];
    Object.values(issuanceVariants).forEach((variant, i) => {
        const mint = createSchedule(variant.schedule);
        const points = [];
        const shares = [];
        let total = 0;
        for (let t = 0; t < SEASONS; t++) {
            const amount = t === 0 && variant.schedule.kind === "halving" ? mint(1) : mint(t);
            total += mint(t);
            points.push([(t + 1) / 12, amount]);
            shares.push([(t + 1) / 12, (100 * total) / MAX_SUPPLY]);
        }
        perSeason.push({ color: SERIES_COLORS[i], points });
        cumulative.push({ color: SERIES_COLORS[i], points: shares });
    });
    return figure({
        title: "Issuance schedules for 10,000,000 CHOC",
        subtitle: "Coins minted into each monthly tournament pot, and the share of the supply issued so far.",
        legendItems: Object.values(issuanceVariants).map((v, i) => ({ name: v.title, color: SERIES_COLORS[i] })),
        panels: [
            { title: "CHOC minted per season", series: perSeason, xMax: YEARS, xLabel: "years" },
            {
                title: "Share of the supply issued",
                series: cumulative,
                xMax: YEARS,
                xLabel: "years",
                yMax: 100,
                yFormat: (v) => `${v} %`,
                refLines: [{ value: 50, label: "registration fee starts at 50 %", color: COLORS.muted }],
            },
        ],
        note: "Years on the horizontal axis. The halving schedules mint their rounding remainder in the first season.",
    });
}

const LAYERS = [
    { key: "active", name: "Active players' wallets", color: "#d9822b" },
    { key: "pot", name: "Pot and unclaimed prizes", color: "#2f7f6f" },
    { key: "team", name: "Team", color: "#4b5fb3" },
    { key: "pantry", name: "Pantry, returning to the pot", color: "#8fbf6a" },
    { key: "dormant", name: "Players who left (keys kept)", color: "#a07a63" },
    { key: "lost", name: "Lost keys", color: "#5a3a2a" },
    { key: "unminted", name: "Not minted yet", color: "#e8ddd3" },
];

function coinLocationFigure(results) {
    const cases = [
        ["baseline", "drafted"],
        ["baseline", "recommended"],
        ["hoarding", "drafted"],
        ["hoarding", "recommended"],
    ];
    return figure({
        title: "Where the 10,000,000 CHOC are",
        subtitle:
            "One run (seed 1) per panel. Players who leave keep their coins, so most of the supply ends up in inactive wallets.",
        legendItems: LAYERS.map((l) => ({ name: l.name, color: l.color, area: true })),
        panels: cases.map(([sk, pk]) => {
            const history = results[sk][pk][0];
            return {
                title: `${scenarios[sk].title}, ${pk === "drafted" ? "draft v0.2" : policies[pk].title.toLowerCase()}`,
                xMax: YEARS,
                xLabel: "years",
                yMax: MAX_SUPPLY,
                layers: LAYERS.map((l) => ({
                    color: l.color,
                    points: history.map((m) => [
                        (m.t + 1) / 12,
                        l.key === "pot" ? m.coins.pot + m.coins.pending : m.coins[l.key],
                    ]),
                })),
            };
        }),
        panelHeight: 230,
    });
}

function scenarioFigure(results, { title, subtitle, metric, yFormat, yLog, refLines, note, smooth = 3 }) {
    return figure({
        title,
        subtitle,
        legendItems: CHART_POLICIES.map((pk) => ({ name: policies[pk].title, color: policyColor(pk) })),
        panels: Object.entries(scenarios).map(([sk, scenario]) => ({
            title: scenario.title,
            xMax: YEARS,
            yFormat,
            yLog,
            refLines,
            xLabel: "years",
            series: CHART_POLICIES.map((pk) => {
                const { median, band } = aggregate(results[sk][pk], metric, smooth);
                return { color: policyColor(pk), points: median, band };
            }),
        })),
        note:
            note ||
            `Median of ${SEEDS} runs per line (3-month rolling mean), shaded: 10–90 % of runs. Policies are described in simulator/results.md.`,
    });
}

// Flows per season, averaged over one year and taken as the median over
// all seeds, for the animated token-flow diagram.
function yearlyFlows(runs, year) {
    const from = (year - 1) * 12;
    const keys = Object.keys(runs[0][0].flows);
    const perRun = runs.map((h) => {
        const sum = Object.fromEntries(keys.map((k) => [k, 0]));
        for (let t = from; t < from + 12; t++) for (const k of keys) sum[k] += h[t].flows[k] / 12;
        const end = h[from + 11].coins;
        return { flows: sum, stocks: { ...end, former: end.dormant + end.lost } };
    });
    const med = (pick) =>
        quantile(
            perRun.map(pick).sort((a, b) => a - b),
            0.5
        );
    return {
        flows: Object.fromEntries(keys.map((k) => [k, med((r) => r.flows[k])])),
        stocks: Object.fromEntries(Object.keys(perRun[0].stocks).map((k) => [k, med((r) => r.stocks[k])])),
    };
}

function flowFigure(results, year, phase) {
    const { flows, stocks } = yearlyFlows(results.baseline.recommended, year);
    return flowDiagram({
        title: `How CHOC moves in year ${year}: ${phase}`,
        subtitle: `Baseline scenario, recommended design. Average coins per monthly season, median of ${SEEDS} runs; arrow widths follow the amounts.`,
        flows,
        stocks,
        note: "Generated by whitepaper/simulator/run.js. Network fees in ADA are not shown; trades between players run through the market.",
    });
}

function payoutCurveFigure() {
    const pot = 100_000;
    const players = 2_000;
    const amounts = payoutAmounts(pot, players, DEFAULT_POLICY);
    const share = (top) => amounts.slice(0, top).reduce((a, b) => a + b, 0) / pot;
    return figure({
        title: "How one season's pot is shared",
        subtitle: `Example: ${formatNumber(pot)} CHOC, ${formatNumber(
            players
        )} eligible players; 15 % shared evenly, 85 % by rank with weights 1/rank. Top 10 players: ${Math.round(
            100 * share(10)
        )} % of the pot, top 100: ${Math.round(100 * share(100))} %.`,
        panels: [
            {
                title: "Prize by rank, top 50",
                xMax: 50,
                xStep: 10,
                xLabel: "rank",
                series: [{ color: SERIES_COLORS[0], points: amounts.slice(0, 50).map((a, i) => [i + 1, a]) }],
            },
            {
                title: "Prize by rank, all players (log scale)",
                xMax: players,
                xStep: 500,
                xLabel: "rank",
                yLog: true,

                series: [{ color: SERIES_COLORS[0], points: amounts.map((a, i) => [i + 1, a]) }],
            },
        ],
        note: `Last place still receives ${
            amounts[players - 1]
        } CHOC. Every amount is rounded down to whole CHOC; the coins left over stay in the pot.`,
    });
}

function resultsTable(results) {
    const years = [5, 10, 25];
    const lines = [
        "# Simulation results",
        "",
        `Generated by \`node whitepaper/simulator/run.js\` (${SEEDS} seeds per case, ${YEARS} years). Medians over all seeds. Do not edit by hand.`,
        "",
    ];
    const at = (runs, year, metric) => {
        const values = runs.map((h) => metric(h[year * 12 - 1])).sort((a, b) => a - b);
        return quantile(values, 0.5);
    };
    for (const [sk, scenario] of Object.entries(scenarios)) {
        lines.push(`## ${scenario.title}`, "", scenario.description, "");
        lines.push(
            "| Policy | Prizes per season, y5 / y10 / y25 | Players entered, y5 / y10 / y25 | Prize per entrant, y10 / y25 | Interested players who could pay, y25 | CHOC per active player, y25 | Supply with players who left, y10 / y25 |",
            "| --- | --- | --- | --- | --- | --- | --- |"
        );
        for (const [pk, policy] of Object.entries(policies)) {
            const runs = results[sk][pk];
            const series = (metric, ys, format) => ys.map((y) => format(at(runs, y, metric))).join(" / ");
            const coins = (v) => formatNumber(Math.round(v));
            const percent = (v) => `${Math.round(100 * v)} %`;
            const cells = [
                series((m) => m.payout, years, coins),
                series((m) => m.registered, years, coins),
                series((m) => (m.registered ? m.payout / m.registered : 0), [10, YEARS], coins),
                series((m) => m.affordability, [YEARS], percent),
                series((m) => m.coinsPerActive, [YEARS], coins),
                series((m) => (m.coins.dormant + m.coins.lost) / MAX_SUPPLY, [10, YEARS], percent),
            ];
            lines.push(`| ${policy.title} | ${cells.join(" | ")} |`);
        }
        lines.push("");
    }
    lines.push("## Policies", "");
    for (const policy of Object.values(policies)) lines.push(`- **${policy.title}:** ${policy.description}`);
    lines.push("");
    return lines.join("\n");
}

async function main() {
    fs.mkdirSync(FIGURES, { recursive: true });
    console.log(
        `Simulating ${Object.keys(scenarios).length} scenarios × ${
            Object.keys(policies).length
        } policies × ${SEEDS} seeds, ${YEARS} years`
    );
    const results = await runAll();
    console.log("Writing");
    write("issuance.svg", issuanceFigure());
    write("coin-location.svg", coinLocationFigure(results));
    write(
        "prizes.svg",
        scenarioFigure(results, {
            title: "Prize money per season",
            subtitle: "CHOC paid out to tournament players each month.",
            metric: (m) => m.payout,
        })
    );
    write(
        "entries.svg",
        scenarioFigure(results, {
            title: "Players in the tournament",
            subtitle: "Registered players per season. A fee keeps out players who hold too few coins.",
            metric: (m) => m.registered,
        })
    );
    write(
        "coins-per-player.svg",
        scenarioFigure(results, {
            title: "CHOC held per active player",
            subtitle:
                "Average coins in the wallets of active players (log scale). Near the fee, many players cannot enter.",
            metric: (m) => m.coinsPerActive,
            yLog: true,
            refLines: [{ value: 20, label: "fee: 20 CHOC", color: COLORS.text }],
        })
    );
    write("value-flow-early.svg", flowFigure(results, 3, "issuance pays the prizes"));
    write("value-flow-late.svg", flowFigure(results, 15, "players' spending pays the prizes"));
    write("payout-curve.svg", payoutCurveFigure());
    fs.writeFileSync(path.join(__dirname, "results.md"), resultsTable(results));
    console.log("  simulator/results.md");
}

if (isMainThread) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
} else workerMain();
