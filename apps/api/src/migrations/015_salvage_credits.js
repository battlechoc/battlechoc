// Salvaging a minted item (minting plan E): plan E's one migration, still open while plan E is
// built (each task adds what it needs here, until plan E is merged; after that any change is a
// new migration). In code, so pg-mem and Postgres run the same statements. It runs on a database
// that has 014 and nothing of plan E.
//
// - Task 2, the burn operation: a burn pays no battlechoc fee, so it has no fee option
//   (chain_ops.fee_option NULL for kind 'burn'; a mint still always stores its option).
// - Task 3, the credit (chain/credit.js): one row per burn that was credited, keyed by the burn on
//   chain (transaction and user token), and an asset name at most once ever: a burned item is
//   credited once, whatever transaction burned it. `player_id` the player credited (null: the
//   holder was no player, the item was closed for nobody), `returned` the ingredients they got
//   ({ ingredient: amount }, {} without a recipe; null for nobody), read back for the 'salvaged'
//   notice (players.noticesOf). The row stores no wallet key: who held the token is on the chain,
//   from `tx_hash`. items.burn_tx: the burn that holds the item now (the ownership sync writes and
//   clears it at any depth until the credit closes the item, and the credit keeps it).

module.exports = async db => {
    await db.query('ALTER TABLE chain_ops ALTER COLUMN fee_option DROP NOT NULL');

    await db.query('ALTER TABLE items ADD COLUMN burn_tx TEXT');
    await db.query(`CREATE TABLE salvage_credits (
        tx_hash TEXT NOT NULL,
        asset_name TEXT NOT NULL,
        player_id TEXT REFERENCES players(id),
        returned JSONB,
        credited_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (tx_hash, asset_name)
    )`);
    await db.query('CREATE UNIQUE INDEX salvage_credits_asset_name ON salvage_credits (asset_name)');
};
