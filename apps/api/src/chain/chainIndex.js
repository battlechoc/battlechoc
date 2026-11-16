// The chain index: who holds which minted item, read from Yaci Store's tables through the views
// of views.sql (schema `chain`). The ownership sync and GET /user read the chain only through
// this. Every read runs on one client as BEGIN READ ONLY; SET LOCAL ROLE <read role>; the query;
// COMMIT, so a read can neither write nor see anything but the views. Asset names and subjects
// always go in as parameters; the only names in the SQL are the schemas and the role, checked
// against NAME before any SQL is built. On pg-mem (no roles, no views over jsonb) the chain double
// (test/chainDouble.js) stands in for it.
//
// The tip's time is the tip block's own, from its slot and the network's slot configuration, never
// when Yaci Store saved its cursor: a resyncing Yaci Store saves cursors of old blocks just now,
// and a tip that looked fresh then would let the ownership sync act on a partial chain.

const fs = require('fs');
const path = require('path');
const { AddressEras, Time, mainnet, preprod, preview } = require('@evolution-sdk/evolution');
const { chain: rules } = require('@battlechoc/battlechoc-shared-functions');
const { holderOf, keysOfAddress } = require('./addresses');
const { IndexUnavailableError } = require('./indexUnavailable');

const NAME = /^[a-z_][a-z0-9_]{0,40}$/;
const POLICY_ID = /^[0-9a-f]{56}$/;
const SUBJECT = /^(stake|pay):([0-9a-f]{56})$/;
/** The most asset names one holdersOf, eventsAmong or burnsOf call takes (the caller batches). */
const MAX_ASSET_NAMES = 500;
// the tables of Yaci Store the views read: ensureViews waits until all of them exist
const YACI_TABLES = ['cursor_', 'address_utxo', 'tx_input', 'assets'];
// the first key of the advisory lock ensureViews takes ("bcvw"); the second one is the views' schema
const VIEWS_LOCK = 0x62637677;

const VIEWS_SQL = fs.readFileSync(path.join(__dirname, 'views.sql'), 'utf8');

// the SDK's slot configuration of each network (shared/cardano/network.js names them), as tx.js
const CHAINS = { preprod, preview, mainnet };

/**
 * The slot configuration of `network` ({ zeroTime, zeroSlot, slotLength }, BigInt times and slots):
 * its own `slotConfig` if it brings one (the chain double), else the SDK's for its name. A
 * TypeError for a network without one: the index never guesses a tip's time.
 */
const slotConfigOf = network => {
    const config = network?.slotConfig ?? (Object.prototype.hasOwnProperty.call(CHAINS, network?.name ?? '') ? CHAINS[network.name].slotConfig : null);
    const whole = value => (typeof value === 'bigint' || Number.isSafeInteger(value)) && BigInt(value) >= 0n;
    if (!config || !whole(config.zeroTime) || !whole(config.zeroSlot) || !Number.isSafeInteger(config.slotLength) || config.slotLength <= 0) {
        throw new TypeError('chain index: the network has no slot configuration');
    }
    return Object.freeze({ zeroTime: BigInt(config.zeroTime), zeroSlot: BigInt(config.zeroSlot), slotLength: config.slotLength });
};

/**
 * The keys of the address `bech32` that held a burned token: { stake, payment, script }
 * (addresses.keysOfAddress; anything that is no address: both null, `script` false). Who that is
 * in the game is addresses.subjectsOfKeys of them, as holderOf decides: a script holds nothing,
 * else the stake key, else the payment key.
 */
const holderKeysOf = bech32 => {
    try {
        return keysOfAddress(AddressEras.fromBech32(bech32));
    } catch {
        return keysOfAddress(null);
    }
};

// a list of at most MAX_ASSET_NAMES asset names for `call`, else a TypeError or a RangeError
const checkedNames = (call, assetNames) => {
    if (!Array.isArray(assetNames) || !assetNames.every(name => typeof name === 'string')) {
        throw new TypeError(`${call}: a list of asset names`);
    }
    if (assetNames.length > MAX_ASSET_NAMES) {
        throw new RangeError(`${call}: at most ${MAX_ASSET_NAMES} asset names per call`);
    }
};

const checkedName = (option, value) => {
    if (typeof value !== 'string' || !NAME.test(value)) {
        throw new TypeError(`chain index: ${option} must match ${NAME.source}`);
    }
    return value;
};

// SQLSTATEs of an index that cannot answer: no view (yet), a view of another shape, a missing
// right, a connection or a server in trouble (classes 08, 53, 57, 58)
const UNAVAILABLE_CODES = ['42P01', '3F000', '42703', '42501'];
const UNAVAILABLE_CLASSES = ['08', '53', '57', '58'];
const SQLSTATE = /^[0-9A-Z]{5}$/;

const isUnavailable = error =>
    !SQLSTATE.test(error?.code ?? '') || UNAVAILABLE_CODES.includes(error.code) || UNAVAILABLE_CLASSES.includes(error.code.slice(0, 2));

// an error without a SQLSTATE is a connection that failed (ECONNREFUSED, "Connection terminated")
const unavailable = error => new IndexUnavailableError(`the chain index is unavailable (${SQLSTATE.test(error?.code ?? '') ? error.code : 'connection'})`, { cause: error });

// a failure of the client's `setup` (BEGIN, SET ROLE: a role that does not exist) is always an
// unavailable index; a failure of the query only for the SQLSTATEs above, else it stays what it
// is (a bug of the query, a write in a read-only transaction)
const classified = (error, setup) => (error instanceof IndexUnavailableError || (!setup && !isUnavailable(error)) ? error : unavailable(error));

/**
 * Runs `sql` with `params` as `readRole` in a read-only transaction on one client of `pool`: the
 * rows. IndexUnavailableError when the database cannot be reached or the role lacks a right.
 */
const readOnly = async ({ pool, readRole }, sql, params = []) => {
    const role = checkedName('readRole', readRole);
    let client;
    try {
        client = await pool.connect();
    } catch (error) {
        throw unavailable(error);
    }
    let broken = false;
    let setup = true;
    try {
        await client.query('BEGIN READ ONLY');
        await client.query(`SET LOCAL ROLE ${role}`);
        setup = false;
        const { rows } = await client.query(sql, params);
        await client.query('COMMIT');
        return rows;
    } catch (error) {
        broken = await client.query('ROLLBACK').then(
            () => false,
            () => true
        );
        throw classified(error, setup);
    } finally {
        client.release(broken);
    }
};

/**
 * The index over the views in `viewSchema` of Yaci Store's tables in `indexSchema` (ensureViews
 * makes them), read as `readRole`, on `network` (shared/cardano/network.js; its slot configuration
 * gives the tip's time): { ensureViews, tip, holdersOf, tokensHeldBy, transaction, mintOf,
 * eventsAmong, burnsOf }. A TypeError for a name off NAME, a policy id that is not 56 hex digits or a
 * network without a slot configuration, before any SQL.
 */
const createChainIndex = ({ pool, policyId, network, indexSchema = 'yaci_store', viewSchema = 'chain', readRole = 'chain_reader' }) => {
    if (typeof policyId !== 'string' || !POLICY_ID.test(policyId)) {
        throw new TypeError('chain index: policyId must be 56 hex digits');
    }
    const slotConfig = slotConfigOf(network);
    const names = { index: checkedName('indexSchema', indexSchema), views: checkedName('viewSchema', viewSchema), reader: checkedName('readRole', readRole) };
    const viewsSql = VIEWS_SQL.replace(/:(index|views|reader)\b/g, (_, key) => names[key]);
    const views = names.views;
    const read = (sql, params) => readOnly({ pool, readRole }, sql, params);

    /**
     * Makes the views (as the pool's own role, not the read role) once Yaci Store has made its
     * tables: false while one of them is missing (Yaci Store has not started yet), else true.
     * The watcher calls it at each run until it answers true, and again after a run in which the
     * index was unavailable (a rebuild of the index drops the views with Yaci Store's schema).
     */
    const ensureViews = async () => {
        let client;
        try {
            client = await pool.connect();
        } catch (error) {
            throw unavailable(error);
        }
        let broken = false;
        let inTransaction = false;
        try {
            const { rows } = await client.query('SELECT bool_and(to_regclass(name) IS NOT NULL) AS ready FROM unnest($1::text[]) AS name', [
                YACI_TABLES.map(table => `${names.index}.${table}`),
            ]);
            if (!rows[0].ready) {
                return false;
            }
            await client.query('BEGIN');
            inTransaction = true;
            // two servers at once would collide on the catalog
            await client.query('SELECT pg_advisory_xact_lock($1::int, hashtext($2))', [VIEWS_LOCK, views]);
            await client.query(viewsSql);
            await client.query('COMMIT');
            return true;
        } catch (error) {
            // outside the transaction, only a failure without a SQLSTATE leaves the client broken
            broken = inTransaction
                ? await client.query('ROLLBACK').then(
                      () => false,
                      () => true
                  )
                : !SQLSTATE.test(error?.code ?? '');
            throw classified(error, false);
        } finally {
            client.release(broken);
        }
    };

    const holderRow = row => ({
        assetName: row.unit.slice(policyId.length),
        address: row.address,
        ...holderOf(row.address),
        txHash: row.tx_hash,
        index: Number(row.output_index),
        blockNo: Number(row.block_no),
        slot: Number(row.slot),
    });
    const HOLDER_COLUMNS = 'unit, address, tx_hash, output_index, block_no, slot';
    const HOLDER_ORDER = 'ORDER BY block_no, tx_hash, output_index, unit';

    /**
     * The sync point: { blockNo, slot, hash, time } | null before the first sync. `time` is the tip
     * block's time (ms) from its slot, so an index that resyncs old blocks looks as old as they are.
     */
    const tip = async () => {
        const [row] = await read(`SELECT block_no, slot, block_hash FROM ${views}.tip`);
        if (!row) {
            return null;
        }
        const slot = Number(row.slot);
        return { blockNo: Number(row.block_no), slot, hash: row.block_hash, time: Number(Time.slotToUnixTime(BigInt(slot), slotConfig)) };
    };

    /**
     * The unspent outputs holding one of the policy's `assetNames` (at most MAX_ASSET_NAMES; more
     * is a RangeError): [{ assetName, address, stake, pay, txHash, index, blockNo, slot }], stake
     * and pay from addresses.holderOf. A name absent from the answer is held by no output (burned,
     * or never minted).
     */
    const holdersOf = async assetNames => {
        checkedNames('holdersOf', assetNames);
        if (assetNames.length === 0) {
            return [];
        }
        const units = assetNames.map(name => policyId + name);
        const rows = await read(`SELECT ${HOLDER_COLUMNS} FROM ${views}.item_outputs WHERE unit = ANY($1::text[]) AND NOT spent ${HOLDER_ORDER}`, [units]);
        return rows.map(holderRow);
    };

    /**
     * The unspent outputs of the policy's user tokens whose address addresses.holderOf gives one
     * of `subjects` ('stake:<hash>' / 'pay:<hash>'; anything else matches nothing): rows as
     * holdersOf's. SQL finds the candidates by Yaci Store's credentials, holderOf decides (a
     * script holds nothing, whatever its stake part).
     */
    const tokensHeldBy = async subjects => {
        if (!Array.isArray(subjects)) {
            throw new TypeError('tokensHeldBy: a list of subjects');
        }
        const wanted = new Set(subjects);
        const hashes = kind => subjects.map(subject => SUBJECT.exec(subject)).filter(match => match?.[1] === kind).map(match => match[2]);
        const [stakes, pays] = [hashes('stake'), hashes('pay')];
        if (stakes.length === 0 && pays.length === 0) {
            return [];
        }
        const rows = await read(
            `SELECT ${HOLDER_COLUMNS} FROM ${views}.item_outputs
             WHERE starts_with(unit, $1) AND NOT spent AND (stake_credential = ANY($2::text[]) OR payment_credential = ANY($3::text[]))
             ${HOLDER_ORDER}`,
            [policyId + rules.USER_LABEL, stakes, pays]
        );
        return rows.map(holderRow).filter(row => (row.stake !== null && wanted.has(row.stake)) || (row.pay !== null && wanted.has(row.pay)));
    };

    /** The block of the transaction `hash` (the lowest, of those that touch a user token of the policy): { blockNo, slot } | null. */
    const transaction = async hash => {
        const [row] = await read(`SELECT block_no, slot FROM ${views}.tx_blocks WHERE tx_hash = $1 ORDER BY block_no, slot LIMIT 1`, [String(hash)]);
        return row ? { blockNo: Number(row.block_no), slot: Number(row.slot) } : null;
    };

    /** The mint of the user token `assetName` (the first): { txHash, blockNo, time (ms of the block) } | null. */
    const mintOf = async assetName => {
        const [row] = await read(`SELECT tx_hash, block_no, block_time FROM ${views}.item_events WHERE unit = $1 AND kind = 'MINT' ORDER BY block_no, slot, tx_hash LIMIT 1`, [
            policyId + String(assetName),
        ]);
        return row ? { txHash: row.tx_hash, blockNo: Number(row.block_no), time: Number(row.block_time) * 1000 } : null;
    };

    /**
     * The names among `assetNames` (at most MAX_ASSET_NAMES; more is a RangeError) that the index
     * holds a mint of, and those it holds a burn of: { minted: Set, burned: Set } (a token minted,
     * burned and minted again is in both). The ownership sync judges only items whose mint the
     * index knows (an index started with another policy or from a slot after the mint holds no
     * output of the token), and reads "no output holds it" as "nobody" only when it knows a burn:
     * without one, an index that lacks the output (a filter that kept none, a half-written block)
     * must not take the item from its player.
     */
    const eventsAmong = async assetNames => {
        checkedNames('eventsAmong', assetNames);
        const events = { minted: new Set(), burned: new Set() };
        if (assetNames.length === 0) {
            return events;
        }
        const units = assetNames.map(name => policyId + name);
        const rows = await read(`SELECT DISTINCT unit, kind FROM ${views}.item_events WHERE unit = ANY($1::text[]) AND kind IN ('MINT', 'BURN')`, [units]);
        rows.forEach(row => (row.kind === 'MINT' ? events.minted : events.burned).add(row.unit.slice(policyId.length)));
        return events;
    };

    /**
     * The burns of the user tokens `assetNames` (at most MAX_ASSET_NAMES; more is a RangeError)
     * that are in blocks: [{ assetName, txHash, block, holder: { stake, payment, script } }], one
     * entry per (burn transaction, asset name), by block, transaction and name. `assetName` is
     * the user token's name as items.asset_name and chain_ops.asset_name hold it (000de140 + 56
     * hex); `block` the burn's block number; `holder` the keys of the address of the output the
     * burn spent that held the token (holderKeysOf). A name the index holds no burn of is absent,
     * and so is a burn whose spent output the index does not hold.
     */
    const burnsOf = async assetNames => {
        checkedNames('burnsOf', assetNames);
        if (assetNames.length === 0) {
            return [];
        }
        const units = assetNames.map(name => policyId + name);
        const rows = await read(`SELECT unit, tx_hash, block_no, address FROM ${views}.item_burns WHERE unit = ANY($1::text[]) ORDER BY block_no, tx_hash, unit`, [units]);
        return rows.map(row => ({ assetName: row.unit.slice(policyId.length), txHash: row.tx_hash, block: Number(row.block_no), holder: holderKeysOf(row.address) }));
    };

    return Object.freeze({ ensureViews, tip, holdersOf, tokensHeldBy, transaction, mintOf, eventsAmong, burnsOf });
};

module.exports = { IndexUnavailableError, MAX_ASSET_NAMES, createChainIndex, holderKeysOf, readOnly };
