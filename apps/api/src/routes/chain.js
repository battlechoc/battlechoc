// The items on the chain (minting plan D, spec 6.2): what a player needs before minting, preparing
// a mint, signing it, and the player's operations. Always registered: with the chain features off,
// GET /chain/readiness says so ({ enabled: false }, also without a session) and every other path
// under /chain/ is 404 CHAIN OFF for every method, without asking the provider, the index or the
// config. GET /chain/status (registerChainStatus) says whether they are on, either way. With them
// on, the routes need the player's session (but for the sign routes) and never answer a 5xx
// because the chain is down but 503 CHAIN UNAVAILABLE.
//
// A mint is prepared here (POST /chain/mint): every check, the unsigned transaction built with
// plan B's buildMint from the player's wallet, the item locked by a prepared operation, a sign
// code handed out once. It is signed through GET and POST /chain/sign/:code, the only routes
// without a session (the game with a browser wallet and the sign page in a phone wallet's browser
// both use them; the sign code names the operation): the wallet's witness set is checked against
// the stored transaction, the server signs last, the operation moves to submitted, and only then
// does the transaction go to the network. No answer of these routes carries a transaction but the
// unsigned one, which is what the wallet signs; the co-signed one is stored for the watcher and
// never answered or logged.

const express = require('express');
const { chain: rules } = require('@battlechoc/battlechoc-shared-functions');
const { HttpError, ErrorCode, chainError } = require('../errors');
const { fixedWindowLimit } = require('../limits');
const { lastingLog, messageOf, reasonOf: failureReasonOf } = require('../chain/lastingLog');
const { readinessOf, matchesOf, mintsLeftToday, tierOf, feeOptionsOf, indexFresh, serverKeyListed, spendableLovelaceOf, createUtxoCache, UTXO_CACHE } = require('../chain/readiness');
const { linkedPlayers } = require('../chain/hopWait');
const { ProviderError } = require('../chain/provider');
const { IndexUnavailableError } = require('../chain/indexUnavailable');
const { SIGN_CODE, newSignCode } = require('../chain/signCodes');
const { WalletAddressError, walletAddressesOf, ownAddressesOf, utxosAtWallet, addressesPayloadOf, checkAddressesProof } = require('../chain/walletAddresses');
// called through the module, so a test can stand in for one of plan B's functions
const tx = require('../chain/tx');
const ops = require('../chain/ops');

// an id of the request (an item, a subject, an operation): a non-empty text of at most this many
// characters (item ids are UUIDs or `<ITEM>-<n>`, subjects 'stake:' or 'pay:' and 56 hex digits)
const MAX_ID_LENGTH = 128;
const isId = value => typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH;
// the most characters of a reason logged
const MAX_LOGGED_REASON = 500;
// the wallet's witness set (CIP-30 signTx(tx, true)): hex of at most this many characters (a few
// vkey witnesses are some 200 each), and the body of POST /chain/sign/:code at most this many bytes
const MAX_WITNESS_LENGTH = 16 * 1024;
const MAX_SIGN_BODY_BYTES = MAX_WITNESS_LENGTH + 1024;
const HEX = /^(?:[0-9a-fA-F]{2})+$/;

const badRequest = () => new HttpError(400, ErrorCode.INVALID_REQUEST_PARAMETERS);

const itemIdOf = query => {
    const { itemId } = query;
    if (itemId === undefined || itemId === '') {
        return undefined;
    }
    if (typeof itemId !== 'string' || itemId.length > MAX_ID_LENGTH) {
        throw badRequest();
    }
    return itemId;
};

// the addresses a wallet names as its own (walletAddresses.js), as a request gives them; INVALID
// REQUEST PARAMETERS for a list that is none
const walletOf = (addresses, network) => {
    try {
        return walletAddressesOf(addresses, network);
    } catch (error) {
        throw error instanceof WalletAddressError ? badRequest() : error;
    }
};

// POST /chain/mint's body: { itemId, subject, fee (the option's index in the config), addresses?
// (the wallet's own, hex: the build uses the UTxOs at those alone; null without them) }
const mintRequestOf = (body, network) => {
    const { itemId, subject, fee, addresses } = body || {};
    if (!isId(itemId) || !isId(subject) || !Number.isSafeInteger(fee)) {
        throw badRequest();
    }
    return { itemId, subject, fee, wallet: addresses === undefined ? null : walletOf(addresses, network) };
};

// POST /chain/sign/:code's body: { witness }
const witnessOf = body => {
    const { witness } = body || {};
    if (typeof witness !== 'string' || witness.length > MAX_WITNESS_LENGTH || !HEX.test(witness)) {
        throw badRequest();
    }
    return witness;
};

/**
 * What a body the parser refused becomes on the routes without a session: broken JSON stays
 * INVALID JSON (the app's answer); any other refusal below 500 (too large, an unknown charset or
 * encoding, an aborted or short body) is INVALID REQUEST PARAMETERS, so none reaches the generic
 * handler's 500 and its log of the whole error. Undefined for no error; a 5xx as it is.
 */
const sessionlessBodyError = error => {
    if (!error || error.type === 'entity.parse.failed') {
        return error;
    }
    const status = error.status ?? error.statusCode;
    return Number.isInteger(status) && status < 500 ? badRequest() : error;
};

/**
 * The body parser of the sign routes (/chain/sign/*, no session), which app.js puts before its own
 * when the chain features are on: their body is bounded before it is read, and what the parser
 * refuses is a 400 (sessionlessBodyError).
 */
const sessionlessBodyParser = () => {
    const parse = express.json({ limit: MAX_SIGN_BODY_BYTES });
    return (req, res, next) => parse(req, res, error => next(sessionlessBodyError(error)));
};

// verifyWitness's refusals that mean the stored row is corrupt, not that the wallet signed wrong
const CORRUPT_ROW = ['BODY_CHANGED', 'BAD_REQUIRED_WITNESSES'];

// plan B's refusals that are the player's to fix, and what they answer
const PLAYER_REFUSALS = {
    NO_COLLATERAL: ErrorCode.NO_COLLATERAL,
    TOO_MANY_TOKENS: ErrorCode.WALLET_TOO_FULL,
    TX_TOO_LARGE: ErrorCode.WALLET_TOO_FULL,
    PAUSED: ErrorCode.CHAIN_PAUSED,
    NO_SUCH_FEE: ErrorCode.UNKNOWN_FEE,
    FEE_ASSET_UNSUPPORTED: ErrorCode.UNKNOWN_FEE,
};

// what a failure says in the log (lastingLog.js reasonOf): its code and its reason, without bytes and never long
const reasonOf = error => failureReasonOf(error, MAX_LOGGED_REASON);

/**
 * `chain`: createChain's (enabled or not); `config`: the config reader (chain/config.js) when it is
 * on; `user`: the middlewares of a player's route; `limit`: the rate limit (per address) of the sign
 * routes (/chain/sign/*), which have no session, theirs alone; `sessionLimit`: the looser one per
 * address in front of the routes with a session, which are then limited per player:
 * `playerPerMinute` requests a minute, one bucket for all of them; `mintsPerMinute`: what one
 * player may send to POST /chain/mint in a minute besides (each mint asks the provider and builds, a
 * refused one two or three times); `cancelsPerMinute`: what one player may send to DELETE
 * /chain/operations/:id in a minute, a bucket of its own instead of the player's;
 * `rebuildsPerMinute`: what one address may send to POST /chain/sign/:code/addresses for one
 * operation in a minute (a stranger with the code cannot use up the player's attempts);
 * `readinessFanOut`: how readiness asks the provider (readiness.js READINESS_FAN_OUT, for tests);
 * `readinessCacheMs`: how long readiness keeps a wallet's UTxOs (readiness.js createUtxoCache; 0
 * keeps nothing);
 * `oneAtATime`: the app's queue per player; `now`: the app's clock (ms); `log`: where a config that
 * cannot be read, a chain that fails unexpectedly and a mint our side could not build are reported.
 */
const registerChainRoutes = (
    app,
    {
        pool, user, chain, config, limit, sessionLimit, playerPerMinute = 30, mintsPerMinute = 5, cancelsPerMinute = 10, rebuildsPerMinute = 5, readinessFanOut = {},
        readinessCacheMs = UTXO_CACHE.ttlMs, oneAtATime, now = () => Date.now(), log = console,
    }
) => {
    if (!chain.enabled) {
        app.get('/chain/readiness', (req, res) => {
            res.json({ enabled: false });
        });
        app.use('/chain', () => {
            throw chainError(ErrorCode.CHAIN_OFF);
        });
        return;
    }

    const lasting = lastingLog({});
    // the config, and whether it lists the server's key (logged once when it does not, once when it
    // does again)
    const configRead = () =>
        config.get().then(contracts => {
            lasting.clear('config', () => log.info('chain: the config can be read again'));
            if (serverKeyListed(contracts, chain.serverKey)) {
                lasting.clear('serverKey', () => log.info('chain: the server key is in the config again'));
            } else {
                lasting.report('serverKey', 'not listed', () => log.error('chain: the server key is not in the config: minting is off until an admin adds it'));
            }
            return contracts;
        });
    const onConfigError = error => lasting.report('config', messageOf(error), () => log.error('chain: the config cannot be read', error));
    const onChainError = error => log.error('chain: the chain could not be read', reasonOf(error));
    const unavailable = () => chainError(ErrorCode.CHAIN_UNAVAILABLE);

    // the routes with a session: the address's limit, the session, then the player's own bucket
    const perPlayer = fixedWindowLimit({ windowMs: 60000, max: playerPerMinute, now });
    const playerLimit = (req, res, next) => {
        if (!perPlayer.allow(req.playerId)) {
            throw new HttpError(429, ErrorCode.TOO_MANY_REQUESTS);
        }
        next();
    };
    const session = [sessionLimit, ...user, playerLimit];

    // asks the provider for at most 8 wallets of the player, each at most once in readinessCacheMs
    // (and for the config when its copy is old)
    const utxoCache = createUtxoCache({ provider: chain.provider, ttlMs: readinessCacheMs });
    app.get('/chain/readiness', ...session, async (req, res) => {
        const itemId = itemIdOf(req.query);
        res.json(
            await readinessOf({ pool, chain, config: configRead, onConfigError, onChainError, playerId: req.playerId, itemId, now: now(), fanOut: readinessFanOut, utxoCache })
        );
    });

    // -----------------------------------------------------------------------------------------
    // Preparing a mint

    const mints = fixedWindowLimit({ windowMs: 60000, max: mintsPerMinute, now });
    const mintLimit = (req, res, next) => {
        if (!mints.allow(req.playerId)) {
            throw new HttpError(429, ErrorCode.TOO_MANY_REQUESTS);
        }
        next();
    };

    // The config read and listing the server's key: its Contracts; CHAIN UNAVAILABLE otherwise.
    const listedContracts = async () => {
        const contracts = await configRead().catch(error => {
            // the provider down is CHAIN UNAVAILABLE already; a config that cannot be found or read is logged
            if (!(error instanceof HttpError)) {
                onConfigError(error);
            }
            throw unavailable();
        });
        if (!serverKeyListed(contracts, chain.serverKey)) {
            throw unavailable();
        }
        return contracts;
    };

    // 1. The chain: the index fresh, the config read and listing the server's key. Its Contracts.
    const chainContracts = async at => {
        const fresh = await indexFresh(chain, at, onChainError);
        const contracts = await listedContracts();
        if (!fresh) {
            throw unavailable();
        }
        return contracts;
    };

    // 2. The item: the player's, not minted, no open operation of it. Its row.
    const mintableItem = async (playerId, itemId, at) => {
        const { rows } = await pool.query('SELECT id, player_id, item_key, serial, asset_name FROM items WHERE id = $1', [itemId]);
        const item = rows[0];
        if (!item || item.player_id !== playerId) {
            throw new HttpError(400, ErrorCode.NOT_YOUR_ITEM);
        }
        // a mint landed (plan C sets the asset name with it, and keeps it once the item is burned)
        if (item.asset_name !== null) {
            throw chainError(ErrorCode.ALREADY_MINTED);
        }
        const forItem = await ops.expireLapsed(pool, await ops.openForItem(pool, itemId), at);
        if (forItem && ops.OPEN.includes(forItem.state)) {
            throw chainError(ErrorCode.ITEM_BUSY);
        }
        return item;
    };

    // 3.–5. The player: no open operation, the matches, the day's mints, the wallet theirs and counting.
    const checkPlayer = async (playerId, subject, at) => {
        const open = await ops.expireLapsed(pool, await ops.openOf(pool, playerId), at);
        if (open && ops.OPEN.includes(open.state)) {
            throw chainError(ErrorCode.OPERATION_RUNNING);
        }
        if ((await matchesOf(pool, playerId)) < rules.MINT_MIN_ONLINE_MATCHES) {
            throw chainError(ErrorCode.NOT_ENOUGH_MATCHES);
        }
        if ((await mintsLeftToday(pool, playerId, at)) === 0) {
            throw chainError(ErrorCode.MINT_LIMIT);
        }
        // the token would sit in this wallet: it must be the player's, and its items must count for them
        const link = (await linkedPlayers(pool, [subject], at)).get(subject);
        if (!link || link.playerId !== playerId) {
            throw chainError(ErrorCode.NOT_YOUR_WALLET);
        }
        if (link.waitUntil !== null) {
            throw chainError(ErrorCode.WALLET_WAITING);
        }
    };

    // 5. The addresses the wallet named, if it named any: those that carry the subject's key (the
    // others are left out; NOT YOUR WALLET when none is left).
    const ownWallet = (wallet, subject) => {
        try {
            return ownAddressesOf(wallet, subject);
        } catch (error) {
            throw error instanceof WalletAddressError ? chainError(ErrorCode.NOT_YOUR_WALLET) : error;
        }
    };

    // 6. The config: not paused, and `fee` an option this build can pay (0 when there are none).
    // The battlechoc fee of the item's tier with it (gameFeeOf; null without options).
    const checkFee = (contracts, fee, tier) => {
        if (contracts.config.paused) {
            throw chainError(ErrorCode.CHAIN_PAUSED);
        }
        if (contracts.config.fees.length === 0) {
            if (fee !== 0) {
                throw chainError(ErrorCode.UNKNOWN_FEE);
            }
            return null;
        }
        if (!feeOptionsOf(contracts.config).some(option => option.fee === fee)) {
            throw chainError(ErrorCode.UNKNOWN_FEE);
        }
        // an item key the game does not know has no tier: buildMint refuses it (NO_SUCH_TIER)
        return tier === -1 ? null : tx.gameFeeOf(contracts.config, { tier, fee });
    };

    // NOT ENOUGH ADA with what the wallet `utxos` lacks: `missing` as the build verified it (an
    // empty wallet: the funds check's), `needed` the funds check's, at least what the wallet holds
    // and lacks together, so that "it has X, it needs Y" is true
    const notEnoughAda = (utxos, gameFee, built) => {
        const funds = tx.fundsCheck({ utxos, kind: 'mint', gameFee });
        const missing = BigInt(built === undefined ? funds.missing : built);
        const holdsAndLacks = spendableLovelaceOf(utxos) + missing;
        const needed = BigInt(funds.needed) > holdsAndLacks ? BigInt(funds.needed) : holdsAndLacks;
        return chainError(ErrorCode.NOT_ENOUGH_ADA, { missing: String(missing), needed: String(needed) });
    };

    // 7.–8. The wallet's UTxOs (only those at the addresses it named, when it named any), its
    // owner address and the build. Plan B's MintTx. Always from a fresh answer of the provider;
    // readiness's copy of the wallet is dropped, so the checklist next reads the wallet as it is.
    const built = async ({ item, subject, fee, gameFee, contracts, wallet }) => {
        utxoCache.forget(subject);
        const listed = await chain.provider.utxosOf(subject);
        const utxos = wallet ? utxosAtWallet(listed, wallet) : listed;
        let owner;
        try {
            owner = tx.ownerOf({ utxos, subject, network: chain.network });
        } catch (error) {
            // no address of this wallet holds anything
            throw error.code === 'NO_OWNER_ADDRESS' ? notEnoughAda(utxos, gameFee) : error;
        }
        const [params, tip] = await Promise.all([chain.provider.protocolParameters(), chain.provider.tip()]);
        try {
            const mintTx = await tx.buildMint({ item: { key: item.item_key, serial: Number(item.serial) }, fee, owner, utxos, params, tip, contracts, serverKeyHash: chain.serverKey.keyHash });
            return { owner, mintTx };
        } catch (error) {
            throw error.code === 'NOT_ENOUGH_ADA' && error instanceof tx.ChainTxError ? notEnoughAda(utxos, gameFee, error.missing) : error;
        }
    };

    // A failure of a mint as the player gets it: our checks as they are, plan B's refusals that
    // are the player's as their code; the chain down, and anything that is a fault on our side
    // (BAD_ITEM, BUILD_FAILED, an error nobody expected), as CHAIN UNAVAILABLE, the latter logged.
    const refusalOf = error => {
        if (error instanceof HttpError) {
            return error;
        }
        if (error instanceof ProviderError || error instanceof IndexUnavailableError) {
            return unavailable();
        }
        if (error instanceof tx.ChainTxError && Object.prototype.hasOwnProperty.call(PLAYER_REFUSALS, error.code)) {
            return chainError(PLAYER_REFUSALS[error.code]);
        }
        if (error instanceof tx.ChainTxError && error.code === 'SERVER_KEY_NOT_IN_CONFIG') {
            lasting.report('serverKey', 'not listed', () => log.error('chain: the server key is not in the config: minting is off until an admin adds it'));
            return unavailable();
        }
        log.error('chain: a mint could not be prepared', reasonOf(error));
        return unavailable();
    };

    const itemOfRow = item => ({ item: item.item_key, serial: item.serial });

    // what an operation stores of a build: the owner, the transaction and its costs (as built)
    const txFieldsOf = (owner, mintTx) => ({
        ownerKeyHash: owner.keyHash,
        ownerAddress: owner.address,
        requiredKeys: mintTx.requiredWitnesses,
        assetName: mintTx.assetName.user,
        txHash: mintTx.bodyHash,
        txCbor: mintTx.cbor,
        ttlSlot: mintTx.ttl,
        networkFee: mintTx.networkFee,
        gameFeeAsset: mintTx.gameFee ? mintTx.gameFee.asset : null,
        // what the transaction pays the receivers: a share below the minimum UTxO is raised
        gameFee: mintTx.gameFee ? mintTx.gameFee.paid : null,
        deposit: mintTx.deposit,
        depositUser: mintTx.deposits.user,
    });

    const prepareMint = async ({ playerId, itemId, subject, fee, wallet }) => {
        const at = now();
        try {
            const contracts = await chainContracts(at);
            const item = await mintableItem(playerId, itemId, at);
            await checkPlayer(playerId, subject, at);
            const own = wallet ? ownWallet(wallet, subject) : null;
            const gameFee = checkFee(contracts, fee, tierOf(item.item_key));
            const { owner, mintTx } = await built({ item, subject, fee, gameFee, contracts, wallet: own });
            // 9. the item locked, the code's hash stored
            const { code } = newSignCode();
            const op = await ops.insertPrepared(pool, {
                playerId,
                itemId,
                kind: 'mint',
                subject,
                ...txFieldsOf(owner, mintTx),
                // the addresses came with the player's session: the owner is vouched for
                ownerConfirmed: own !== null,
                signUntil: at + rules.SIGN_WINDOW_MS,
                code,
                feeOption: fee,
                now: at,
            });
            const operation = ops.view(op, itemOfRow(item), at);
            return { operation, tx: mintTx.cbor, signCode: code, costs: operation.costs };
        } catch (error) {
            if (error instanceof ops.OpenOperationError) {
                // another process prepared one first (Postgres's partial unique indexes)
                throw chainError(error.reason === 'item' ? ErrorCode.ITEM_BUSY : ErrorCode.OPERATION_RUNNING);
            }
            throw refusalOf(error);
        }
    };

    // The checks run in this order (the first that fails answers), one mint of a player at a
    // time, so a double tap finds the first one's operation: the chain (CHAIN UNAVAILABLE), the
    // item (NOT YOUR ITEM, ALREADY MINTED, ITEM BUSY), the player (OPERATION RUNNING, NOT ENOUGH
    // MATCHES, MINT LIMIT), the wallet (NOT YOUR WALLET, WALLET WAITING), the config (CHAIN PAUSED,
    // UNKNOWN FEE), the wallet's funds and the build (NOT ENOUGH ADA, NO COLLATERAL, WALLET TOO FULL).
    // The wallet's `addresses` (optional) are checked with the wallet (NOT YOUR WALLET).
    app.post('/chain/mint', ...session, mintLimit, async (req, res) => {
        const wanted = mintRequestOf(req.body, chain.network);
        res.status(201).json(await oneAtATime(req.playerId, () => prepareMint({ playerId: req.playerId, ...wanted })));
    });

    // -----------------------------------------------------------------------------------------
    // The player's operations

    // the player's operation `id` as it stands now (a lapsed sign window expired), with its item;
    // NOT FOUND for any other, and for one that a salvage deleted with its item meanwhile (GET reads
    // outside the player's queue)
    const ownOperation = async (playerId, id, at) => {
        const notFound = () => new HttpError(404, ErrorCode.NOT_FOUND);
        const found = isId(id) ? await ops.byId(pool, id) : null;
        if (!found || found.player_id !== playerId) {
            throw notFound();
        }
        const op = await ops.expireLapsed(pool, found, at);
        const { rows } = op ? await pool.query('SELECT item_key, serial FROM items WHERE id = $1', [op.item_id]) : { rows: [] };
        if (rows.length === 0) {
            throw notFound();
        }
        return { op, item: itemOfRow(rows[0]) };
    };

    app.get('/chain/operations/:id', ...session, async (req, res) => {
        const at = now();
        const { op, item } = await ownOperation(req.playerId, req.params.id, at);
        res.json(ops.view(op, item, at));
    });

    // The player cancels a prepared operation: its item is free again. Limited per player by a
    // bucket of its own (`cancelsPerMinute`), not the player's bucket of the other routes: an
    // operation polled in two tabs uses that one up, and the cancel must still go through.
    const cancels = fixedWindowLimit({ windowMs: 60000, max: cancelsPerMinute, now });
    const cancelLimit = (req, res, next) => {
        if (!cancels.allow(req.playerId)) {
            throw new HttpError(429, ErrorCode.TOO_MANY_REQUESTS);
        }
        next();
    };
    app.delete('/chain/operations/:id', sessionLimit, ...user, cancelLimit, async (req, res) => {
        res.json(
            await oneAtATime(req.playerId, async () => {
                const at = now();
                const { op, item } = await ownOperation(req.playerId, req.params.id, at);
                const cancelled = op.state === 'prepared' ? await ops.cancel(pool, op, at) : null;
                if (!cancelled) {
                    throw chainError(ErrorCode.OPERATION_NOT_OPEN);
                }
                return ops.view(cancelled, item, at);
            })
        );
    });

    // -----------------------------------------------------------------------------------------
    // Signing, without a session: the sign code names the operation

    // the prepared operation of the sign code `code` within its sign window (a window that has just
    // passed expires it), with its item. UNKNOWN SIGN CODE for every other code, used up, cancelled,
    // expired or unknown alike; the database is not asked for one that is no sign code at all.
    const signable = async (code, at) => {
        const found = typeof code === 'string' && SIGN_CODE.test(code) ? await ops.byCode(pool, code) : null;
        const op = await ops.expireLapsed(pool, found, at);
        if (!op || op.state !== 'prepared') {
            throw chainError(ErrorCode.UNKNOWN_SIGN_CODE);
        }
        const { rows } = await pool.query('SELECT item_key, serial FROM items WHERE id = $1', [op.item_id]);
        return { op, item: itemOfRow(rows[0]) };
    };

    // The operation's wallet still linked to its player (ruling D22: it may have been unlinked
    // since the mint): its link. Else the operation is cancelled and the answer is the 404 of a
    // dead code; nothing is signed or built.
    const stillLinked = async (op, at) => {
        const link = (await linkedPlayers(pool, [op.subject], at)).get(op.subject);
        if (!link || link.playerId !== op.player_id) {
            if (await ops.cancel(pool, op, at)) {
                log.info('chain: an operation was cancelled: its wallet is no longer linked to its player', { operation: op.id });
            }
            throw chainError(ErrorCode.UNKNOWN_SIGN_CODE);
        }
        return link;
    };

    // a fault on our side while signing: logged by the operation's id and the reason without bytes
    // (never the witness, a transaction or the key), CHAIN UNAVAILABLE for the wallet
    const signingFault = (what, op, error) => {
        log.error(`chain: ${what}`, { operation: op.id, reason: reasonOf(error) });
        return unavailable();
    };

    // The order matters: the code (UNKNOWN SIGN CODE; also for a wallet no longer linked to the
    // operation's player, which cancels the operation), an owner no wallet vouched for (ADDRESSES
    // NEEDED: the rebuild with the wallet's proof comes first), the witness's shape (INVALID REQUEST
    // PARAMETERS), the wallet's signatures over the stored transaction (INVALID WITNESS, nothing
    // changes), the server's key in the config (CHAIN UNAVAILABLE, nothing signed), the server's
    // signature, the compare-and-set to submitted (OPERATION NOT OPEN when a cancel or another
    // signature won: the signed bytes are dropped), and only then the network. A cancel that won
    // means nothing was submitted; a submit the provider refuses is recorded for the watcher, which
    // submits again (a rejection is decided at the safe expiry, never here).
    const signAndSubmit = async (code, body) => {
        const at = now();
        const { op, item } = await signable(code, at);
        await stillLinked(op, at);
        // an owner address the server chose alone (no wallet of the player named it) is never co-signed
        if (!op.owner_confirmed) {
            throw chainError(ErrorCode.ADDRESSES_NEEDED);
        }
        const witness = witnessOf(body);
        let verified;
        try {
            verified = tx.verifyWitness({ cbor: op.tx_cbor, bodyHash: op.tx_hash, witness, requiredWitnesses: JSON.parse(op.required_keys) });
        } catch (error) {
            if (error instanceof tx.ChainTxError) {
                if (CORRUPT_ROW.includes(error.code)) {
                    // the stored transaction and its hash or its keys do not match: ours to fix,
                    // not the wallet's
                    log.error('chain: a stored operation does not hold together', { operation: op.id, code: error.code });
                } else {
                    log.warn('chain: a signature was refused', { operation: op.id, code: error.code });
                }
                throw chainError(ErrorCode.INVALID_WITNESS);
            }
            throw signingFault('a signature could not be checked', op, error);
        }
        // with a key the config does not list, the validator would refuse the transaction
        await listedContracts();
        let signedCbor;
        try {
            signedCbor = tx.addServerWitness({ cbor: verified.cbor, bodyHash: op.tx_hash, key: chain.serverKey }).cbor;
        } catch (error) {
            throw signingFault('the server could not sign', op, error);
        }
        // the window as it stands now, after the config was read and the server signed: a request
        // that waited on the provider cannot win after the window
        const submitted = await ops.markSubmitted(pool, op, { signedCbor, now: now() }).catch(error => {
            throw signingFault('a signed operation could not be stored', op, error);
        });
        if (!submitted) {
            throw chainError(ErrorCode.OPERATION_NOT_OPEN);
        }
        // the wallet is about to change: readiness reads it afresh (the next mint waits for this
        // one to be final anyway, far longer than a copy is kept)
        utxoCache.forget(op.subject);
        try {
            await chain.provider.submit(signedCbor);
        } catch (error) {
            const reason = reasonOf(error);
            if (error instanceof ProviderError) {
                log.warn('chain: a signed operation could not be submitted yet: the watcher submits it again', { operation: op.id, reason });
            } else {
                log.error('chain: a signed operation could not be submitted: the watcher submits it again', { operation: op.id, reason });
            }
            const rejected = error instanceof ProviderError && error.code === 'rejected';
            await ops.noteSubmit(pool, submitted, { now: now(), error: reason, rejected }).catch(noted => {
                log.error('chain: a failed submit could not be recorded', { operation: op.id, reason: reasonOf(noted) });
            });
        }
        return { state: 'submitted', operation: ops.view(submitted, item, at) };
    };

    // what the sign page shows and the wallet signs; `address` is where the token goes (the
    // address the build chose, ownerOf's), not the wallet's reward address
    const signInfoOf = (op, item, at) => {
        const { costs, signUntil } = ops.view(op, item, at);
        return {
            kind: op.kind,
            operationId: op.id,
            ownerConfirmed: op.owner_confirmed === true,
            item,
            tx: op.tx_cbor,
            network: chain.network.name,
            costs,
            subject: op.subject,
            address: op.owner_address,
            signUntil,
        };
    };

    app.get('/chain/sign/:code', limit, async (req, res) => {
        const at = now();
        const { op, item } = await signable(req.params.code, at);
        res.set('Cache-Control', 'no-store').json(signInfoOf(op, item, at));
    });

    // A prepared operation built again from the addresses the wallet names as its own (ruling D21:
    // a build without them may have chosen an outsider's address with the player's stake key). A
    // sign code alone can only read: { addresses } answers the payload the subject's key must sign
    // for exactly that list (CIP-30 signData), and changes nothing; { addresses, proof } with that
    // signature (INVALID SIGNATURE otherwise) builds again from the addresses that carry the
    // subject's key, and the owner is vouched for from then on. The same item, subject, fee option
    // and player; the wallet (still linked, as for a signature; its hop wait), the pause and the
    // server's key are checked as at the mint, the matches and the day's mints are not asked again.
    // One compare-and-set on the prepared state and the old transaction (OPERATION NOT OPEN when a
    // signature, a cancel or another rebuild won); the sign window and the code stay. Limited per
    // address and operation: `rebuildsPerMinute`, within the sign routes' limit per address.
    const rebuilds = fixedWindowLimit({ windowMs: 60000, max: rebuildsPerMinute, now });
    const rebuildFromWallet = async (code, body, address) => {
        const at = now();
        const { op, item } = await signable(code, at);
        // only a mint is rebuilt here (it builds a mint): plan E's burn needs its own rebuild
        if (op.kind !== 'mint') {
            throw chainError(ErrorCode.UNKNOWN_SIGN_CODE);
        }
        const link = await stillLinked(op, at);
        if (!rebuilds.allow(`${address} ${op.id}`)) {
            throw new HttpError(429, ErrorCode.TOO_MANY_REQUESTS);
        }
        const { addresses, proof } = body || {};
        const own = ownWallet(walletOf(addresses, chain.network), op.subject);
        const { text, payload } = addressesPayloadOf({ op, item, addresses, network: chain.network });
        if (proof === undefined) {
            return { payload };
        }
        checkAddressesProof({ proof, text, subject: op.subject, network: chain.network });
        try {
            const contracts = await chainContracts(at);
            if (link.waitUntil !== null) {
                throw chainError(ErrorCode.WALLET_WAITING);
            }
            const gameFee = checkFee(contracts, op.fee_option, tierOf(item.item));
            const { owner, mintTx } = await built({ item: { item_key: item.item, serial: item.serial }, subject: op.subject, fee: op.fee_option, gameFee, contracts, wallet: own });
            const rebuilt = await ops.rebuildPrepared(pool, op, { ...txFieldsOf(owner, mintTx), ownerConfirmed: true }, now());
            if (!rebuilt) {
                throw chainError(ErrorCode.OPERATION_NOT_OPEN);
            }
            return signInfoOf(rebuilt, item, at);
        } catch (error) {
            throw refusalOf(error);
        }
    };

    // { addresses } (the wallet's own, hex): { payload }; { addresses, proof: { signature, key } }:
    // the answer of GET /chain/sign/:code, for the rebuilt operation
    app.post('/chain/sign/:code/addresses', limit, async (req, res) => {
        res.set('Cache-Control', 'no-store').json(await rebuildFromWallet(req.params.code, req.body, req.ip));
    });

    // the wallet's witness set { witness } (its body bounded by sessionlessBodyParser, which app.js
    // puts first)
    app.post('/chain/sign/:code', limit, async (req, res) => {
        res.json(await signAndSubmit(req.params.code, req.body));
    });

    // a code that is not even percent-encoded right, which Express cannot decode: the same 404
    app.use('/chain/sign', (error, req, res, next) => {
        next(error instanceof URIError ? chainError(ErrorCode.UNKNOWN_SIGN_CODE) : error);
    });
};

/**
 * GET /chain/status: whether minting is on, which every web game asks once a session. From the
 * settings alone (no provider, index, config or database), on or off, without a session, never
 * cached; app.js registers it before any body parser, so it reads no body. `statusLimit`: its own
 * rate limit per address.
 */
const registerChainStatus = (app, { chain, statusLimit }) => {
    app.get('/chain/status', statusLimit, (req, res) => {
        res.set('Cache-Control', 'no-store').json({ enabled: chain.enabled === true });
    });
};

module.exports = { registerChainRoutes, registerChainStatus, sessionlessBodyParser, sessionlessBodyError };
