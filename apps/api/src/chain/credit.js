// The credit of a burned item (spec 3, 6.2; plan E): a watcher step after the ownership sync.
// Once the burn of a minted item's user token is K_FINAL deep (tip − block ≥ chain.kFinal, plan D's
// one rule of depth) and the provider no longer sees the token, the item is closed for good and its
// ingredients go to the player the key that held the token is linked to WHEN THE CREDIT IS MADE
// (by the hop-wait rule; a key unlinked between the burn and the credit credits nobody): the
// current recipe's salvageReturns for a minted item (rare and legendary ingredients in full, the
// others half), fresh. Keyed by the burn on chain (chain.item_burns through index.burnsOf), never by an
// operation: a burn the game prepared and one made outside the game in any wallet count the same,
// and plan D's markFinal of a burn credits nothing.
//
// Who is credited (plan C's rules, as the ownership sync decides an owner): the holder is the
// address of the output the burn spent; a script holds nothing; else its stake key, else its
// payment key, is linked to a player now (hopWait.linkedPlayers):
// - linked to nobody: closed, credited to nobody (salvage_credits.player_id null);
// - linked to a player whose hop wait for that key is not over: waiting, nothing is written, the
//   next run asks again;
// - else credited to that player.
// The player whose item it was until then (items.player_id: the sync leaves a burning item with its
// player) and who is not the one credited gets a 'departed' notice in the same transaction, as for
// a token that left (a token moved to another player and burned by them, a key unlinked before the
// credit); the one credited gets the 'salvaged' notice. Nobody gets both.
//
// Exactly once. The credit is irreversible (ingredients in a pantry, the item closed), so:
// - it is never made on the index alone (ruling D43): the provider must answer that the user token
//   is held by nobody. Held → no credit and a lasting error line (the index shows a burn the chain
//   does not have, or the token was minted again: the items validator names a token after the
//   output its mint spends, so a name can never be minted twice, and the server mints no item twice);
//   no answer (a ProviderError) → no credit this run and no more asks this run, the next run tries
//   again;
// - one transaction per item: the item is closed by a guarded UPDATE (`burned_at IS NULL`; a second
//   process waits for the row and then matches nothing), then the credit's row (primary key: the
//   burn and the token; unique: the token, once ever), the pantry, the equipment and the notice.
//   A failure anywhere rolls all of it back and the next run tries again;
// - before K_FINAL nothing irreversible is written (items.burn_tx is the sync's derived state), so
//   a rollback, or the same burn landing again in another block or with another hash, only moves
//   the depth the credit waits for.
// A closed item's row keeps no wallet key: the holder columns are cleared with the close (nothing
// reads a burned row's holder), and the credit's row stores none either (who held the token is on
// the chain, from its tx_hash). The item's row keeps asset_name, minted_at, burned_at, burn_tx and
// the player credited (null for nobody).
// The current recipe table decides, as for plain salvage (an item whose recipe is gone is closed
// with nothing: {}). Log lines name asset names and transaction hashes, never a player.

const { salvageReturns } = require('@battlechoc/battlechoc-shared-functions');
const { withTransaction } = require('../db');
const pantry = require('../pantry');
const players = require('../players');
const { BATCH, candidates, playersOf } = require('./ownership');
const { buildingOf, noticeChange, noticeSalvaged } = require('./notices');
const { ProviderError } = require('./provider');
const { subjectsOfKeys } = require('./addresses');
const { lastingLog, reasonOf } = require('./lastingLog');

// the most characters of a failure's reason in a log line
const MAX_REASON = 300;

/**
 * The subjects of a burn's `holder` (index.burnsOf's { stake, payment, script }): { stake, pay } as
 * addresses.holderOf gives them ('stake:…' / 'pay:…'), both null for a script.
 */
const subjectsOf = holder => subjectsOfKeys(holder);

/**
 * Who gets the burn of a token the subjects `{ stake, pay }` held (pure): { kind: 'credited',
 * playerId } | { kind: 'waiting' } | { kind: 'closed' }. `players`: linkedPlayers' Map subject →
 * { playerId, waitUntil }; the stake key's player first, else the payment key's (decideOwner's rule).
 */
const beneficiaryOf = ({ stake, pay }, players, now) => {
    const link = (stake && players.get(stake)) || (pay && players.get(pay)) || null;
    if (!link) {
        return { kind: 'closed' };
    }
    if (link.waitUntil !== null && link.waitUntil > now) {
        return { kind: 'waiting' };
    }
    return { kind: 'credited', playerId: link.playerId };
};

// takes `itemId` out of the slots of `playerId` (the row locked): the entity type whose slot held
// it, null when none did (nothing written then)
const takeOutOfSlots = async (client, playerId, itemId) => {
    const { rows: owners } = await client.query('SELECT equipment FROM players WHERE id = $1 FOR UPDATE', [playerId]);
    const equipment = players.equipmentOf(owners[0] ?? {});
    const building = buildingOf(equipment, itemId);
    if (building !== null) {
        await client.query('UPDATE players SET equipment = $1 WHERE id = $2', [JSON.stringify(players.equipmentWithout(equipment, itemId)), playerId]);
    }
    return building;
};

/**
 * Closes the item of `burn` ({ assetName, txHash }) in one transaction: for `playerId` (null:
 * nobody) with the returns of its current recipe in `recipes`. The returned ingredients ({} without
 * a recipe; null for nobody), or undefined when the item was closed already (another process, or
 * a run before this one): then nothing is written. The item's row is locked first (a second
 * process waits for it and then finds it closed), so the player it belonged to is read in the
 * same transaction; the close itself stays guarded.
 */
const closeItem = (pool, { burn, playerId, recipes, now }) =>
    withTransaction(pool, async client => {
        const at = new Date(now);
        const { rows: open } = await client.query('SELECT id, item_key, player_id FROM items WHERE asset_name = $1 AND burned_at IS NULL FOR UPDATE', [burn.assetName]);
        if (open.length === 0) {
            return undefined;
        }
        const [item] = open;
        const { rows: closed } = await client.query('UPDATE items SET burned_at = $2, player_id = $3, burn_tx = $4, holder_subject = NULL, holder_pay = NULL, holder_since = NULL WHERE id = $1 AND burned_at IS NULL RETURNING id', [
            item.id,
            at,
            playerId,
            burn.txHash,
        ]);
        if (closed.length === 0) {
            return undefined;
        }
        const recipe = playerId === null ? null : recipes.get(item.item_key);
        const returned = playerId === null ? null : recipe ? salvageReturns(recipe.amounts, { minted: true }) : {};
        await client.query('INSERT INTO salvage_credits (tx_hash, asset_name, player_id, returned, credited_at) VALUES ($1, $2, $3, $4, $5)', [
            burn.txHash,
            burn.assetName,
            playerId,
            returned === null ? null : JSON.stringify(returned),
            at,
        ]);
        const previous = item.player_id;
        if (previous !== null && previous !== playerId) {
            const left = await takeOutOfSlots(client, previous, item.id);
            await noticeChange(client, { item: { id: item.id }, from: previous, to: null, holderMoved: true, building: left, now });
        }
        if (playerId === null) {
            return null;
        }
        const building = await takeOutOfSlots(client, playerId, item.id);
        await pantry.add(
            client,
            playerId,
            Object.entries(returned).map(([ingredient, amount]) => ({ ingredient, amount })),
            now
        );
        await noticeSalvaged(client, { playerId, itemId: item.id, building, now });
        return returned;
    });

/**
 * The watcher step: { credited, closed, waiting, held, unanswered, failed, skipped }.
 * - `credited`: [{ assetName, txHash, playerId, returned }], the items closed for a player this run;
 * - `closed`: the asset names of the items closed for nobody (the holder is no player);
 * - `waiting`: those deep enough whose holder's hop wait for its player is not over;
 * - `held`: those deep enough whose user token the provider still sees (no credit);
 * - `unanswered`: those deep enough the provider could not be asked about this run;
 * - `failed`: the items whose transaction failed (logged; the next run tries again);
 * - `skipped`: 'index-stale' when the index is not fresh (nothing is read or written), else null.
 * Every list by asset name. Context as the watcher gives it (`now` a function, read once; `chain`
 * with `index`, `provider`, `policyId`, `kFinal`), plus `recipes` (lab/recipes.js's book) and
 * `batchSize` (the items per page, BATCH). An index that cannot answer (IndexUnavailableError)
 * ends the run: the watcher logs it.
 */
const creditBurns = async ({ pool, chain, recipes, now, tip, fresh, log = console, memory = {}, batchSize = BATCH }) => {
    const result = { credited: [], closed: [], waiting: [], held: [], unanswered: [], failed: 0, skipped: null };
    if (!fresh) {
        return { ...result, skipped: 'index-stale' };
    }
    const at = now();
    const heldBurns = [];
    let providerSilent = false;
    let firstFailure = null;

    // whether the provider sees the user token of `assetName` ('held', 'none'), or cannot say
    // ('unknown'; also without asking once it gave no answer this run)
    const tokenOnChain = async assetName => {
        if (providerSilent) {
            return 'unknown';
        }
        try {
            return (await chain.provider.utxoByUnit(chain.policyId + assetName)) === undefined ? 'none' : 'held';
        } catch (error) {
            if (error instanceof ProviderError) {
                providerSilent = true;
                return 'unknown';
            }
            throw error;
        }
    };

    let after = null;
    for (;;) {
        const rows = await candidates(pool, after, batchSize);
        if (rows.length === 0) {
            break;
        }
        after = rows[rows.length - 1].asset_name;
        // the first burn of each token (burnsOf answers by block): a token is burned once
        const burns = new Map();
        (await chain.index.burnsOf(rows.map(row => row.asset_name))).forEach(burn => {
            if (!burns.has(burn.assetName)) {
                burns.set(burn.assetName, burn);
            }
        });
        const ready = [...burns.values()].filter(burn => tip.blockNo - burn.block >= chain.kFinal).sort((a, b) => (a.assetName < b.assetName ? -1 : 1));
        const subjects = ready.flatMap(burn => Object.values(subjectsOf(burn.holder))).filter(subject => subject !== null);
        const linked = ready.length === 0 ? new Map() : await playersOf(pool, subjects, at);
        for (const burn of ready) {
            const holder = subjectsOf(burn.holder);
            const beneficiary = beneficiaryOf(holder, linked, at);
            if (beneficiary.kind === 'waiting') {
                result.waiting.push(burn.assetName);
                continue;
            }
            try {
                const token = await tokenOnChain(burn.assetName);
                if (token === 'unknown') {
                    result.unanswered.push(burn.assetName);
                    continue;
                }
                if (token === 'held') {
                    result.held.push(burn.assetName);
                    heldBurns.push({ assetName: burn.assetName, txHash: burn.txHash, unit: chain.policyId + burn.assetName });
                    continue;
                }
                const playerId = beneficiary.kind === 'credited' ? beneficiary.playerId : null;
                const returned = await closeItem(pool, { burn, playerId, recipes, now: at });
                if (returned === undefined) {
                    continue;
                }
                if (playerId === null) {
                    result.closed.push(burn.assetName);
                    log.info(`watcher: credit: ${burn.assetName} closed, its holder is no player (burn ${burn.txHash})`);
                } else {
                    result.credited.push({ assetName: burn.assetName, txHash: burn.txHash, playerId, returned });
                    log.info(`watcher: credit: ${burn.assetName} credited (burn ${burn.txHash})`);
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

    const lasting = lastingLog(memory);
    if (heldBurns.length > 0) {
        lasting.report('held', heldBurns.map(burn => `${burn.assetName}@${burn.txHash}`).join(' '), () =>
            log.error('watcher: credit: the index shows burns of tokens the provider still sees: no credit until it does not; check the index', { burns: heldBurns })
        );
    } else if (result.unanswered.length === 0) {
        lasting.clear('held', () => log.info('watcher: credit: the provider no longer sees any token the index shows burned'));
    }
    if (result.failed > 0) {
        const reason = reasonOf(firstFailure, MAX_REASON);
        lasting.report('failed', `${result.failed}: ${reason}`, () =>
            log.error(`watcher: credit: ${result.failed} burned items could not be credited, the next run tries again`, { reason })
        );
    } else {
        lasting.clear('failed', () => log.info('watcher: credit: no burned item fails any more'));
    }
    return result;
};

/** The watcher step `credit` over the recipe book `recipes` (lab/recipes.js), which plain salvage reads too. */
const createCreditStep = ({ recipes } = {}) => {
    if (!recipes || typeof recipes.get !== 'function') {
        throw new TypeError('createCreditStep: the recipe book (lab/recipes.js)');
    }
    return Object.freeze({ name: 'credit', run: context => creditBurns({ ...context, recipes }) });
};

module.exports = { beneficiaryOf, createCreditStep, creditBurns, subjectsOf };
