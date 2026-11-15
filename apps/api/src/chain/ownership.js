// The ownership sync (spec 6.2): a minted item belongs, in the game, to the player whose linked
// wallet holds its user token on the chain. A watcher step: at each run it derives, for every
// minted and unburned item, who holds the token now, writes the derived columns (items.player_id,
// holder_subject, holder_pay, holder_since) where they differ, and the notices. It writes nothing else; above
// all never players.equipment: the slot of an item that left keeps its id (loadoutOf skips items
// the player does not have), so the item is back in its slot when it returns. Derived on every
// run, a rollback corrects itself on the next one.
//
// It acts only on a fresh index, and only where the index accounts for the item: it knows the
// token's mint (a fresh index that was started with another policy, or from a slot after the mint,
// holds no output of that token), exactly one unspent output holds the token, or none does and the
// index knows a burn of it. Otherwise "nobody holds it" could come from an index that lacks an
// output (a filter that kept none, a half-written block, a spend a rollback did not undo) and take
// the item from its player; two holders of one NFT mean the index lost a spend. Such an item is left
// as it is and counted `unknown`.

const { withTransaction } = require('../db');
const { MAX_SUBJECTS, linkedPlayers } = require('./hopWait');
const { buildingOf, noticeChange } = require('./notices');
const { lastingLog, messageOf } = require('./lastingLog');

/** Items per batch (the default): the most asset names one call of the index takes. */
const BATCH = 500;

/**
 * Who owns an item now (pure): { playerId, holderSubject, holderPay }. `holderPay` is the holder's
 * payment key (`holder.pay`), null without a holder or for a script address: with holderSubject it
 * says which of a player's keys makes them the owner (the identities' item counts).
 * - `holder` (the index's row of the unspent output holding the token: { stake, pay, blockNo }) absent:
 *   burned → nobody, and no holder (the sync asks only when the index knows the burn);
 * - the holder is `holder.stake`, else `holder.pay` (both null for a script address: nobody);
 * - the candidate is the player `players` (Map subject → { playerId, waitUntil }, linkedPlayers)
 *   links to the stake key, else to the payment key; nobody while that link's hop wait runs
 *   (`waitUntil > now`);
 * - depth (`tipBlockNo − holder.blockNo`) ≥ 1: the candidate; depth 0: the candidate only if it is
 *   `current` (a move between a player's own keys never leaves them), else nobody: a departure
 *   counts at once, an arrival one block later.
 */
const decideOwner = ({ current, holder, tipBlockNo, players, now }) => {
    if (!holder) {
        return { playerId: null, holderSubject: null, holderPay: null };
    }
    const holderSubject = holder.stake || holder.pay || null;
    const link = (holder.stake && players.get(holder.stake)) || (holder.pay && players.get(holder.pay)) || null;
    const candidate = link && !(link.waitUntil !== null && link.waitUntil > now) ? link.playerId : null;
    const depth = tipBlockNo - holder.blockNo;
    const playerId = depth >= 1 || candidate === current ? candidate : null;
    return { playerId, holderSubject, holderPay: holder.pay || null };
};

/**
 * Up to `limit` (BATCH) minted, unburned items whose asset name comes after `after` (null: from the
 * start), by asset name. One statement for every page: `asset_name > $1` (from '': an asset name
 * is never empty, a CHECK of migration 013 on Postgres) also leaves out a NULL name. No
 * `asset_name IS NOT NULL` beside it: pg-mem, which every API and browser test runs on, then
 * answers no page after the first (test: "page after page").
 */
const candidates = async (pool, after, limit = BATCH) => {
    const { rows } = await pool.query(
        `SELECT id, player_id, asset_name, holder_subject, holder_pay, holder_since FROM items
         WHERE minted_at IS NOT NULL AND burned_at IS NULL AND asset_name > $1 ORDER BY asset_name LIMIT $2`, [after === null ? '' : after, limit]);
    return rows;
};

// the players of `subjects`, in calls of at most MAX_SUBJECTS
const playersOf = async (pool, subjects, now) => {
    const all = [...new Set(subjects)];
    const players = new Map();
    for (let start = 0; start < all.length; start += MAX_SUBJECTS) {
        (await linkedPlayers(pool, all.slice(start, start + MAX_SUBJECTS), now)).forEach((value, subject) => players.set(subject, value));
    }
    return players;
};

// `column` is `value` (IS NULL for null; pg-mem knows no IS NOT DISTINCT FROM): the condition, `params` extended
const sameAs = (column, value, params) => {
    if (value === null) {
        return `${column} IS NULL`;
    }
    params.push(value);
    return `${column} = $${params.length}`;
};

/**
 * Moves `row` to `decided` in one transaction: the guarded update (a row changed since it was read,
 * by a player's request, the mint's or the burn's steps or a second server, matches nothing and is
 * left for the next run) and its notices. Whether it changed the row. The holder moved when
 * holder_subject or holder_pay changes: a token that goes to another payment key under the same
 * stake key has moved (it leaves a player who owns it only through the old payment key), and
 * holder_since starts again; a move between one player's own keys writes no notice (from === to).
 * holder_pay is not part of the guard: only this sync writes it, always together with
 * holder_subject and from the same holder, so a concurrent write of it is the same value or one the
 * next run corrects.
 */
const move = (pool, { row, decided, now }) =>
    withTransaction(pool, async client => {
        const holderMoved = decided.holderSubject !== row.holder_subject || decided.holderPay !== row.holder_pay;
        const since = holderMoved ? new Date(now) : row.holder_since;
        const params = [row.id, decided.playerId, decided.holderSubject, since, row.asset_name, decided.holderPay];
        const guards = [sameAs('player_id', row.player_id, params), sameAs('holder_subject', row.holder_subject, params)];
        const { rows } = await client.query(
            `UPDATE items SET player_id = $2, holder_subject = $3, holder_since = $4, holder_pay = $6
             WHERE id = $1 AND asset_name = $5 AND minted_at IS NOT NULL AND burned_at IS NULL AND ${guards.join(' AND ')}
             RETURNING id`,
            params
        );
        if (rows.length === 0) {
            return false;
        }
        const from = row.player_id;
        const to = decided.playerId;
        let building = null;
        if (from !== null && to !== from && holderMoved) {
            const { rows: owners } = await client.query('SELECT equipment FROM players WHERE id = $1', [from]);
            building = owners.length > 0 ? buildingOf(owners[0].equipment, row.id) : null;
        }
        await noticeChange(client, { item: { id: row.id }, from, to, holderMoved, building, now });
        return true;
    });

/**
 * Whether the index accounts for the item `name`, given its `events` (eventsAmong) and the rows of
 * the unspent outputs that hold its token (`held`): its mint is known, and exactly one output holds
 * the token, or none does and its burn is known.
 */
const accountedFor = (name, events, held) => events.minted.has(name) && (held.length === 1 || (held.length === 0 && events.burned.has(name)));

/**
 * The watcher step: { checked, changed, unknown, failed, skipped }. `checked`: the minted, unburned
 * items it looked at; `changed`: those it moved (or whose holder it updated); `unknown`: those it
 * left alone because the index does not account for them (accountedFor); `failed`: those whose
 * transaction failed (logged, the others go on); `skipped`: 'index-stale' when the index is not
 * fresh (nothing is read or written then), else null. A failure of the index itself
 * (IndexUnavailableError) ends the run: the watcher logs it. `now` is the watcher's clock (a
 * function), `memory` the step's own (watcher.js) for its lasting log lines, `batchSize` the items
 * per page (BATCH).
 */
const syncOwnership = async ({ pool, chain, now, tip, fresh, log = console, memory = {}, batchSize = BATCH }) => {
    const result = { checked: 0, changed: 0, unknown: 0, failed: 0, skipped: null };
    if (!fresh) {
        return { ...result, skipped: 'index-stale' };
    }
    const at = now();
    let firstFailure = null;
    let after = null;
    for (;;) {
        const rows = await candidates(pool, after, batchSize);
        if (rows.length === 0) {
            break;
        }
        after = rows[rows.length - 1].asset_name;
        const names = rows.map(row => row.asset_name);
        const events = await chain.index.eventsAmong(names);
        const holders = new Map(names.map(name => [name, []]));
        (await chain.index.holdersOf(names)).forEach(holder => holders.get(holder.assetName)?.push(holder));
        const subjects = [...holders.values()].flat().flatMap(holder => [holder.stake, holder.pay]).filter(subject => subject !== null);
        const players = await playersOf(pool, subjects, at);
        for (const row of rows) {
            result.checked += 1;
            const held = holders.get(row.asset_name);
            if (!accountedFor(row.asset_name, events, held)) {
                result.unknown += 1;
                continue;
            }
            const decided = decideOwner({
                current: row.player_id,
                holder: held[0],
                tipBlockNo: tip.blockNo,
                players,
                now: at,
            });
            if (decided.playerId === row.player_id && decided.holderSubject === row.holder_subject && decided.holderPay === row.holder_pay) {
                continue;
            }
            try {
                if (await move(pool, { row, decided, now: at })) {
                    result.changed += 1;
                }
            } catch (error) {
                result.failed += 1;
                firstFailure = firstFailure || error;
            }
        }
        if (rows.length < batchSize) {
            break;
        }
    }
    if (result.changed > 0) {
        log.info(`watcher: ownership: ${result.changed} of ${result.checked} minted items changed holder`);
    }
    const lasting = lastingLog(memory);
    if (result.unknown > 0) {
        lasting.report('unknown', String(result.unknown), () =>
            log.warn(
                `watcher: ownership: ${result.unknown} of ${result.checked} minted items left as they are, the chain index does not account for their token (no mint known, no output and no burn known, or more than one output)`
            )
        );
    } else {
        lasting.clear('unknown', () => log.info('watcher: ownership: the chain index accounts for every minted item again'));
    }
    if (result.failed > 0) {
        lasting.report('failed', `${result.failed}: ${messageOf(firstFailure)}`, () =>
            log.error(`watcher: ownership: ${result.failed} of ${result.checked} minted items failed, the next run tries again`, firstFailure)
        );
    } else {
        lasting.clear('failed', () => log.info('watcher: ownership: no item fails any more'));
    }
    return result;
};

const ownershipStep = Object.freeze({ name: 'ownership', run: syncOwnership });

module.exports = { BATCH, candidates, decideOwner, ownershipStep, syncOwnership };
