"use strict";

// Animated token-flow diagram. Arrow widths and the number of moving coins
// follow the simulated flows; the labels show coins per season.

const { formatNumber, COLORS } = require("./charts");

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const NODE = { w: 180, h: 72 };

const NODES = {
    mint: { x: 30, y: 70, title: "Minting policy", stock: "unminted", stockLabel: "not minted yet" },
    pot: { x: 390, y: 70, title: "Tournament pot", stock: "pot", stockLabel: "for the next season" },
    claims: { x: 750, y: 70, title: "Prize claims", stock: "pending", stockLabel: "not claimed yet" },
    team: { x: 30, y: 290, title: "battlechoc team", stock: "team", stockLabel: "not sold yet" },
    players: { x: 390, y: 290, title: "Active players", stock: "active", stockLabel: "in their wallets" },
    market: { x: 750, y: 290, title: "Market (DEX)", stockLabel: "anyone can trade" },
    former: { x: 390, y: 500, title: "Players who left", stock: "former", stockLabel: "in their wallets" },
};

// Paths between the nodes, with the place of the label.
const EDGES = [
    { key: "minted", label: "season issuance", d: "M210,103 L390,103", lx: 300, ly: 92 },
    { key: "payout", label: "prizes", d: "M570,92 L750,92", lx: 660, ly: 82 },
    { key: "unclaimed", label: "unclaimed, back", d: "M750,122 L570,122", lx: 660, ly: 142 },
    { key: "claimed", label: "claimed", d: "M840,142 C840,220 640,250 570,300", lx: 760, ly: 222 },
    { key: "toPot", label: "spent: 90–95 % to the pot", d: "M480,290 L480,142", lx: 488, ly: 215, anchor: "start" },
    { key: "toTeam", label: "spent: 5–10 % to the team", d: "M390,323 L210,323", lx: 300, ly: 313 },
    { key: "teamSold", label: "team sells for USDCx", d: "M120,362 C120,455 840,455 840,362", lx: 640, ly: 452 },
    { key: "traded", label: "players buy CHOC", d: "M750,323 L570,323", lx: 660, ly: 313 },
    {
        key: "leftWithPlayers",
        label: "players leave with their coins",
        d: "M480,362 L480,500",
        lx: 488,
        ly: 475,
        anchor: "start",
    },
    { key: "dormantSold", label: "old coins sold", d: "M570,536 C700,536 790,470 790,362", lx: 700, ly: 552 },
    {
        key: "pantryReturned",
        label: "unwithdrawn prizes return",
        d: "M390,540 C230,540 300,150 410,142",
        lx: 318,
        ly: 236,
        anchor: "end",
    },
];

function esc(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function pathLength(d) {
    // Good enough for animation timing: straight distance between the points.
    const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
    let length = 0;
    for (let i = 2; i < nums.length; i += 2) length += Math.hypot(nums[i] - nums[i - 2], nums[i + 1] - nums[i - 1]);
    return length;
}

function flowDiagram({ title, subtitle, flows, stocks, note }) {
    const width = 960;
    const height = 640;
    const values = {
        ...flows,
        toPot: flows.registrationToPot + flows.craftingToPot,
        toTeam: flows.registrationToTeam + flows.craftingToTeam,
    };
    const max = Math.max(...EDGES.map((e) => values[e.key] || 0), 1);
    const parts = [];
    parts.push(
        `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="${FONT}" role="img" aria-label="${esc(
            title
        )}">`
    );
    parts.push(`<style>@media (prefers-reduced-motion: reduce) { .coin { display: none; } }</style>`);
    parts.push(
        `<defs><marker id="arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${COLORS.muted}"/></marker></defs>`
    );
    parts.push(`<rect width="${width}" height="${height}" rx="10" fill="${COLORS.background}"/>`);
    parts.push(`<text x="20" y="30" font-size="17" font-weight="700" fill="${COLORS.text}">${esc(title)}</text>`);
    parts.push(`<text x="20" y="50" font-size="12.5" fill="${COLORS.muted}">${esc(subtitle)}</text>`);

    EDGES.forEach((edge, i) => {
        const value = values[edge.key] || 0;
        const strokeWidth = value > 0 ? 2 + 14 * Math.sqrt(value / max) : 1;
        const id = `edge${i}`;
        parts.push(
            `<path id="${id}" d="${edge.d}" fill="none" stroke="#d9b99b" stroke-opacity="${
                value > 0 ? 0.75 : 0.35
            }" stroke-width="${strokeWidth.toFixed(1)}" stroke-linecap="round"${
                value > 0 ? "" : ' stroke-dasharray="4 4"'
            }/>`
        );
        parts.push(`<path d="${edge.d}" fill="none" stroke="none" marker-end="url(#arrow)"/>`);
        if (value > 0) {
            const coins = 1 + Math.round(4 * Math.sqrt(value / max));
            const duration = Math.max(2.5, pathLength(edge.d) / 90);
            for (let c = 0; c < coins; c++) {
                const begin = (-(duration * c) / coins).toFixed(2);
                parts.push(
                    `<circle class="coin" r="5" fill="#e3a72f" stroke="#7b4a2e" stroke-width="1.2"><animateMotion dur="${duration.toFixed(
                        2
                    )}s" begin="${begin}s" repeatCount="indefinite" rotate="auto"><mpath xlink:href="#${id}"/></animateMotion></circle>`
                );
            }
        }
        const anchor = edge.anchor || "middle";
        const amount = value > 0 ? `${formatNumber(Math.round(value))} CHOC` : "none";
        parts.push(
            `<text x="${edge.lx}" y="${edge.ly}" font-size="11.5" text-anchor="${anchor}" fill="${
                COLORS.text
            }"><tspan font-weight="600">${esc(amount)}</tspan> <tspan fill="${COLORS.muted}">${esc(
                edge.label
            )}</tspan></text>`
        );
    });

    for (const node of Object.values(NODES)) {
        parts.push(
            `<rect x="${node.x}" y="${node.y}" width="${NODE.w}" height="${NODE.h}" rx="12" fill="#ffffff" stroke="#7b4a2e" stroke-width="1.5"/>`
        );
        const cx = node.x + NODE.w / 2;
        parts.push(
            `<text x="${cx}" y="${node.y + 24}" font-size="14" font-weight="700" text-anchor="middle" fill="${
                COLORS.text
            }">${esc(node.title)}</text>`
        );
        if (node.stock !== undefined && stocks[node.stock] !== undefined) {
            parts.push(
                `<text x="${cx}" y="${
                    node.y + 44
                }" font-size="13" font-weight="600" text-anchor="middle" fill="#7b4a2e">${esc(
                    formatNumber(Math.round(stocks[node.stock]))
                )} CHOC</text>`
            );
            parts.push(
                `<text x="${cx}" y="${node.y + 61}" font-size="11" text-anchor="middle" fill="${COLORS.muted}">${esc(
                    node.stockLabel
                )}</text>`
            );
        } else {
            parts.push(
                `<text x="${cx}" y="${node.y + 50}" font-size="11.5" text-anchor="middle" fill="${COLORS.muted}">${esc(
                    node.stockLabel
                )}</text>`
            );
        }
    }
    if (note) parts.push(`<text x="20" y="${height - 14}" font-size="11" fill="${COLORS.muted}">${esc(note)}</text>`);
    parts.push("</svg>", "");
    return parts.join("\n");
}

module.exports = { flowDiagram };
