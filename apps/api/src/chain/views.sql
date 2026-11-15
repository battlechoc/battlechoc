-- The views the API reads the chain through (chainIndex.js), over the tables of Yaci Store 2.0.7
-- (the utxo and assets stores and the core's cursor, checked against its Flyway migrations at tag
-- v2.0.7). This is the only file of src/ that names Yaci Store's tables; Yaci Store keeps only
-- the outputs that hold a user token of our policy (CIP-68 label 000de140; each output whole),
-- the spends of those outputs, and the mints and burns of user tokens
-- (deploy/chain/application-plugins.yml). Nothing here reads a reference token (000643b0): a burn
-- finds the reference output through the provider.
--
-- Not a numbered migration: Yaci Store creates its tables with its own Flyway on its first start,
-- after the API may have migrated, and a server without chain features has none. ensureViews()
-- applies this file, as the API's own role and in one transaction, once the tables exist; it
-- replaces the placeholders with checked names first: :index (Yaci Store's schema), :views (the
-- views' schema) and :reader (the read role). CREATE OR REPLACE VIEW keeps the columns of a view
-- as they are; a change of a column's name or type needs a DROP VIEW here.

CREATE SCHEMA IF NOT EXISTS :views;

-- The sync point: the cursor row with the highest slot. Its time is the block's, from the slot
-- (chainIndex.js); synced_at is only for a look by hand: when Yaci Store saved the cursor (a
-- LocalDateTime of its JVM, UTC in the image), which is "just now" for every block of a resync.
CREATE OR REPLACE VIEW :views.tip AS
    SELECT block_number AS block_no, slot, block_hash, update_datetime AT TIME ZONE 'UTC' AS synced_at
    FROM :index.cursor_
    ORDER BY slot DESC, block_number DESC
    LIMIT 1;

-- One row per output and asset (amounts: [{ unit, policy_id, asset_name, quantity }], ada as the
-- unit 'lovelace'). The credentials are Yaci Store's: the payment part's hash (key or script) and
-- a base address's stake part's hash, for a first filter by subject; who holds an output is
-- decided by addresses.holderOf over the address.
CREATE OR REPLACE VIEW :views.item_outputs AS
    SELECT amount->>'unit' AS unit,
           (amount->>'quantity')::numeric AS quantity,
           utxo.owner_addr AS address,
           utxo.owner_stake_credential AS stake_credential,
           utxo.owner_payment_credential AS payment_credential,
           utxo.tx_hash,
           utxo.output_index,
           utxo.block AS block_no,
           utxo.slot,
           EXISTS (
               SELECT 1 FROM :index.tx_input spend
               WHERE spend.tx_hash = utxo.tx_hash AND spend.output_index = utxo.output_index
           ) AS spent
    FROM :index.address_utxo utxo
    CROSS JOIN LATERAL jsonb_array_elements(utxo.amounts) AS amount
    WHERE amount->>'unit' <> 'lovelace';

-- The mints and burns of the policy's user tokens (kind: MINT or BURN; quantity negative for a
-- burn; block_time in seconds).
CREATE OR REPLACE VIEW :views.item_events AS
    SELECT tx_hash, unit, quantity, mint_type AS kind, block AS block_no, slot, block_time
    FROM :index.assets;

-- The block of every transaction that touches the policy's user tokens: it makes an output with
-- one, mints or burns one, or spends such an output (a burn makes no output with the token).
-- Spends count only for an output Yaci Store kept: it writes tx_input for every input.
CREATE OR REPLACE VIEW :views.tx_blocks AS
    SELECT tx_hash, block AS block_no, slot FROM :index.address_utxo
    UNION
    SELECT tx_hash, block, slot FROM :index.assets
    UNION
    SELECT spend.spent_tx_hash, spend.spent_at_block, spend.spent_at_slot
    FROM :index.tx_input spend
    JOIN :index.address_utxo utxo ON utxo.tx_hash = spend.tx_hash AND utxo.output_index = spend.output_index;

GRANT USAGE ON SCHEMA :views TO :reader;
GRANT SELECT ON ALL TABLES IN SCHEMA :views TO :reader;
