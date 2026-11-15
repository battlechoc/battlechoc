// Chain operations (minting plan D): one row per mint (plan E: per burn), moved through its states
// by chain/ops.js only, each step a compare-and-set update. In code, so pg-mem and Postgres run
// the same statements, except the two partial unique indexes, which pg-mem does not hold reliably.

const { isPostgres } = require('../db');

// the states in which an operation holds its player and its item (chain/ops.js OPEN)
const OPEN_STATES = "('prepared', 'submitted', 'included')";

module.exports = async db => {
    // amounts (lovelace, or the fee asset's units) as text: they are never computed with in SQL.
    // game_fee_asset: the config datum's fee asset as it is ('lovelace' or policy hex + asset
    // name hex), null without a battlechoc fee. ttl_slot: the transaction's ttl as built (exclusive).
    // code_hash: SHA-256 of the sign code, cleared once it is used up. Times are null until set.
    // asset_name is never empty (it becomes items.asset_name, migration 013's CHECK). tx_hash is
    // not unique: the build is deterministic, so a mint cancelled and prepared again within one
    // block has the same transaction (harmless: the server never signed the cancelled one).
    // An included operation always has its block: ops.js pins markRolledBack and markFinal to it,
    // so one without would hold its player and item for good. submit_error: the last failed
    // submit's reason, for diagnosis (null once one is accepted); submit_rejected: the network
    // refused the transaction at a submit and none was accepted since (a busy or unreachable
    // provider says nothing about the transaction and leaves it as it is): an expiry then says
    // 'rejected'. ttl_passed_block: the first tip the watcher saw beyond the ttl (the safe
    // expiry counts K_FINAL blocks from it), null again while a rollback has the tip before it.
    // deposit: the ADA both tokens' outputs hold; deposit_user: of that, the user token's output's,
    // which goes to the player's own address (the rest, the reference token's, stays at the items
    // script): a wallet shows the deposit less this as what leaves it (ruling D38).
    // owner_confirmed: the transaction was built from addresses a wallet of the player vouched for
    // (named under the player's session, or signed for with the subject's key); only such a one is
    // co-signed.
    await db.query(`CREATE TABLE chain_ops (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL REFERENCES players(id),
        item_id TEXT NOT NULL REFERENCES items(id),
        kind TEXT NOT NULL CHECK (kind IN ('mint', 'burn')),
        state TEXT NOT NULL CHECK (state IN ('prepared', 'submitted', 'included', 'final', 'cancelled', 'expired')),
        error TEXT,
        subject TEXT NOT NULL,
        owner_key_hash TEXT NOT NULL,
        owner_address TEXT NOT NULL,
        owner_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
        required_keys TEXT NOT NULL,
        asset_name TEXT NOT NULL CHECK (asset_name <> ''),
        tx_hash TEXT NOT NULL,
        tx_cbor TEXT NOT NULL,
        signed_cbor TEXT,
        ttl_slot BIGINT NOT NULL,
        sign_until TIMESTAMPTZ NOT NULL,
        code_hash TEXT UNIQUE,
        fee_option INTEGER NOT NULL,
        network_fee TEXT NOT NULL,
        game_fee_asset TEXT,
        game_fee TEXT,
        deposit TEXT NOT NULL,
        deposit_user TEXT NOT NULL,
        submit_error TEXT,
        submit_rejected BOOLEAN NOT NULL DEFAULT FALSE,
        last_submit_at TIMESTAMPTZ,
        included_block BIGINT,
        ttl_passed_block BIGINT,
        created_at TIMESTAMPTZ NOT NULL,
        submitted_at TIMESTAMPTZ,
        included_at TIMESTAMPTZ,
        final_at TIMESTAMPTZ,
        ended_at TIMESTAMPTZ,
        CHECK (state <> 'included' OR included_block IS NOT NULL)
    )`);
    await db.query('CREATE INDEX chain_ops_player_state ON chain_ops (player_id, state)');
    await db.query('CREATE INDEX chain_ops_state ON chain_ops (state)');
    await db.query('CREATE INDEX chain_ops_tx_hash ON chain_ops (tx_hash)');
    // One open operation per player and per item, also across API processes: of two inserts that
    // race, the second fails here (ops.insertPrepared turns that into an OpenOperationError). The
    // item index also serves the stats' join (players.itemsOf). pg-mem accepts partial indexes but
    // names the wrong constraint when one refuses a row; there ops.insertPrepared's own check and
    // the per-player queue of the routes are the guard.
    if (isPostgres(db)) {
        await db.query(`CREATE UNIQUE INDEX chain_ops_one_open_player ON chain_ops (player_id) WHERE state IN ${OPEN_STATES}`);
        await db.query(`CREATE UNIQUE INDEX chain_ops_one_open_item ON chain_ops (item_id) WHERE state IN ${OPEN_STATES}`);
    }
};
