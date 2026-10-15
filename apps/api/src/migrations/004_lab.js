// The lab (2026-10): equipment replaces building levels. Players get equipment slots, crafted
// items, discovered recipes; the cocoa and ingredients their levels cost go back to the pantry.

const { EmptyPlayerStats, levelRefund } = require('@battlechoc/battlechoc-shared-functions');
const pantry = require('../pantry');

module.exports = async pool => {
    await pool.query("ALTER TABLE players ADD COLUMN equipment JSONB NOT NULL DEFAULT '{}'");
    await pool.query(`CREATE TABLE items (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL REFERENCES players(id),
        item_key TEXT NOT NULL,
        serial INTEGER NOT NULL,
        crafted_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await pool.query('CREATE INDEX items_player ON items (player_id)');
    await pool.query('CREATE TABLE item_serials (item_key TEXT PRIMARY KEY, last INTEGER NOT NULL)');
    await pool.query(`CREATE TABLE recipe_discoveries (
        item_key TEXT PRIMARY KEY,
        player_id TEXT NOT NULL REFERENCES players(id),
        discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    const { rows } = await pool.query('SELECT id, level FROM players');
    for (const row of rows) {
        const refund = levelRefund(row.level || {});
        if (Object.keys(refund).length > 0) {
            await pantry.add(pool, row.id, Object.entries(refund).map(([ingredient, amount]) => ({ ingredient, amount })), Date.now());
        }
    }
    await pool.query('UPDATE players SET level = $1', [JSON.stringify(EmptyPlayerStats.level)]);
};
