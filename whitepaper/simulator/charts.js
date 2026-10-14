"use strict";

// Small SVG chart helpers without dependencies. The figures are static
// files in ../figures and render on GitHub and in any browser.

const COLORS = {
    text: "#3b2418",
    muted: "#7d6658",
    grid: "#eadfd6",
    axis: "#b9a597",
    background: "#fffaf5",
};

const SERIES_COLORS = ["#7b4a2e", "#d9822b", "#2f7f6f", "#b23a5b", "#4b5fb3", "#8f8f8f"];

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

function esc(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatNumber(value) {
    const abs = Math.abs(value);
    const trim = (n) => String(Number(n.toFixed(1)));
    if (abs >= 1e6) return `${trim(value / 1e6)}M`;
    if (abs >= 1e3) return `${trim(value / 1e3)}k`;
    return trim(value);
}

function niceTicks(max, count = 4) {
    if (!(max > 0)) max = 1;
    const raw = max / count;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const norm = raw / magnitude;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * magnitude;
    const ticks = [];
    for (let v = 0; v < max + step * 0.999; v += step) ticks.push(Number(v.toPrecision(12)));
    return ticks;
}

function text(x, y, content, { size = 12, weight = 400, anchor = "start", color = COLORS.text } = {}) {
    return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${color}">${esc(
        content
    )}</text>`;
}

// One chart area. `series`: [{ color, points: [[x, y]], band?: [[x, lo, hi]], dash? }].
// `layers` (stacked areas) can be given instead of `series`.
function panel({
    x,
    y,
    width,
    height,
    title,
    series = [],
    layers,
    xMax,
    yMax,
    yLog = false,
    yFormat = formatNumber,
    refLines = [],
    xStep,
    xLabel,
}) {
    const left = x + 48;
    const top = y + 24;
    const right = x + width - 8;
    const bottom = y + height - 26;
    const out = [];
    if (title) out.push(text(x + 4, y + 14, title, { size: 13, weight: 600 }));

    let maxValue = yMax;
    if (maxValue === undefined) {
        maxValue = 0;
        for (const s of series) {
            for (const [, v] of s.points) maxValue = Math.max(maxValue, v);
            for (const [, , hi] of s.band || []) maxValue = Math.max(maxValue, hi);
        }
        if (layers) {
            const n = layers[0].points.length;
            for (let i = 0; i < n; i++)
                maxValue = Math.max(
                    maxValue,
                    layers.reduce((sum, l) => sum + l.points[i][1], 0)
                );
        }
        for (const r of refLines) maxValue = Math.max(maxValue, r.value);
    }
    let yTicks;
    let sy;
    if (yLog) {
        // Decades from 1 up; values below 1 sit on the axis.
        const decades = Math.max(1, Math.ceil(Math.log10(Math.max(maxValue, 10))));
        yTicks = Array.from({ length: decades + 1 }, (_, i) => 10 ** i);
        sy = (v) => bottom - (Math.log10(Math.max(v, 1)) / decades) * (bottom - top);
    } else {
        yTicks = niceTicks(maxValue);
        const yTop = yTicks[yTicks.length - 1];
        sy = (v) => bottom - (v / yTop) * (bottom - top);
    }
    const sx = (v) => left + (v / xMax) * (right - left);

    for (const tick of yTicks) {
        const ty = sy(tick).toFixed(1);
        out.push(`<line x1="${left}" x2="${right}" y1="${ty}" y2="${ty}" stroke="${COLORS.grid}" stroke-width="1"/>`);
        out.push(text(left - 6, Number(ty) + 4, yFormat(tick), { size: 11, anchor: "end", color: COLORS.muted }));
    }
    const step = xStep || (xMax <= 10 ? 2 : 5);
    for (let v = 0; v <= xMax; v += step) {
        out.push(text(sx(v), bottom + 16, `${v}`, { size: 11, anchor: "middle", color: COLORS.muted }));
    }
    if (xLabel) out.push(text(right, bottom - 6, xLabel, { size: 11, anchor: "end", color: COLORS.muted }));
    out.push(`<line x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}" stroke="${COLORS.axis}"/>`);

    if (layers) {
        const n = layers[0].points.length;
        const base = new Array(n).fill(0);
        for (const layer of layers) {
            const upper = layer.points.map(([px, v], i) => [px, base[i] + v]);
            const path =
                upper.map(([px, v], i) => `${i ? "L" : "M"}${sx(px).toFixed(1)},${sy(v).toFixed(1)}`).join("") +
                layer.points
                    .map(([px], i) => [px, base[i]])
                    .reverse()
                    .map(([px, v]) => `L${sx(px).toFixed(1)},${sy(v).toFixed(1)}`)
                    .join("") +
                "Z";
            out.push(`<path d="${path}" fill="${layer.color}" fill-opacity="0.9"/>`);
            for (let i = 0; i < n; i++) base[i] = upper[i][1];
        }
    }

    for (const s of series) {
        if (s.band && s.band.length) {
            const upper = s.band.map(([px, , hi]) => `${sx(px).toFixed(1)},${sy(hi).toFixed(1)}`);
            const lower = s.band.map(([px, lo]) => `${sx(px).toFixed(1)},${sy(lo).toFixed(1)}`).reverse();
            out.push(`<polygon points="${upper.concat(lower).join(" ")}" fill="${s.color}" fill-opacity="0.13"/>`);
        }
    }
    for (const s of series) {
        const d = s.points.map(([px, v], i) => `${i ? "L" : "M"}${sx(px).toFixed(1)},${sy(v).toFixed(1)}`).join("");
        const dash = s.dash ? ` stroke-dasharray="${s.dash}"` : "";
        out.push(
            `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${
                s.width || 2
            }"${dash} stroke-linejoin="round"/>`
        );
    }
    for (const r of refLines) {
        const ry = sy(r.value).toFixed(1);
        out.push(
            `<line x1="${left}" x2="${right}" y1="${ry}" y2="${ry}" stroke="${
                r.color || COLORS.text
            }" stroke-dasharray="5 4" stroke-width="1.2"/>`
        );
        if (r.label) {
            const lx = left + 6;
            const ly = Number(ry) - 5;
            out.push(
                `<rect x="${lx - 3}" y="${ly - 11}" width="${r.label.length * 6.2 + 6}" height="15" rx="3" fill="${
                    COLORS.background
                }" fill-opacity="0.85"/>`
            );
            out.push(text(lx, ly, r.label, { size: 11, color: r.color || COLORS.text }));
        }
    }
    return out.join("\n");
}

function legend(x, y, items, maxWidth) {
    const out = [];
    let cx = x;
    let cy = y;
    for (const item of items) {
        const w = 26 + item.name.length * 6.6;
        if (cx + w > x + maxWidth) {
            cx = x;
            cy += 18;
        }
        const swatch = item.area
            ? `<rect x="${cx}" y="${cy - 9}" width="14" height="10" fill="${item.color}"/>`
            : `<line x1="${cx}" x2="${cx + 16}" y1="${cy - 4}" y2="${cy - 4}" stroke="${item.color}" stroke-width="3"${
                  item.dash ? ` stroke-dasharray="${item.dash}"` : ""
              }/>`;
        out.push(swatch);
        out.push(text(cx + 20, cy, item.name, { size: 12 }));
        cx += w + 14;
    }
    return { svg: out.join("\n"), height: cy - y + 18 };
}

// A figure with a title, a legend and a grid of panels.
function figure({ title, subtitle, legendItems = [], panels, columns = 2, width = 900, panelHeight = 240, note }) {
    const margin = 20;
    let cursor = 30;
    const parts = [text(margin, cursor, title, { size: 17, weight: 700 })];
    if (subtitle) {
        cursor += 20;
        parts.push(text(margin, cursor, subtitle, { size: 12.5, color: COLORS.muted }));
    }
    cursor += 24;
    if (legendItems.length) {
        const l = legend(margin, cursor, legendItems, width - 2 * margin);
        parts.push(l.svg);
        cursor += l.height;
    }
    const panelWidth = (width - 2 * margin) / columns;
    panels.forEach((p, i) => {
        const col = i % columns;
        const row = Math.floor(i / columns);
        parts.push(
            panel({
                ...p,
                x: margin + col * panelWidth,
                y: cursor + row * panelHeight,
                width: panelWidth - 10,
                height: panelHeight - 8,
            })
        );
    });
    cursor += Math.ceil(panels.length / columns) * panelHeight;
    if (note) {
        cursor += 4;
        parts.push(text(margin, cursor, note, { size: 11, color: COLORS.muted }));
        cursor += 10;
    }
    const height = Math.ceil(cursor + 12);
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="${FONT}" role="img" aria-label="${esc(
            title
        )}">`,
        `<rect width="${width}" height="${height}" rx="10" fill="${COLORS.background}"/>`,
        ...parts,
        "</svg>",
        "",
    ].join("\n");
}

module.exports = { figure, formatNumber, SERIES_COLORS, COLORS };
