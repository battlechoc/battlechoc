// Chain operations (spec 6.2, minting plan D): the state machine of chain_ops. A mint, or a burn
// of a minted item (plan E), is prepared (built, item locked, waiting for the wallet's
// signature), submitted (witness checked, co-signed, sent), included (in a block), final (K_FINAL
// deep); or it ends cancelled (by the player while prepared) or expired (not signed in the sign
// window; or submitted, past its ttl and not on the chain).
//
// Every step is one compare-and-set: `UPDATE … WHERE id = $1 AND state = <from> RETURNING *`. Of
// two callers that race for a step (two tabs, the watcher, a cancel against a signature) exactly
// one gets the row back; the other gets null and changes nothing, so a step's effects (the item
// marked minted) happen once. A step reads the state from the table, never from
// the caller's copy of the row; of that copy it uses the id, and markRolledBack and markFinal also
// its `included_block`, the inclusion the caller judged (a copy from before a rollback and a new
// inclusion matches nothing). Every function answers
// rows as the table holds them (snake_case), with the BIGINT columns as Numbers on both databases.
//
// The steps that change the item too (markIncluded, markRolledBack: a mint's only; a burn changes
// no item here, its ingredients are credited by a watcher step of its own, plan E Task 3) and
// markFinal take a pool and run in one transaction of their own. `now` is the app's clock, a
// time in ms, never left out (a TypeError otherwise): the watcher and the tests inject theirs.

const crypto = require('crypto');
const { withTransaction } = require('../db');
const { hashOf } = require('../linkCodes');
const { holderOf } = require('./addresses');

/** The states in which an operation holds its player and its item. */
const OPEN = Object.freeze(['prepared', 'submitted', 'included']);
/** The states an operation ends in. */
const ENDED = Object.freeze(['final', 'cancelled', 'expired']);
/** How long a submitted operation waits for a block before the game calls it slow. */
const SLOW_AFTER_MS = 3 * 60 * 1000;
/** The most characters of a submit error that are kept. */
const SUBMIT_ERROR_LENGTH = 300;

// a list of states as SQL
const sqlList = states => `(${states.map(state => `'${state}'`).join(', ')})`;
/** OPEN as an SQL list, for `state IN ${OPEN_IN}` (players.itemsOf). */
const OPEN_IN = sqlList(OPEN);
/** ENDED as an SQL list, for `state IN ${ENDED_IN}` (lab/salvage.js). */
const ENDED_IN = sqlList(ENDED);
// Postgres's partial unique indexes (migration 014) → OpenOperationError's reason
const OPEN_INDEXES = { chain_ops_one_open_player: 'player', chain_ops_one_open_item: 'item' };

/**
 * An operation cannot be prepared: the player (`reason` 'player') or the item ('item') has an
 * open one already.
 */
class OpenOperationError extends Error {
    constructor(reason) {
        super(`an operation is open for this ${reason}`);
        this.name = 'OpenOperationError';
        this.reason = reason;
    }
}

const BIGINTS = ['ttl_slot', 'included_block', 'ttl_passed_block'];
// a row with its BIGINT columns as Numbers (Postgres sends them as strings, pg-mem as numbers)
const normalized = row => {
    const result = { ...row };
    BIGINTS.forEach(column => {
        result[column] = result[column] === null ? null : Number(result[column]);
    });
    return result;
};

// the Date of `now` (ms); a TypeError for anything else
const timeOf = now => {
    if (typeof now !== 'number' || !Number.isFinite(now)) {
        throw new TypeError('now: a time in milliseconds');
    }
    return new Date(now);
};

// an amount (or the fee asset) as the table stores it: text, null for none
const textOrNull = value => (value === null || value === undefined ? null : String(value));

const one = async (db, sql, params) => {
    const { rows } = await db.query(sql, params);
    return rows.length > 0 ? normalized(rows[0]) : null;
};

/** The open operation of a player, or null. */
const openOf = (db, playerId) => one(db, `SELECT * FROM chain_ops WHERE player_id = $1 AND state IN ${OPEN_IN}`, [playerId]);

/** The open operation of an item, or null. */
const openForItem = (db, itemId) => one(db, `SELECT * FROM chain_ops WHERE item_id = $1 AND state IN ${OPEN_IN}`, [itemId]);

/** The operation `id`, or null. */
const byId = (db, id) => (typeof id === 'string' ? one(db, 'SELECT * FROM chain_ops WHERE id = $1', [id]) : Promise.resolve(null));

/**
 * The operation of the sign code `code` (only its hash is stored), or null; also when the code
 * is used up (the operation was submitted). A cancelled or expired operation keeps its code, so
 * the sign page can say what became of it.
 */
const byCode = (db, code) => (typeof code === 'string' ? one(db, 'SELECT * FROM chain_ops WHERE code_hash = $1', [hashOf(code)]) : Promise.resolve(null));

/**
 * Stores a prepared operation: the row. `fields`: { playerId, itemId, kind ('mint' or 'burn'),
 * subject (the wallet's), ownerKeyHash, ownerAddress (a burn: where the store's ADA and the change
 * go), requiredKeys (the key hashes the wallet signs with),
 * assetName (the user token's), txHash, txCbor (the unsigned transaction exactly as built),
 * ttlSlot (its ttl as built), signUntil (ms), code (the sign code; stored hashed), feeOption (the
 * mint's option; null for a burn, which pays no battlechoc fee), networkFee, gameFeeAsset
 * ('lovelace' or policy hex + asset name hex; null without a fee, always for a burn),
 * gameFee, deposit (both tokens' outputs' ADA), depositUser (of that, the user token's output's;
 * amounts as strings or numbers, stored as text), ownerConfirmed (true: built from addresses a
 * wallet of the player vouched for; default false), now (ms) }. The same
 * transaction (`txHash`) may come again after its operation ended: the build is deterministic.
 *
 * Rejects with an OpenOperationError while the item (reason 'item', asked first) or the player
 * ('player') has an open operation. One process is guarded by the check before the insert, as
 * long as the caller runs it for one player at a time (the routes' `oneAtATime(playerId)`; an
 * item has one owner at a time, its crafter or, once minted, the player the ownership sync gives
 * it to, so two players race for one item at most across the sync's change of its owner, which
 * the item's partial index refuses on Postgres); two API processes on
 * Postgres by the partial unique indexes, whose refusal comes back as the same error. Inside a
 * caller's transaction such a refusal has aborted that transaction: roll it back.
 */
const insertPrepared = async (db, fields) => {
    if (await openForItem(db, fields.itemId)) {
        throw new OpenOperationError('item');
    }
    if (await openOf(db, fields.playerId)) {
        throw new OpenOperationError('player');
    }
    const at = timeOf(fields.now);
    const signUntil = timeOf(fields.signUntil);
    try {
        return await one(
            db,
            `INSERT INTO chain_ops (id, player_id, item_id, kind, state, subject, owner_key_hash, owner_address, required_keys, asset_name, tx_hash,
                tx_cbor, ttl_slot, sign_until, code_hash, fee_option, network_fee, game_fee_asset, game_fee, deposit, deposit_user, created_at, owner_confirmed)
             VALUES ($1, $2, $3, $4, 'prepared', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
             RETURNING *`,
            [
                crypto.randomUUID(),
                fields.playerId,
                fields.itemId,
                fields.kind,
                fields.subject,
                fields.ownerKeyHash,
                fields.ownerAddress,
                JSON.stringify(fields.requiredKeys),
                fields.assetName,
                fields.txHash,
                fields.txCbor,
                fields.ttlSlot,
                signUntil,
                hashOf(fields.code),
                fields.feeOption,
                textOrNull(fields.networkFee),
                textOrNull(fields.gameFeeAsset),
                textOrNull(fields.gameFee),
                textOrNull(fields.deposit),
                textOrNull(fields.depositUser),
                at,
                fields.ownerConfirmed === true,
            ]
        );
    } catch (error) {
        // only the two partial indexes (Postgres): any other refusal (a sign code twice, an empty
        // asset name) is passed on as it is
        if (error.code === '23505' && Object.prototype.hasOwnProperty.call(OPEN_INDEXES, error.constraint)) {
            throw new OpenOperationError(OPEN_INDEXES[error.constraint]);
        }
        throw error;
    }
};

/** Why a prepared operation was cancelled (chain_ops.error), when it was not the player. */
const CANCELLED_BECAUSE = Object.freeze({ WALLET_UNLINKED: 'wallet-unlinked', TOKEN_MOVED: 'token-moved' });

/**
 * prepared → cancelled: the row, or null. `error`: 'cancelled' (default) for the player's own
 * cancel; the server's cancels say why (CANCELLED_BECAUSE: the wallet no longer linked to the
 * operation's player, a burn's token no longer where the burn spends it).
 */
const cancel = async (db, op, now, error = 'cancelled') =>
    one(db, "UPDATE chain_ops SET state = 'cancelled', error = $3, ended_at = $2 WHERE id = $1 AND state = 'prepared' RETURNING *", [op.id, timeOf(now), error]);

/** prepared → expired (`error` 'not-signed') once the sign window is over (`sign_until ≤ now`): the row, or null. */
const expireUnsigned = async (db, op, now) =>
    one(
        db,
        "UPDATE chain_ops SET state = 'expired', error = 'not-signed', ended_at = $2 WHERE id = $1 AND state = 'prepared' AND sign_until <= $2 RETURNING *",
        [op.id, timeOf(now)]
    );

/**
 * The operation `op` (a row, or null) as it stands at `now`: a prepared one whose sign window is
 * over is expired first (expireUnsigned), so a lapsed window holds neither its item nor its
 * player once anyone reads it. The row as the table holds it then; null for null.
 */
const expireLapsed = async (db, op, now) => {
    const at = timeOf(now).getTime();
    if (!op || op.state !== 'prepared' || new Date(op.sign_until).getTime() > at) {
        return op;
    }
    return (await expireUnsigned(db, op, now)) ?? byId(db, op.id);
};

/**
 * prepared → submitted within the sign window (`sign_until > now`), with the co-signed
 * transaction `signedCbor`; the sign code is used up. Only while the operation still holds the
 * transaction `op` names (`op.tx_hash`, the one that was signed): a rebuild meanwhile wins. The
 * row, or null.
 */
const markSubmitted = async (db, op, { signedCbor, now }) =>
    one(
        db,
        `UPDATE chain_ops SET state = 'submitted', signed_cbor = $2, submitted_at = $3, last_submit_at = $3, code_hash = NULL
         WHERE id = $1 AND state = 'prepared' AND sign_until > $3 AND tx_hash = $4 RETURNING *`,
        [op.id, signedCbor, timeOf(now), op.tx_hash]
    );

/**
 * A prepared operation's transaction built again (from the addresses the wallet named): `fields`
 * { ownerKeyHash, ownerAddress, requiredKeys, assetName, txHash, txCbor, ttlSlot, networkFee,
 * gameFeeAsset, gameFee, deposit, depositUser, ownerConfirmed (true: a wallet of the player vouched for the
 * addresses) } replace the old ones, as insertPrepared stores them. Only while
 * it is prepared, within its sign window (`sign_until > now`), and still holds the transaction `op`
 * names (`op.tx_hash`): one compare-and-set, so a signature or another rebuild that won meanwhile
 * keeps what it has. The sign window, the code, the item, the subject and the fee option stay as
 * they are. The row, or null.
 */
const rebuildPrepared = async (db, op, fields, now) =>
    one(
        db,
        `UPDATE chain_ops SET owner_key_hash = $3, owner_address = $4, required_keys = $5, asset_name = $6, tx_hash = $7, tx_cbor = $8,
            ttl_slot = $9, network_fee = $10, game_fee_asset = $11, game_fee = $12, deposit = $13, owner_confirmed = $15, deposit_user = $16
         WHERE id = $1 AND state = 'prepared' AND tx_hash = $2 AND sign_until > $14 RETURNING *`,
        [
            op.id,
            op.tx_hash,
            fields.ownerKeyHash,
            fields.ownerAddress,
            JSON.stringify(fields.requiredKeys),
            fields.assetName,
            fields.txHash,
            fields.txCbor,
            fields.ttlSlot,
            textOrNull(fields.networkFee),
            textOrNull(fields.gameFeeAsset),
            textOrNull(fields.gameFee),
            textOrNull(fields.deposit),
            timeOf(now),
            fields.ownerConfirmed === true,
            textOrNull(fields.depositUser),
        ]
    );

/**
 * submitted → included (in block `blockNo`, a whole number ≥ 0: a TypeError otherwise, before
 * anything is written). For a mint, in the same transaction, the item is marked as the ownership
 * sync would store it with the token at the minting output: its asset name, minted_at, and the
 * holder of the owner's address (holder_subject its stake key, else its payment key; holder_pay
 * its payment key) since `now`. The tip beyond the ttl noted before (ttl_passed_block) is cleared:
 * it was noted on a fork that is gone (the transaction can only appear in a block before its ttl),
 * and an included operation has none. The row, or null.
 */
const markIncluded = async (pool, op, { blockNo, now }) => {
    // without its block an inclusion could never be rolled back or finalised (migration 014 refuses it too)
    if (!Number.isSafeInteger(blockNo) || blockNo < 0) {
        throw new TypeError('blockNo: a block number');
    }
    const at = timeOf(now);
    return withTransaction(pool, async client => {
        const included = await one(
            client,
            "UPDATE chain_ops SET state = 'included', included_block = $2, included_at = $3, ttl_passed_block = NULL WHERE id = $1 AND state = 'submitted' RETURNING *",
            [op.id, blockNo, at]
        );
        if (included && included.kind === 'mint') {
            const holder = holderOf(included.owner_address);
            // asset_name and minted_at in one statement: migration 013's CHECKs hold throughout
            await client.query('UPDATE items SET asset_name = $2, minted_at = $3, holder_subject = $4, holder_pay = $5, holder_since = $3 WHERE id = $1', [
                included.item_id,
                included.asset_name,
                at,
                holder.stake || holder.pay,
                holder.pay,
            ]);
        }
        return included;
    });
};

/**
 * included → submitted (the block was rolled back; the transaction may land again), only while
 * it is included at the block of `op` (`included_block`): a stale copy from before a rollback and
 * a new inclusion by another process names an inclusion that is gone. For a mint,
 * in the same transaction, the item is the minter's plain item again (the ownership sync no
 * longer picks it, whoever it had given it to) and its unseen notices, whoever they are for, are
 * deleted. A rolled-back operation starts without a noted tip beyond the ttl (ttl_passed_block):
 * the watcher notes the current one. The row, or null.
 */
const markRolledBack = (pool, op) =>
    withTransaction(pool, async client => {
        const rolledBack = await one(
            client,
            `UPDATE chain_ops SET state = 'submitted', included_block = NULL, included_at = NULL, ttl_passed_block = NULL
             WHERE id = $1 AND state = 'included' AND included_block = $2 RETURNING *`,
            [op.id, op.included_block]
        );
        if (rolledBack && rolledBack.kind === 'mint') {
            await client.query(
                `UPDATE items SET asset_name = NULL, minted_at = NULL, holder_subject = NULL, holder_pay = NULL, holder_since = NULL, player_id = $2
                 WHERE id = $1`,
                [rolledBack.item_id, rolledBack.player_id]
            );
            await client.query('DELETE FROM item_notices WHERE item_id = $1 AND seen_at IS NULL', [rolledBack.item_id]);
        }
        return rolledBack;
    });

/**
 * included → final (`final_at`, `ended_at`), only while it is included at the block of `op` (the
 * block whose depth the caller judged; see markRolledBack): the row, or null. For a burn it only
 * ends the operation: the ingredients are credited by a step of their own, keyed by the burn on
 * the chain, so a burn made outside the game is credited too (plan E, ruling E20).
 */
const markFinal = async (pool, op, now) => {
    const at = timeOf(now);
    return withTransaction(pool, client =>
        one(
            client,
            "UPDATE chain_ops SET state = 'final', final_at = $2, ended_at = $2 WHERE id = $1 AND state = 'included' AND included_block = $3 RETURNING *",
            [op.id, at, op.included_block]
        )
    );
};

/**
 * submitted → expired: `error` 'rejected' when the network refused the transaction and took no
 * submit of it since (submit_rejected, noteSubmit), else 'expired'; `because` instead when the
 * caller knows more (BURNED_ELSEWHERE: a burn whose token another transaction burned, K_FINAL
 * deep). Only while the noted tip beyond the ttl is still the one of `op` (ttl_passed_block, the
 * one the caller decided from; for a copy without one, none): a clear or a new note by another
 * process meanwhile wins. The row, or
 * null. Only the watcher decides that a submitted transaction can no longer land
 * (operationsStep.js).
 */
const expireSubmitted = async (db, op, now, { because = null } = {}) => {
    const at = timeOf(now);
    const set = "UPDATE chain_ops SET state = 'expired', error = COALESCE($3, CASE WHEN submit_rejected THEN 'rejected' ELSE 'expired' END), ended_at = $2";
    // pg-mem knows no IS NOT DISTINCT FROM: the NULL case on its own
    return op.ttl_passed_block === null || op.ttl_passed_block === undefined
        ? one(db, `${set} WHERE id = $1 AND state = 'submitted' AND ttl_passed_block IS NULL RETURNING *`, [op.id, at, because])
        : one(db, `${set} WHERE id = $1 AND state = 'submitted' AND ttl_passed_block = $4 RETURNING *`, [op.id, at, because, op.ttl_passed_block]);
};

/** Why a submitted burn expired although its token is gone: another transaction burned it (K_FINAL deep). */
const BURNED_ELSEWHERE = 'burned-elsewhere';

/**
 * Notes a submit of a submitted operation at `now` (`last_submit_at`; the watcher resubmits at
 * most once a minute after it). `error`: null when the network accepted the transaction; else what
 * went wrong (a string, or an Error: its message), its first SUBMIT_ERROR_LENGTH characters kept in
 * submit_error for diagnosis. `rejected`: true when the network refused the transaction (the
 * caller's judgement, a ProviderError with the code 'rejected'; never read from `error`'s text;
 * default false). An accepted submit clears submit_error
 * and submit_rejected (the transaction is in a mempool after all); a refusal sets submit_rejected;
 * any other failure (a busy or unreachable provider, a fault) says nothing about the transaction
 * and leaves submit_rejected as it is. No state change. The row, or null when it is no longer
 * submitted.
 */
const noteSubmit = async (db, op, { now, error = null, rejected = false }) => {
    const at = timeOf(now);
    if (error === null) {
        return one(db, "UPDATE chain_ops SET last_submit_at = $2, submit_error = NULL, submit_rejected = FALSE WHERE id = $1 AND state = 'submitted' RETURNING *", [op.id, at]);
    }
    const message = String(error instanceof Error ? error.message : error).slice(0, SUBMIT_ERROR_LENGTH);
    const refused = rejected === true ? ', submit_rejected = TRUE' : '';
    return one(db, `UPDATE chain_ops SET last_submit_at = $2, submit_error = $3${refused} WHERE id = $1 AND state = 'submitted' RETURNING *`, [op.id, at, message]);
};

/**
 * Notes on a submitted operation the first tip beyond its ttl the watcher saw (`blockNo`, a whole
 * number ≥ 0; a TypeError otherwise), or clears it (null: a rollback has the tip before the ttl
 * again, so the transaction could land after all). The row, or null when it is no longer
 * submitted.
 */
const noteTtlPassed = async (db, op, blockNo) => {
    if (blockNo !== null && (!Number.isSafeInteger(blockNo) || blockNo < 0)) {
        throw new TypeError('blockNo: a block number or null');
    }
    return one(db, "UPDATE chain_ops SET ttl_passed_block = $2 WHERE id = $1 AND state = 'submitted' RETURNING *", [op.id, blockNo]);
};

/**
 * Up to `limit` open operations, oldest first (created_at, then id): from the oldest, or after
 * `after` ({ createdAt, id } of the last row of the page before). The rows.
 */
const openOperations = async (db, { after = null, limit }) => {
    const { rows } =
        after === null
            ? await db.query(`SELECT * FROM chain_ops WHERE state IN ${OPEN_IN} ORDER BY created_at, id LIMIT $1`, [limit])
            : await db.query(
                `SELECT * FROM chain_ops WHERE state IN ${OPEN_IN} AND (created_at > $1 OR (created_at = $1 AND id > $2)) ORDER BY created_at, id LIMIT $3`,
                [new Date(after.createdAt), after.id, limit]
            );
    return rows.map(normalized);
};

const POLICY_HEX_LENGTH = 56;

/**
 * The name the game shows for a fee asset (the config datum's `asset`): 'ADA' for 'lovelace', else
 * the asset name as UTF-8 text, or its hex when that is no printable text (the policy id for an
 * empty name).
 */
const feeAssetLabel = asset => {
    if (asset === 'lovelace') {
        return 'ADA';
    }
    const nameHex = asset.slice(POLICY_HEX_LENGTH).toLowerCase();
    const text = Buffer.from(nameHex, 'hex').toString('utf8');
    const printable = text.length > 0 && Buffer.from(text, 'utf8').toString('hex') === nameHex && /^[^\p{C}]+$/u.test(text);
    if (printable) {
        return text;
    }
    return nameHex.length > 0 ? nameHex : asset.slice(0, POLICY_HEX_LENGTH);
};

/**
 * What a player is shown of operation `op` (a row) on `item` ({ item: its key, serial }) at `now`
 * (ms): { id, kind, state, error, itemId, item: { item, serial }, assetName, txHash, subject,
 * signUntil (ISO), costs: { networkFee, gameFee: { asset, label, amount } | null, deposit, deposits:
 * { reference, user } } (amounts as Numbers, lovelace but a token fee's amount), slow (submitted for
 * more than SLOW_AFTER_MS) }. `deposit` is the sum of `deposits`: `reference` stays at the items
 * script with the item's store, `user` goes with the token to the player's own address, so a
 * wallet counts only `reference` as leaving it (ruling D38). Never a transaction or a sign code.
 * `now` (ms) is required: a TypeError without it.
 */
const view = (op, item, now) => {
    const at = timeOf(now).getTime();
    return {
        id: op.id,
        kind: op.kind,
        state: op.state,
        error: op.error,
        itemId: op.item_id,
        item: { item: item.item, serial: Number(item.serial) },
        assetName: op.asset_name,
        txHash: op.tx_hash,
        subject: op.subject,
        signUntil: new Date(op.sign_until).toISOString(),
        costs: {
            networkFee: Number(op.network_fee),
            gameFee: op.game_fee_asset === null ? null : { asset: op.game_fee_asset, label: feeAssetLabel(op.game_fee_asset), amount: Number(op.game_fee) },
            deposit: Number(op.deposit),
            deposits: { reference: Number(op.deposit) - Number(op.deposit_user), user: Number(op.deposit_user) },
        },
        slow: op.state === 'submitted' && at - new Date(op.submitted_at).getTime() > SLOW_AFTER_MS,
        ownerConfirmed: op.owner_confirmed === true,
    };
};

module.exports = {
    OPEN,
    OPEN_IN,
    ENDED,
    ENDED_IN,
    SLOW_AFTER_MS,
    OpenOperationError,
    CANCELLED_BECAUSE,
    BURNED_ELSEWHERE,
    insertPrepared,
    openOf,
    openForItem,
    byId,
    byCode,
    cancel,
    expireUnsigned,
    expireLapsed,
    markSubmitted,
    rebuildPrepared,
    markIncluded,
    markRolledBack,
    markFinal,
    expireSubmitted,
    noteSubmit,
    noteTtlPassed,
    openOperations,
    feeAssetLabel,
    view,
};
