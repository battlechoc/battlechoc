// What the game asks before it lets a player start a mint (spec 4, step 2: the checklist), filled
// from real data before any wallet opens: the matches of the gate, the mints left today, the
// player's wallets with their ADA and whether each can pay, the fee options and the estimate, and
// the operation that is already running. The mint route (Task 3) refuses by the same functions.
//
// The chain may be down: then the answer says `ready: false` and still carries everything the
// game's tables and the parts of the chain that answered could fill. Nothing here is a 5xx because
// the chain is down; a field that could not be read is null.

const { Assets } = require('@evolution-sdk/evolution');
const { Items, chain: rules } = require('@battlechoc/battlechoc-shared-functions');
const players = require('../players');
const { addressOfSubject } = require('../cardano');
const { count } = require('../db');
const { startOfUtcDay } = require('../rewards');
const { ErrorCode } = require('../errors');
const { IndexUnavailableError } = require('./indexUnavailable');
const { ProviderError } = require('./provider');
const { feeOutputsLovelace, fundsCheck, gameFeeOf, gameFeesOf, spendableOf } = require('./tx');
const { isFresh } = require('./watcher');
const ops = require('./ops');

/**
 * The matches that count for the mint gate: the player's verified track records, which only the
 * server writes for a match it hosted (rewards.creditVerifiedMatch: against another player or the
 * server AI, also a challenge). The records the game reports for offline matches are unverified.
 */
const matchesOf = (db, playerId) => count(db, 'SELECT COUNT(*) AS n FROM track_records WHERE player_id = $1 AND verified = TRUE', [playerId]);

/**
 * How many mints the player may still submit today (UTC, at `now` ms): MINTS_PER_DAY less the
 * mints submitted since the day's start that did not expire (a rejected one expired too; a
 * cancelled one was never submitted). Never below 0.
 */
const mintsLeftToday = async (db, playerId, now) => {
    const used = await count(db, "SELECT COUNT(*) AS n FROM chain_ops WHERE player_id = $1 AND kind = 'mint' AND submitted_at >= $2 AND state <> 'expired'", [
        playerId,
        startOfUtcDay(now),
    ]);
    return Math.max(0, rules.MINTS_PER_DAY - used);
};

/** The index of the tier of the item `itemKey` in TIER_ORDER, -1 for an unknown item. */
const tierOf = itemKey => (Object.prototype.hasOwnProperty.call(Items, itemKey) ? rules.TIER_ORDER.indexOf(Items[itemKey].tier) : -1);

/**
 * The fee options of `config` this build can pay, as the game shows them: [{ fee (the option's
 * index in the config, what a mint names), asset, label, amounts (strings, in TIER_ORDER) }]. An
 * amount is what a mint pays the receivers, as the funds check counts it (plan B's
 * feeOutputsLovelace): a receiver's share below the minimum UTxO raised as the build raises it, so
 * it can be more than the config's amount. An option in a token the funds check cannot pay yet
 * (FEE_ASSET_UNSUPPORTED) is left out.
 */
const feeOptionsOf = config =>
    gameFeesOf(config).flatMap(({ asset }, fee) => {
        try {
            const amounts = rules.TIER_ORDER.map((_, tier) => String(feeOutputsLovelace(gameFeeOf(config, { tier, fee }))));
            return [{ fee, asset, label: ops.feeAssetLabel(asset), amounts }];
        } catch (error) {
            if (error.code === 'FEE_ASSET_UNSUPPORTED') {
                return [];
            }
            throw error;
        }
    });

/**
 * The battlechoc fee the estimate counts (gameFeeOf's answer, null for none): of the first option
 * of `options` (feeOptionsOf), for the tier `tier` (an index of TIER_ORDER), or without one (-1)
 * for the tier of that option's largest amount.
 */
const estimatedFeeOf = (config, options, tier) => {
    const [option] = options;
    if (!option) {
        return null;
    }
    const amounts = option.amounts.map(Number);
    const largest = amounts.indexOf(Math.max(...amounts));
    return gameFeeOf(config, { tier: tier === -1 ? largest : tier, fee: option.fee });
};

// The tier of `itemId` when it is the player's item, else -1 (also for another player's, and for
// a burned one, credited to them or not: treated as not given, and nothing of it is told)
const ownTierOf = async (pool, playerId, itemId) => {
    if (itemId === undefined) {
        return -1;
    }
    const { rows } = await pool.query('SELECT item_key, player_id, burned_at FROM items WHERE id = $1', [itemId]);
    return rows.length === 1 && rows[0].player_id === playerId && rows[0].burned_at === null ? tierOf(rows[0].item_key) : -1;
};

// The view of the player's open operation, null without one (a prepared one whose sign window is
// over is expired on this read). Also null when its item is gone by the second read: a salvage
// deletes only an item without an open operation, so the operation ended in between (a cancel in
// another request) and the player has none open now.
const operationOf = async (pool, playerId, now) => {
    const op = await ops.expireLapsed(pool, await ops.openOf(pool, playerId), now);
    if (!op || !ops.OPEN.includes(op.state)) {
        return null;
    }
    const { rows } = await pool.query('SELECT item_key, serial FROM items WHERE id = $1', [op.item_id]);
    return rows.length === 0 ? null : ops.view(op, { item: rows[0].item_key, serial: rows[0].serial }, now);
};

/**
 * Whether the chain index's tip is fresh at `now` (ms, the watcher's rule); false when the index
 * cannot answer, for whatever reason: `onError(error)` hears a failure that is not the index being
 * unavailable (a fault nobody expected).
 */
const indexFresh = async (chain, now, onError = () => {}) => {
    try {
        return isFresh((await chain.index.tip()) ?? null, chain.indexMaxLagMs, now);
    } catch (error) {
        if (!(error instanceof IndexUnavailableError)) {
            onError(error);
        }
        return false;
    }
};

/** How long readiness keeps a wallet's UTxOs (ms), and for how many wallets at most. */
const UTXO_CACHE = Object.freeze({ ttlMs: 20 * 1000, maxEntries: 2000 });

/**
 * Readiness's copy of the provider's `utxosOf` answers, so that a player who asks again and again
 * (the checklist, two tabs, a script) costs the provider one call per wallet in `ttlMs`, not one per
 * request: readiness may spend at most 8 provider calls a request, and the provider's quota is
 * every player's. Keyed by the subject alone: a wallet's UTxOs are public chain data, the same
 * whoever asks, so no player can learn through it what the chain would not tell them (and
 * readiness asks only for the player's own linked wallets). A call in flight is shared; a failure
 * is not kept (the next request asks again); at most `maxEntries` wallets, the oldest dropped
 * first. `get(subject, now)` → the provider's promise; `forget(subject)` drops a wallet's copy
 * (the routes do after a mint of it is built or signed). The mint and the rebuild never read it:
 * they build from a fresh answer. `ttlMs` 0 keeps nothing (the browser tests' server, whose test
 * routes change the chain between two requests).
 */
const createUtxoCache = ({ provider, ttlMs = UTXO_CACHE.ttlMs, maxEntries = UTXO_CACHE.maxEntries }) => {
    const entries = new Map();
    const get = (subject, now) => {
        const entry = entries.get(subject);
        if (entry && now - entry.at < ttlMs) {
            return entry.utxos;
        }
        entries.delete(subject);
        const utxos = provider.utxosOf(subject);
        if (ttlMs > 0) {
            // re-inserted last: the Map's order is the order of age
            entries.set(subject, { at: now, utxos });
            utxos.catch(() => {
                if (entries.get(subject)?.utxos === utxos) {
                    entries.delete(subject);
                }
            });
            while (entries.size > maxEntries) {
                entries.delete(entries.keys().next().value);
            }
        }
        return utxos;
    };
    const forget = subject => {
        entries.delete(subject);
    };
    return { get, forget, size: () => entries.size };
};

// The UTxOs of `subject` (through `cache` when there is one), null when the provider failed
// (`onError` hears a failure that is no ProviderError)
const utxosOrNull = async (chain, subject, onError, cache, now) => {
    try {
        return await (cache ? cache.get(subject, now) : chain.provider.utxosOf(subject));
    } catch (error) {
        if (!(error instanceof ProviderError)) {
            onError(error);
        }
        return null;
    }
};

/** How readiness asks the provider for the wallets: how many, how many at a time, and by when (ms, for all of them). */
const READINESS_FAN_OUT = Object.freeze({ maxWallets: 8, concurrency: 3, deadlineMs: 8000 });

const DEADLINE = Symbol('deadline');

/**
 * `task(item)` (which never rejects) for each of `items`, at most `concurrency` at a time, until
 * `deadlineMs` after the start: the answers in order, null for an item not answered by then (its
 * call is not waited for; none is started after the deadline).
 */
const boundedFanOut = async (items, { concurrency, deadlineMs }, task) => {
    const answers = items.map(() => null);
    let timer;
    let over = false;
    const deadline = new Promise(resolve => {
        timer = setTimeout(() => {
            over = true;
            resolve(DEADLINE);
        }, deadlineMs);
    });
    let next = 0;
    const worker = async () => {
        while (!over && next < items.length) {
            const i = next;
            next += 1;
            const answer = await Promise.race([task(items[i]), deadline]);
            if (answer === DEADLINE) {
                return;
            }
            answers[i] = answer;
        }
    };
    try {
        await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    } finally {
        clearTimeout(timer);
    }
    return answers;
};

/** Whether the config of `contracts` lists the server key `serverKey` (keys.loadKey's; none: no). */
const serverKeyListed = (contracts, serverKey) => Boolean(serverKey) && contracts.config.serverKeys.includes(serverKey.keyHash);

/** The lovelace of `utxos` the funds check counts: only what a transaction may spend (spendableOf). */
const spendableLovelaceOf = utxos => spendableOf(utxos).reduce((sum, utxo) => sum + Assets.lovelaceOf(utxo.assets), 0n);

/**
 * The readiness answer for the player `playerId` (chain features on), for the item `itemId` (a
 * string or undefined). `config()` resolves with plan B's Contracts or rejects (createConfigReader's
 * get); `onConfigError(error)` hears every failure of it that is not CHAIN UNAVAILABLE;
 * `onChainError(error)` a failure of the index or the provider nobody expected (they count as
 * unreadable). `now` in ms. `fanOut`: READINESS_FAN_OUT's fields, for tests. `utxoCache`: a
 * createUtxoCache the wallets' UTxOs are read through (none: the provider is asked every time).
 *
 * { enabled: true, ready, paused, matches: { have, need }, mintsLeftToday, wallets: [{ subject,
 * address, name, asked, lovelace, enough, missing, needed, collateral, waitUntil }], estimate: {
 * networkFee, deposit, needed }, gameFees: [{ fee, asset, label, amounts }], operation }. Amounts
 * are lovelace strings; a fee's amounts are what a mint pays (feeOptionsOf).
 *
 * The provider is asked for at most `maxWallets` of the player's wallets, the most recently linked
 * first, `concurrency` at a time, all under one deadline of `deadlineMs`; `asked` says whether a
 * wallet was (the others have `lovelace` and what follows from it null). A player who linked many
 * keys so costs the provider no more than this.
 *
 * `ready`: the index is fresh, the config was read and lists the server's key (chain.serverKey),
 * it has no fee options or one this build can pay, and every asked wallet's UTxOs were read in
 * time (a wallet that was not asked does not count). `paused`: the config's pause (false when it
 * could not be read; `ready` is false then). A wallet's `lovelace` is what the funds check can
 * spend of it (not a listing at a script address under its stake key, not an output with a datum
 * or a script). Unknown parts are null: `lovelace` (and with it `enough`, `missing`, `needed`,
 * `collateral`) of a wallet not asked or whose UTxOs could not be read in time; `gameFees`,
 * `estimate.needed` and every wallet's `enough`, `missing`, `needed`, `collateral` without the
 * config. A config whose fee options this build can pay none of has `gameFees: []` but no numbers
 * without the fee: `estimate.needed` and each wallet's `enough`, `missing`, `needed` are null
 * (`[]` with numbers means no fee).
 */
const readinessOf = async ({ pool, chain, config, onConfigError = () => {}, onChainError = () => {}, playerId, itemId, now, fanOut = {}, utxoCache = null }) => {
    const bounds = { ...READINESS_FAN_OUT, ...fanOut };
    const identities = await players.identitiesOf(pool, playerId, { now });
    // the most recently linked first (identitiesOf answers the oldest first)
    const asked = identities.map((identity, i) => i).slice(-bounds.maxWallets).reverse();
    const [have, mintsLeft, operation, tier, fresh, contracts, askedUtxos] = await Promise.all([
        matchesOf(pool, playerId),
        mintsLeftToday(pool, playerId, now),
        operationOf(pool, playerId, now),
        ownTierOf(pool, playerId, itemId),
        indexFresh(chain, now, onChainError),
        config().catch(error => {
            if (error.code !== ErrorCode.CHAIN_UNAVAILABLE) {
                onConfigError(error);
            }
            return null;
        }),
        boundedFanOut(asked, bounds, i => utxosOrNull(chain, identities[i].subject, onChainError, utxoCache, now)),
    ]);
    const walletUtxos = identities.map(() => null);
    asked.forEach((i, k) => {
        walletUtxos[i] = askedUtxos[k];
    });
    const gameFees = contracts ? feeOptionsOf(contracts.config) : null;
    // options, but none this build can pay: every mint would be refused, so no numbers without the fee
    const unpayable = contracts !== null && contracts.config.fees.length > 0 && gameFees.length === 0;
    const gameFee = contracts ? estimatedFeeOf(contracts.config, gameFees, tier) : null;
    const wallets = identities.map(({ subject, wallet, waitUntil }, i) => {
        const utxos = walletUtxos[i];
        const funds = utxos && contracts ? fundsCheck({ utxos, kind: 'mint', gameFee }) : null;
        const priced = funds && !unpayable;
        return {
            subject,
            address: addressOfSubject(subject, chain.network),
            name: wallet,
            asked: asked.includes(i),
            lovelace: utxos ? spendableLovelaceOf(utxos).toString() : null,
            enough: priced ? funds.enough : null,
            missing: priced ? String(funds.missing) : null,
            needed: priced ? String(funds.needed) : null,
            collateral: funds ? funds.collateral : null,
            waitUntil,
        };
    });
    return {
        enabled: true,
        ready: fresh && contracts !== null && serverKeyListed(contracts, chain.serverKey) && !unpayable && askedUtxos.every(utxos => utxos !== null),
        paused: contracts ? contracts.config.paused : false,
        matches: { have, need: rules.MINT_MIN_ONLINE_MATCHES },
        mintsLeftToday: mintsLeft,
        wallets,
        estimate: {
            networkFee: String(rules.MINT_NETWORK_FEE_ESTIMATE_LOVELACE),
            deposit: String(rules.MINT_DEPOSIT_ESTIMATE_LOVELACE),
            needed: contracts && !unpayable ? String(fundsCheck({ utxos: [], kind: 'mint', gameFee }).needed) : null,
        },
        gameFees,
        operation,
    };
};

module.exports = {
    READINESS_FAN_OUT,
    UTXO_CACHE,
    createUtxoCache,
    matchesOf,
    mintsLeftToday,
    tierOf,
    feeOptionsOf,
    estimatedFeeOf,
    indexFresh,
    serverKeyListed,
    spendableLovelaceOf,
    readinessOf,
};
