// Reading the chain (minting plan C): a minted item belongs to the player whose wallet holds its
// token, so items.player_id may be NULL (the token is in nobody's linked wallet); the columns the
// mint (plan D), the burn (plan E) and the ownership sync write; when each Cardano key was linked
// to and removed from which player (the wallet hop wait); the wallet's name of a key; and the
// notices of items that arrived in or departed from a player's wallet. In code, so pg-mem and
// Postgres run the same statements.

const crypto = require('crypto');

module.exports = async db => {
    await db.query('ALTER TABLE items ALTER COLUMN player_id DROP NOT NULL');
    // plan D sets asset_name and minted_at once the mint is in a block, plan E burned_at; the sync
    // derives player_id, holder_subject (the stake or pay subject that holds the token), holder_pay
    // (the payment key of that address, which owns it when its stake key is nobody's) and holder_since
    await db.query('ALTER TABLE items ADD COLUMN asset_name TEXT');
    await db.query('ALTER TABLE items ADD COLUMN minted_at TIMESTAMPTZ');
    await db.query('ALTER TABLE items ADD COLUMN burned_at TIMESTAMPTZ');
    await db.query('ALTER TABLE items ADD COLUMN holder_subject TEXT');
    await db.query('ALTER TABLE items ADD COLUMN holder_pay TEXT');
    await db.query('ALTER TABLE items ADD COLUMN holder_since TIMESTAMPTZ');
    // NULL (not minted) many times, as in Postgres; pg-mem does the same (db.test.js)
    await db.query('CREATE UNIQUE INDEX items_asset_name ON items (asset_name)');
    // an asset name is never empty (the ownership sync pages through minted items from ''), and a
    // minted item always has one (the sync and the wallet's item count find minted items by it);
    // pg-mem holds both checks as Postgres does (db.test.js)
    await db.query("ALTER TABLE items ADD CONSTRAINT items_asset_name_not_empty CHECK (asset_name <> '')");
    await db.query('ALTER TABLE items ADD CONSTRAINT items_minted_has_asset_name CHECK (minted_at IS NULL OR asset_name IS NOT NULL)');

    // the CIP-30 name of the wallet that linked a key (NULL: words, or a name the game did not know)
    await db.query('ALTER TABLE identities ADD COLUMN wallet TEXT');

    // one row per time a key was linked to a player, closed when it is removed; at most one open
    // row per subject
    await db.query(`CREATE TABLE identity_history (
        id TEXT PRIMARY KEY,
        subject TEXT NOT NULL,
        player_id TEXT NOT NULL REFERENCES players(id),
        linked_at TIMESTAMPTZ NOT NULL,
        unlinked_at TIMESTAMPTZ
    )`);
    await db.query('CREATE INDEX identity_history_subject ON identity_history (subject)');
    const { rows } = await db.query("SELECT subject, player_id, created_at FROM identities WHERE provider = 'cardano'");
    for (const row of rows) {
        await db.query('INSERT INTO identity_history (id, subject, player_id, linked_at) VALUES ($1, $2, $3, $4)',
            [crypto.randomUUID(), row.subject, row.player_id, row.created_at]);
    }

    // kind 'arrived' | 'departed'; building: the entity type of the slot a departed item was in
    await db.query(`CREATE TABLE item_notices (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL REFERENCES players(id),
        item_id TEXT NOT NULL REFERENCES items(id),
        kind TEXT NOT NULL,
        building TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        seen_at TIMESTAMPTZ
    )`);
    await db.query('CREATE INDEX item_notices_player ON item_notices (player_id, seen_at)');
};
