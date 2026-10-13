// Seeded pseudo random numbers whose state lives inside the match (match.rng), so a match
// is fully reproducible from its seed and its action log. Never use Math.random in the engine.

// xmur3-style string hash to turn any seed into a 32 bit state
const seedFrom = seed => {
    const str = String(seed);
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^ (h >>> 16)) >>> 0;
};

// mulberry32 step on holder.rng, returns a float in [0, 1)
const next = holder => {
    holder.rng = (holder.rng + 0x6D2B79F5) >>> 0;
    let t = holder.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const nextInt = (holder, n) => Math.floor(next(holder) * n);

const pick = (holder, list) => list[nextInt(holder, list.length)];

const pickWeighted = (holder, weights) => {
    const entries = Object.entries(weights).filter(([, weight]) => weight > 0);
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = next(holder) * total;
    for (const [key, weight] of entries) {
        roll -= weight;
        if (roll < 0) {
            return key;
        }
    }
    return entries[entries.length - 1][0];
};

module.exports = { seedFrom, next, nextInt, pick, pickWeighted };
