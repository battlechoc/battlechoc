// The transactions of minting, built offline: the API reads the chain (a provider, another
// module), builds the unsigned transaction here, the player's wallet signs it and pays for it,
// and the server signs last. Nothing here holds or sees a private key: the server key enters as
// its hash, and the transaction is handed out unsigned.
//
// A mint spends a seed from the owner's wallet (the seed names the item), reads the config from a
// reference input, mints the item's CIP-68 pair with the items script attached inline, locks the
// reference token with the item's datum at the items script's address, sends the user token and
// the change to the owner, pays the battlechoc fee to the config's receivers, and requires the
// owner's and the server's signatures. The SDK evaluates the items validator while it builds, so
// a mint the validator would refuse never leaves buildMint. A burn spends the item's store and its
// user token and burns the pair (buildBurn). verifyWitness checks the player's witness set
// against the stored transaction and splices it in; addServerWitness signs last.

const {
    Address,
    Assets,
    CBOR,
    Data,
    InlineDatum,
    KeyHash,
    PrivateKey,
    ScriptHash,
    Time,
    Transaction,
    TransactionBody,
    TransactionHash,
    TransactionWitnessSet,
    TxOut,
    UTxO,
    VKey,
    mainnet,
    preprod,
} = require('@evolution-sdk/evolution');
// a public subpath of the package (its `./*` export), not in the root index
const { makeTxBuilder } = require('@evolution-sdk/evolution/sdk/builders/TransactionBuilder');
const { createAikenEvaluator } = require('@evolution-sdk/aiken-uplc');
const { Items, chain, translateIn, translationKeys } = require('@battlechoc/battlechoc-shared-functions');
const { CONFIG_TOKEN_NAME, ChainConfigError, contractsFor, mintItemRedeemer } = require('./blueprint');
const { assetNamesOf, itemDatum, outRef } = require('./names');
const { ChainTxError, gameFeeOf } = require('./fees');

// the SDK's chain (slot config) of each network of shared/cardano/network.js
const CHAINS = { preprod, mainnet };

// the local Aiken evaluator: despite its name, createAikenEvaluator is the evaluator object
// itself (one per process), not a factory
const evaluator = createAikenEvaluator;

const COLLATERAL_INPUTS = 3;

// The minimum UTxO of an output: coinsPerUtxoByte × (160 + its CBOR size), solved as a fixed
// point because the lovelace is part of the size (the ledger's Babbage rule, computed as the SDK
// computes it in sdk/builders/internal/txBuilder.ts `calculateMinimumUtxoLovelace`).
const UTXO_ENTRY_OVERHEAD_BYTES = 160n;
const MIN_UTXO_ITERATIONS = 10;

// What fundsCheck assumes without protocol parameters, so that it is never more optimistic than
// the build: coinsPerUtxoByte 4310 (preprod's and mainnet's since Babbage, and the test
// fixture's), and a base address, the longest key address, as the collateral return's address
// (the return goes to the owner's address, base or enterprise). buildMint uses the real values.
const ASSUMED_COINS_PER_UTXO_BYTE = 4310n;
const SIZING_ADDRESS = new Address.Address({ networkId: 0, paymentCredential: KeyHash.fromHex('00'.repeat(28)), stakingCredential: KeyHash.fromHex('00'.repeat(28)) });

// ---------------------------------------------------------------------------------------------
// UTxOs

const lovelaceOf = utxo => Assets.lovelaceOf(utxo.assets);
const sumLovelace = utxos => utxos.reduce((sum, utxo) => sum + lovelaceOf(utxo), 0n);
const isPureAda = utxo => !Assets.hasMultiAsset(utxo.assets);
const paymentKeyOf = address => (address.paymentCredential instanceof KeyHash.KeyHash ? KeyHash.toHex(address.paymentCredential) : undefined);

// output references in order: by transaction id, then by index
const byOutRef = (a, b) => {
    const [idA, idB] = [TransactionHash.toHex(a.transactionId), TransactionHash.toHex(b.transactionId)];
    return idA === idB ? Number(a.index) - Number(b.index) : idA < idB ? -1 : 1;
};
// the most lovelace first, ties by output reference
const byLovelaceDescending = (a, b) => {
    const [x, y] = [lovelaceOf(a), lovelaceOf(b)];
    return x === y ? byOutRef(a, b) : x > y ? -1 : 1;
};

/**
 * The UTxOs a transaction may spend, in output-reference order: at a key address (a payment key,
 * not a script), without a datum and without a reference script.
 */
const spendableOf = utxos => utxos.filter(utxo => paymentKeyOf(utxo.address) !== undefined && utxo.datumOption === undefined && utxo.scriptRef === undefined).sort(byOutRef);

const minUtxoLovelace = ({ address, assets, coinsPerUtxoByte }) => {
    let lovelace = 0n;
    for (let i = 0; i < MIN_UTXO_ITERATIONS; i++) {
        const output = new TxOut.TransactionOutput({ address, assets: Assets.withLovelace(assets, lovelace) });
        const required = coinsPerUtxoByte * (UTXO_ENTRY_OVERHEAD_BYTES + BigInt(TxOut.toCBORBytes(output).length));
        if (required === lovelace) {
            break;
        }
        lovelace = required;
    }
    return lovelace;
};

// The collateral the build takes from `spendable`, by the SDK's own rule (its Collateral phase):
// the UTxOs pure ADA first, the largest first, until they hold COLLATERAL_LOVELACE, at most
// three. And whether it fits: what they hold beyond it (lovelace and tokens) goes back in the
// collateral return to `address`, which must then hold the minimum UTxO.
const collateralInputsOf = spendable => {
    const target = BigInt(chain.COLLATERAL_LOVELACE);
    const candidates = [...spendable].sort((a, b) => (isPureAda(a) === isPureAda(b) ? byLovelaceDescending(a, b) : isPureAda(a) ? -1 : 1));
    const chosen = [];
    for (const utxo of candidates) {
        if (chosen.length === COLLATERAL_INPUTS || sumLovelace(chosen) >= target) {
            break;
        }
        chosen.push(utxo);
    }
    return chosen;
};
const collateralFits = (spendable, { address, coinsPerUtxoByte }) => {
    const target = BigInt(chain.COLLATERAL_LOVELACE);
    const chosen = collateralInputsOf(spendable);
    const back = sumLovelace(chosen) - target;
    if (back < 0n) {
        return false;
    }
    const assets = chosen.reduce((sum, utxo) => Assets.merge(sum, utxo.assets), Assets.zero);
    if (back === 0n && !Assets.hasMultiAsset(assets)) {
        return true;
    }
    return back >= minUtxoLovelace({ address, assets: Assets.withLovelace(assets, back), coinsPerUtxoByte });
};

// ---------------------------------------------------------------------------------------------
// The owner and the funds

/**
 * The wallet address a transaction for `subject` pays the user token and the change to: for
 * 'stake:<hash>' the base addresses among `utxos` with a payment key and that stake key, for
 * 'pay:<hash>' the addresses with that payment key; of those, the one holding the most lovelace
 * (ties: the lowest output reference). { keyHash (its payment key hash), address (bech32) }.
 * WRONG_NETWORK: a UTxO of another network; NO_OWNER_ADDRESS: no address matches.
 */
const ownerOf = ({ utxos, subject, network }) => {
    if (utxos.some(utxo => utxo.address.networkId !== network.networkId)) {
        throw new ChainTxError('WRONG_NETWORK');
    }
    const [kind, hash] = String(subject).split(':');
    const matches = address => {
        const paymentKey = paymentKeyOf(address);
        if (paymentKey === undefined) {
            return false;
        }
        if (kind === 'pay') {
            return paymentKey === hash;
        }
        const stake = address.stakingCredential;
        return kind === 'stake' && stake instanceof KeyHash.KeyHash && KeyHash.toHex(stake) === hash;
    };
    // the matching addresses with their lovelace and their lowest output reference
    const addresses = new Map();
    for (const utxo of [...utxos].sort(byOutRef)) {
        if (matches(utxo.address)) {
            const address = Address.toBech32(utxo.address);
            const known = addresses.get(address) ?? { address, keyHash: paymentKeyOf(utxo.address), lovelace: 0n, first: utxo };
            addresses.set(address, { ...known, lovelace: known.lovelace + lovelaceOf(utxo) });
        }
    }
    const [richest] = [...addresses.values()].sort((a, b) => (a.lovelace === b.lovelace ? byOutRef(a.first, b.first) : a.lovelace > b.lovelace ? -1 : 1));
    if (!richest) {
        throw new ChainTxError('NO_OWNER_ADDRESS');
    }
    return { keyHash: richest.keyHash, address: richest.address };
};

// What the outputs of the battlechoc fee `gameFee` (gameFeeOf) hold: each receiver's due, raised
// to the minimum UTxO at its address when smaller, as mintOf pays it. FEE_ASSET_UNSUPPORTED for a
// fee in another asset than ADA, as buildMint.
const feeOutputsLovelace = gameFee => {
    if (!gameFee) {
        return 0n;
    }
    if (gameFee.asset !== 'lovelace') {
        throw new ChainTxError('FEE_ASSET_UNSUPPORTED');
    }
    return gameFee.payments
        .filter(({ amount }) => amount > 0)
        .reduce((sum, { address, amount }) => {
            const minimum = minUtxoLovelace({ address: Address.fromBech32(address), assets: Assets.zero, coinsPerUtxoByte: ASSUMED_COINS_PER_UTXO_BYTE });
            return sum + (BigInt(amount) > minimum ? BigInt(amount) : minimum);
        }, 0n);
};

// The bytes `assets`' tokens add to an output at the sizing address (none for pure ADA): from the
// minimum UTxO, which is coinsPerUtxoByte per byte.
const tokenBytesOf = assets => {
    const sized = assets => minUtxoLovelace({ address: SIZING_ADDRESS, assets, coinsPerUtxoByte: ASSUMED_COINS_PER_UTXO_BYTE });
    return (sized(assets) - sized(Assets.zero)) / ASSUMED_COINS_PER_UTXO_BYTE;
};
const tokensOf = utxos => utxos.reduce((sum, utxo) => Assets.merge(sum, utxo.assets), Assets.zero);
const beyond = (count, covered) => BigInt(count > covered ? count - covered : 0);

// The network fee a mint from the wallet's `spendable` UTxOs may take: the estimate, which covers
// up to MINT_NETWORK_FEE_ESTIMATE_INPUTS inputs at MINT_NETWORK_FEE_ESTIMATE_WALLET_KEYS keys,
// and for a larger wallet (every UTxO may have to be spent) the measured cost of each input,
// collateral input and key beyond those and of each byte of tokens in the change (all the
// wallet's tokens) and in the collateral return (the tokens of the collateral).
const mintNetworkFeeOf = spendable => {
    const collateral = collateralInputsOf(spendable);
    const keys = new Set(spendable.map(utxo => paymentKeyOf(utxo.address))).size;
    const tokenBytes = tokenBytesOf(tokensOf(spendable)) + tokenBytesOf(tokensOf(collateral));
    return (
        BigInt(chain.MINT_NETWORK_FEE_ESTIMATE_LOVELACE) +
        (beyond(spendable.length, chain.MINT_NETWORK_FEE_ESTIMATE_INPUTS) + beyond(collateral.length, 1)) * BigInt(chain.MINT_FEE_PER_INPUT_LOVELACE) +
        beyond(keys, chain.MINT_NETWORK_FEE_ESTIMATE_WALLET_KEYS) * BigInt(chain.MINT_FEE_PER_WALLET_KEY_LOVELACE) +
        tokenBytes * BigInt(chain.MINT_FEE_PER_CHANGE_BYTE_LOVELACE)
    );
};

/**
 * Whether the wallet's `utxos` can pay for a transaction: { enough, missing, needed (lovelace),
 * collateral }. Only spendable UTxOs count. `needed` is what the wallet must hold in them for the
 * transaction, `missing` = max(0, needed − what they hold), and `enough` says nothing is missing
 * and the collateral fits. `collateral`: the build will find it (collateralFits, with the assumed
 * coinsPerUtxoByte and a base address for the return).
 *
 * A mint needs the network fee (mintNetworkFeeOf: MINT_NETWORK_FEE_ESTIMATE_LOVELACE, more for a
 * wallet larger than the measured ones), MINT_DEPOSIT_ESTIMATE_LOVELACE and the change: at least
 * CHANGE_RESERVE_LOVELACE, more when the wallet's tokens must ride in it (the minimum UTxO of all
 * of them); in all at least COLLATERAL_LOVELACE; and the outputs of the battlechoc fee `gameFee`
 * (gameFeeOf's answer for the item's tier and the chosen option, null for none), a share below
 * the minimum UTxO raised as the build raises it. For a wallet of pure ADA in at most
 * MINT_NETWORK_FEE_ESTIMATE_INPUTS UTxOs at two keys, one of them the collateral, and a single
 * receiver that clears its minimum UTxO, `needed` is MINT_NEEDED_ESTIMATE_LOVELACE plus the fee. A burn needs no lovelace of its own
 * (the store's deposit comes back and pays its fee): `needed` 0, only the collateral.
 *
 * Without the protocol parameters and before coin selection this errs towards `missing`:
 * buildMint, which builds, has the last word.
 *
 * Throws a ChainTxError FEE_ASSET_UNSUPPORTED for a mint whose `gameFee` is not in ADA (as
 * buildMint refuses it); nothing else for a `gameFee` of gameFeeOf from a config that
 * contractsFor read.
 */
const fundsCheck = ({ utxos, kind, gameFee = null }) => {
    const spendable = spendableOf(utxos);
    const collateral = collateralFits(spendable, { address: SIZING_ADDRESS, coinsPerUtxoByte: ASSUMED_COINS_PER_UTXO_BYTE });
    let needed = 0n;
    if (kind === 'mint') {
        const feeOutputs = feeOutputsLovelace(gameFee);
        const tokenChange = minUtxoLovelace({ address: SIZING_ADDRESS, assets: tokensOf(spendable), coinsPerUtxoByte: ASSUMED_COINS_PER_UTXO_BYTE });
        const change = tokenChange > BigInt(chain.CHANGE_RESERVE_LOVELACE) ? tokenChange : BigInt(chain.CHANGE_RESERVE_LOVELACE);
        const costs = mintNetworkFeeOf(spendable) + BigInt(chain.MINT_DEPOSIT_ESTIMATE_LOVELACE) + change;
        const floor = BigInt(chain.COLLATERAL_LOVELACE);
        needed = (costs > floor ? costs : floor) + feeOutputs;
    }
    const short = needed - sumLovelace(spendable);
    const missing = short > 0n ? Number(short) : 0;
    return { enough: missing === 0 && collateral, missing, needed: Number(needed), collateral };
};

// ---------------------------------------------------------------------------------------------
// The config

/**
 * The contracts of the deployment `policyId` (contractsFor), with the config read through
 * `provider`: by its NFT (`configPolicyId` + "config") wherever an admin update moved it, else by
 * the output reference `configRef`. CONFIG_NOT_FOUND when the provider has no such UTxO;
 * contractsFor's errors as they are.
 */
const readConfig = async ({ provider, blueprint, policyId, network, configRef, configPolicyId }) => {
    const configUtxo = configPolicyId ? await provider.utxoByUnit(configPolicyId + CONFIG_TOKEN_NAME) : await provider.utxoByRef(configRef);
    if (!configUtxo) {
        throw new ChainConfigError('CONFIG_NOT_FOUND');
    }
    return contractsFor({ blueprint, configUtxo, policyId, network });
};

// ---------------------------------------------------------------------------------------------
// Building, and what a refused build means

// The SDK's error, for the logs: its message (it names amounts, output references and the
// validator that failed, never a key) and, for a failed evaluation, where it failed.
const reasonOf = error => [error?.message ?? String(error), ...(error?.cause?.failures ?? []).map(failure => failure.validationError)].filter(Boolean).join('; ');

// The SDK's failures when the wallet's lovelace does not cover the transaction (coin selection,
// a change below its minimum, tokens in the leftover without enough lovelace), each with how
// much more it says it needs; undefined for any other failure.
const SHORTFALLS = [
    /Insufficient lovelace: need (?<need>\d+), have (?<have>\d+)/,
    /insufficient lovelace \((?<have>\d+) < (?<need>\d+) minUTxO\)/,
    /Available: (?<have>\d+) lovelace\s+Required: At least (?<need>\d+) lovelace/,
];
const shortfallOf = error => {
    for (const text of [error?.message, error?.cause?.message]) {
        for (const pattern of SHORTFALLS) {
            const match = typeof text === 'string' ? pattern.exec(text) : null;
            if (match) {
                return BigInt(match.groups.need) - BigInt(match.groups.have);
            }
        }
    }
    return undefined;
};

// How often a build is tried with a top-up before it gives up (each try is a build); and the
// stand-in output reference of the top-up (its size is that of any output reference)
const TOP_UP_ATTEMPTS = 6;
const TOP_UP_TX = '00'.repeat(32);

// The TTL of a transaction built at `tip`: TX_VALIDITY_MS later (1 slot = 1 s).
const ttlOf = tip => tip.slot + chain.TX_VALIDITY_MS / 1000;

// The transaction of `builder` (its inputs, scripts, mints and outputs added), valid until slot
// `ttl`, required to be signed by `signers` (key hashes), balanced from `spendable` with the
// change and the collateral return to `changeAddress` (bech32) and COLLATERAL_LOVELACE as the
// collateral; the SDK evaluates the scripts on the way. The SDK's CBOR hex; its failure as it is.
const finished = async (builder, { network, ttl, signers, spendable, changeAddress, params }) => {
    builder.setValidity({ to: Time.slotToUnixTime(BigInt(ttl), CHAINS[network.name].slotConfig) });
    for (const signer of signers) {
        builder.addSigner({ keyHash: KeyHash.fromHex(signer) });
    }
    const result = await builder.build({
        availableUtxos: spendable,
        changeAddress: Address.fromBech32(changeAddress),
        fullProtocolParameters: params,
        evaluator,
        setCollateral: BigInt(chain.COLLATERAL_LOVELACE),
    });
    return Transaction.toCBORHex(await result.toTransaction());
};

// The lovelace a wallet that `build` (spendable UTxOs → a build) refused for want of lovelace
// (the SDK said `shortfall`) must receive in one more pure UTxO at `address` (bech32, the change
// address) for it to build: found by building with such a top-up, raised by what each failed try
// says it lacks. It is at least the minimum UTxO of that output (no smaller UTxO exists), and
// enough for the collateral to stay well formed. BUILD_FAILED when no top-up is found or the SDK
// fails for another reason.
const topUpOf = async ({ build, spendable, address: bech32, coinsPerUtxoByte, shortfall }) => {
    const address = Address.fromBech32(bech32);
    const pureMinimum = minUtxoLovelace({ address, assets: Assets.zero, coinsPerUtxoByte });
    let missing = shortfall > pureMinimum ? shortfall : pureMinimum;
    let failure;
    for (let attempt = 0; attempt < TOP_UP_ATTEMPTS; attempt++) {
        const topUp = new UTxO.UTxO({ transactionId: TransactionHash.fromHex(TOP_UP_TX), index: 0n, address, assets: Assets.fromLovelace(missing) });
        const wallet = spendableOf([...spendable, topUp]);
        if (!collateralFits(wallet, { address, coinsPerUtxoByte })) {
            // a pure UTxO this large is the collateral by itself, its return at least the minimum
            const alone = BigInt(chain.COLLATERAL_LOVELACE) + pureMinimum;
            if (missing >= alone) {
                break;
            }
            missing = alone;
            continue;
        }
        try {
            await build(wallet);
            return Number(missing);
        } catch (error) {
            const more = shortfallOf(error);
            if (more === undefined) {
                throw new ChainTxError('BUILD_FAILED', { cause: reasonOf(error) });
            }
            failure = error;
            missing += more > 0n ? more : 1n;
        }
    }
    throw new ChainTxError('BUILD_FAILED', { cause: `no top-up found after ${TOP_UP_ATTEMPTS} tries: ${reasonOf(failure)}` });
};

// What `build(spendable)` builds. The ADA is the build's to judge: a wallet it refuses for want of
// lovelace is NOT_ENOUGH_ADA with the `missing` lovelace one more pure UTxO at `address` must
// hold for it to build (topUpOf); any other refusal is BUILD_FAILED with the SDK's reason.
const builtOrRefused = async ({ build, spendable, address, coinsPerUtxoByte }) => {
    try {
        return await build(spendable);
    } catch (error) {
        const shortfall = shortfallOf(error);
        if (shortfall === undefined) {
            throw new ChainTxError('BUILD_FAILED', { cause: reasonOf(error) });
        }
        throw new ChainTxError('NOT_ENOUGH_ADA', { missing: await topUpOf({ build, spendable, address, coinsPerUtxoByte, shortfall }) });
    }
};

// What a result reads back from the transaction as written: the hash of its body bytes (hex), and
// the payment keys of the wallet's UTxOs among its inputs and collateral (each must sign; a
// script input, the store, has none)
const bodyBytesOf = cbor => Transaction.extractBodyBytes(Buffer.from(cbor, 'hex'));
const bodyHashOf = cbor => TransactionHash.toHex(TransactionBody.toHashFromBytes(bodyBytesOf(cbor)));
const walletKeysOf = (body, spendable) => {
    const wallet = new Map(spendable.map(utxo => [outRef(utxo), utxo]));
    return [...body.inputs, ...body.collateralInputs].map(input => wallet.get(outRef(input))).filter(Boolean).map(utxo => paymentKeyOf(utxo.address));
};

// ---------------------------------------------------------------------------------------------
// The mint

// The seed of a mint: the spendable ADA-only UTxO with the most lovelace, or, in a wallet whose
// ADA all sits next to tokens, the spendable UTxO with the most lovelace (ties: the lowest output
// reference).
const seedOf = spendable => [...spendable].sort(byLovelaceDescending).find(isPureAda) ?? [...spendable].sort(byLovelaceDescending)[0];

// The item's name on chain (permanent, in the datum): its English name, from its key. BAD_ITEM for
// an item without one (translateIn would only warn and answer ''), so no empty name is written.
const englishNameOf = key => {
    const text = `ITEM_${key}`;
    const name = Object.prototype.hasOwnProperty.call(translationKeys, text) ? translateIn('en', translationKeys[text]) : '';
    if (typeof name !== 'string' || name.trim() === '') {
        throw new ChainTxError('BAD_ITEM');
    }
    return name;
};

// The mint of `spendable` (sorted, spendable UTxOs): the seed, its asset names and the SDK's
// transaction as CBOR hex. The SDK's failure as it is.
const mintOf = async ({ mint, spendable }) => {
    const { item, tier, fee, gameFee, owner, params, tip, contracts, serverKeyHash } = mint;
    const { policyId, itemsAddress, network } = contracts;
    const seedUtxo = seedOf(spendable);
    const seed = outRef(seedUtxo);
    const assetName = assetNamesOf(seed);
    const unit = name => policyId + name;

    const builder = makeTxBuilder({ chain: CHAINS[network.name] })
        .collectFrom({ inputs: [seedUtxo] })
        .readFrom({ referenceInputs: [contracts.configUtxo] })
        .attachScript({ script: contracts.items.script })
        .mintAssets({
            assets: Assets.fromRecord({ [unit(assetName.reference)]: 1n, [unit(assetName.user)]: 1n }),
            redeemer: mintItemRedeemer({ seed, owner: owner.keyHash, tier, fee: gameFee ? fee : 0 }),
        })
        .payToAddress({
            address: Address.fromBech32(itemsAddress),
            assets: Assets.fromHexStrings(policyId, assetName.reference, 1n),
            datum: new InlineDatum.InlineDatum({ data: itemDatum({ item, userAssetName: assetName.user }) }),
            autoMinUtxo: true,
        })
        .payToAddress({ address: Address.fromBech32(owner.address), assets: Assets.fromHexStrings(policyId, assetName.user, 1n), autoMinUtxo: true });
    // one output per receiver that is due something, raised to the minimum UTxO if smaller
    for (const payment of gameFee ? gameFee.payments.filter(({ amount }) => amount > 0) : []) {
        builder.payToAddress({ address: Address.fromBech32(payment.address), assets: Assets.fromLovelace(BigInt(payment.amount)), autoMinUtxo: true });
    }
    const cbor = await finished(builder, { network, ttl: ttlOf(tip), signers: [owner.keyHash, serverKeyHash], spendable, changeAddress: owner.address, params });
    return { seed, assetName, cbor };
};

/**
 * The unsigned mint of `item` ({ key, serial }) for `owner` (ownerOf) from the wallet's `utxos`,
 * with the fee option `fee`, built against `params` (protocol parameters), `tip` ({ slot, block })
 * and `contracts` (contractsFor), to be signed by the owner and the server key `serverKeyHash`.
 * The tier and the name on chain (the English name) come from the item's key, not from the
 * caller: the server's signature vouches for them, and the name is permanent. A `name` in `item`
 * is ignored.
 *
 * Resolves to { kind: 'mint', cbor, bodyHash, assetName: { suffix, reference, user }, seed,
 * networkFee, gameFee: null | { asset, amount, paid }, deposit, deposits: { reference, user },
 * ttl, collateral (output references), requiredWitnesses (key hashes the wallet signs with) },
 * lovelace as Numbers. `cbor` is the SDK's own encoding: it is never re-encoded later.
 *
 * Rejects with a ChainTxError: PAUSED, SERVER_KEY_NOT_IN_CONFIG, NO_SUCH_TIER (an item key the
 * game does not know), BAD_ITEM (a serial that is not a positive safe integer, or an item without
 * an English name), NO_SUCH_FEE, FEE_ASSET_UNSUPPORTED, NO_COLLATERAL, NOT_ENOUGH_ADA (`missing`:
 * the lovelace one more pure UTxO at the owner's address must hold for the mint to build),
 * BUILD_FAILED (anything else the SDK refuses; its reason as `cause`).
 */
const buildMint = async ({ item, fee, owner, utxos, params, tip, contracts, serverKeyHash }) => {
    const { config, policyId } = contracts;
    if (config.paused) {
        throw new ChainTxError('PAUSED');
    }
    if (!config.serverKeys.includes(serverKeyHash)) {
        throw new ChainTxError('SERVER_KEY_NOT_IN_CONFIG');
    }
    const known = Object.prototype.hasOwnProperty.call(Items, item.key);
    const tier = chain.TIER_ORDER.indexOf(known ? Items[item.key].tier : undefined);
    if (tier === -1) {
        throw new ChainTxError('NO_SUCH_TIER');
    }
    if (!Number.isSafeInteger(item.serial) || item.serial <= 0) {
        throw new ChainTxError('BAD_ITEM');
    }
    const name = englishNameOf(item.key);
    const gameFee = gameFeeOf(config, { tier, fee });
    // CHOC and USDCx fees come with the treasury plan
    if (gameFee && gameFee.asset !== 'lovelace') {
        throw new ChainTxError('FEE_ASSET_UNSUPPORTED');
    }
    // the collateral by the build's own measure: the owner's address and the real parameters
    const spendable = spendableOf(utxos);
    if (!collateralFits(spendable, { address: Address.fromBech32(owner.address), coinsPerUtxoByte: params.coinsPerUtxoByte })) {
        throw new ChainTxError('NO_COLLATERAL');
    }

    const mint = { item: { key: item.key, name, serial: item.serial }, tier, fee, gameFee, owner, params, tip, contracts, serverKeyHash };
    const build = wallet => mintOf({ mint, spendable: wallet });
    const { seed, assetName, cbor } = await builtOrRefused({ build, spendable, address: owner.address, coinsPerUtxoByte: params.coinsPerUtxoByte });

    // what the result reports, read back from the transaction as written
    const unit = name => policyId + name;
    const { body } = Transaction.fromCBORHex(cbor);
    const holding = name => body.outputs.find(output => Assets.getByUnit(output.assets, unit(name)) === 1n);
    const deposits = { reference: Number(lovelaceOf(holding(assetName.reference))), user: Number(lovelaceOf(holding(assetName.user))) };
    const receivers = new Set(gameFee ? gameFee.payments.map(payment => payment.address) : []);
    const paid = body.outputs.filter(output => receivers.has(Address.toBech32(output.address))).reduce((sum, output) => sum + lovelaceOf(output), 0n);

    return {
        kind: 'mint',
        cbor,
        bodyHash: bodyHashOf(cbor),
        assetName,
        seed,
        networkFee: Number(body.fee),
        gameFee: gameFee ? { asset: gameFee.asset, amount: gameFee.amount, paid: Number(paid) } : null,
        deposit: deposits.reference + deposits.user,
        deposits,
        ttl: Number(body.ttl),
        collateral: body.collateralInputs.map(outRef),
        requiredWitnesses: [...new Set([owner.keyHash, ...walletKeysOf(body, spendable)])].sort(),
    };
};

// ---------------------------------------------------------------------------------------------
// The burn
//
// A burn salvages one item: it spends the store (the reference token's UTxO at the items script)
// and the wallet's UTxO with the user token, burns both with the items script attached inline,
// and sends the rest, the store's deposit too, back to the holder. No config, no fee: the
// validator lets the holder burn alone. The game's burns also require the server's signature, so
// one the game has not co-signed (cancelled, or past its sign window) can never land. No
// reference input: the builder's language views (it counts every reference script it reads) stay
// the node's.

// The redeemers: the items policy's `BurnItems` (ItemAction's constructor 1, no fields), and the
// store's, which the spend handler ignores
const BURN_ITEMS_REDEEMER = Data.constr(1n, []);
const STORE_REDEEMER = Data.constr(0n, []);

// a user token's name (label 222 and a suffix) and its suffix
const USER_NAME = new RegExp(`^${chain.USER_LABEL}([0-9a-f]{56})$`);

// Whether `utxo` is a store of the deployment `contracts` holding the reference token `unit`: at
// the items script with any stake part (the validator matches the script credential only).
const storesReference = (utxo, unit, { policyId, network }) => {
    const credential = utxo?.address?.paymentCredential;
    return (
        credential instanceof ScriptHash.ScriptHash &&
        ScriptHash.toHex(credential) === policyId &&
        utxo.address.networkId === network.networkId &&
        Assets.getByUnit(utxo.assets, unit) === 1n
    );
};

/**
 * The unsigned burn of the item whose user token is `assetName` (hex, label 222) for `holder`
 * (ownerOf) from the wallet's `utxos`, with its store `reference` (the UTxO holding the item's
 * reference token at the items script, found by its unit), built against `params`, `tip` and
 * `contracts` like a mint. With `serverKeyHash` the server is a required signer (the game's
 * burns); `null` builds a burn by the holder alone. The config is not read: a paused config does
 * not stop a burn, and a burn pays no battlechoc fee.
 *
 * Resolves to { kind: 'burn', cbor, bodyHash, assetName, networkFee, gameFee: null, deposits: {
 * reference (the store's lovelace, back to the holder), user (the lovelace of the spent UTxO that
 * held the user token) }, ttl, collateral, requiredWitnesses (the payment keys of the wallet's
 * spent and collateral inputs) }, lovelace as Numbers.
 *
 * Rejects with a ChainTxError: TOKEN_NOT_HELD (no spendable UTxO among `utxos` holds the user
 * token), REFERENCE_NOT_FOUND (`reference` is not the store of this item), NO_COLLATERAL,
 * NOT_ENOUGH_ADA (`missing`, as for a mint, at the holder's address), BUILD_FAILED.
 */
const buildBurn = async ({ assetName, holder, utxos, reference, params, tip, contracts, serverKeyHash = null }) => {
    const { policyId, network } = contracts;
    const spendable = spendableOf(utxos);
    const name = typeof assetName === 'string' ? USER_NAME.exec(assetName) : null;
    const userUnit = policyId + assetName;
    const held = name ? spendable.find(utxo => Assets.getByUnit(utxo.assets, userUnit) > 0n) : undefined;
    if (!held) {
        throw new ChainTxError('TOKEN_NOT_HELD');
    }
    const referenceUnit = policyId + chain.REFERENCE_LABEL + name[1];
    if (!storesReference(reference, referenceUnit, contracts)) {
        throw new ChainTxError('REFERENCE_NOT_FOUND');
    }
    if (!collateralFits(spendable, { address: Address.fromBech32(holder.address), coinsPerUtxoByte: params.coinsPerUtxoByte })) {
        throw new ChainTxError('NO_COLLATERAL');
    }

    const ttl = ttlOf(tip);
    const signers = serverKeyHash ? [serverKeyHash] : [];
    const build = wallet =>
        finished(
            makeTxBuilder({ chain: CHAINS[network.name] })
                .collectFrom({ inputs: [held] })
                .collectFrom({ inputs: [reference], redeemer: STORE_REDEEMER })
                .attachScript({ script: contracts.items.script })
                .mintAssets({ assets: Assets.fromRecord({ [referenceUnit]: -1n, [userUnit]: -1n }), redeemer: BURN_ITEMS_REDEEMER }),
            { network, ttl, signers, spendable: wallet, changeAddress: holder.address, params }
        );
    const cbor = await builtOrRefused({ build, spendable, address: holder.address, coinsPerUtxoByte: params.coinsPerUtxoByte });

    const { body } = Transaction.fromCBORHex(cbor);
    return {
        kind: 'burn',
        cbor,
        bodyHash: bodyHashOf(cbor),
        assetName,
        networkFee: Number(body.fee),
        gameFee: null,
        deposits: { reference: Number(lovelaceOf(reference)), user: Number(lovelaceOf(held)) },
        ttl: Number(body.ttl),
        collateral: body.collateralInputs.map(outRef),
        requiredWitnesses: [...new Set(walletKeysOf(body, spendable))].sort(),
    };
};

// ---------------------------------------------------------------------------------------------
// The signatures
//
// The server stores a built transaction with its body hash. The player's wallet answers CIP-30
// signTx(cbor, true) with a witness set; verifyWitness checks it against what was stored and
// splices it in, and addServerWitness signs last. The SDK's splice rewrites only the vkey
// witnesses, so the body bytes (and with them the body hash and the signatures) and the
// redeemers' bytes (the script data hash) stay as built. A refusal names its code only: no key,
// no signature and no witness bytes reach an error or a log.

const HEX_BYTES = /^(?:[0-9a-fA-F]{2})+$/;
// the key of the vkey witnesses in a witness set
const VKEY_WITNESSES = 0n;

const bodyMatches = (cbor, bodyHash) => {
    try {
        return typeof bodyHash === 'string' && bodyHashOf(cbor) === bodyHash;
    } catch {
        return false;
    }
};

// The vkey witnesses of the wallet's `witness` (CBOR hex): a witness set with at least one vkey
// witness and nothing else, in either form of a CDDL set (tag 258 or a plain array). The SDK's
// decoder skips what it does not know (another key, another tag), so the keys are read from the
// raw CBOR first. BAD_WITNESS otherwise.
const vkeyWitnessesOf = witness => {
    let keys;
    let set;
    try {
        keys = typeof witness === 'string' && HEX_BYTES.test(witness) ? CBOR.fromCBORHex(witness) : undefined;
        set = keys instanceof Map ? TransactionWitnessSet.fromCBORHex(witness) : undefined;
    } catch {
        throw new ChainTxError('BAD_WITNESS');
    }
    const only = set !== undefined && keys.size === 1 && keys.has(VKEY_WITNESSES);
    if (!only || !(set.vkeyWitnesses?.length > 0)) {
        throw new ChainTxError('BAD_WITNESS');
    }
    return set.vkeyWitnesses;
};

const signs = ({ vkey, signature }, message) => {
    try {
        return VKey.verify(vkey, message, signature.bytes);
    } catch {
        return false;
    }
};

// `cbor` with `witnesses` (VKeyWitness) spliced in; BODY_CHANGED if its body bytes changed.
const withWitnesses = (cbor, witnesses) => {
    const signed = Transaction.addVKeyWitnessesHex(cbor, TransactionWitnessSet.toCBORHex(TransactionWitnessSet.fromVKeyWitnesses(witnesses)));
    if (Buffer.compare(bodyBytesOf(signed), bodyBytesOf(cbor)) !== 0) {
        throw new ChainTxError('BODY_CHANGED');
    }
    return signed;
};

/**
 * The player's witness set `witness` (CBOR hex, as a CIP-30 wallet answers signTx(cbor, true))
 * checked against the stored transaction `cbor` with its stored `bodyHash`, and spliced in: {
 * cbor, signers (the key hashes whose witnesses it took, sorted) }. Only the witnesses of the keys
 * in `requiredWitnesses` are taken, one each; the others are left out (the fee counts the
 * required ones only).
 *
 * Throws a ChainTxError: BODY_CHANGED (`cbor`'s body does not hash to `bodyHash`), BAD_WITNESS
 * (not hex, not a witness set, anything but vkey witnesses in it, or a signature that does not
 * verify over `bodyHash`, whoever's key it is), MISSING_SIGNATURE (a key of
 * `requiredWitnesses` without a witness).
 */
const verifyWitness = ({ cbor, bodyHash, witness, requiredWitnesses }) => {
    if (!bodyMatches(cbor, bodyHash)) {
        throw new ChainTxError('BODY_CHANGED');
    }
    const message = TransactionHash.toBytes(TransactionHash.fromHex(bodyHash));
    const witnesses = vkeyWitnessesOf(witness);
    if (!witnesses.every(entry => signs(entry, message))) {
        throw new ChainTxError('BAD_WITNESS');
    }
    const required = new Set(requiredWitnesses);
    const taken = new Map();
    for (const entry of witnesses) {
        const keyHash = KeyHash.toHex(KeyHash.fromVKey(entry.vkey));
        if (required.has(keyHash) && !taken.has(keyHash)) {
            taken.set(keyHash, entry);
        }
    }
    if ([...required].some(keyHash => !taken.has(keyHash))) {
        throw new ChainTxError('MISSING_SIGNATURE');
    }
    const signers = [...taken.keys()].sort();
    return { cbor: withWitnesses(cbor, signers.map(keyHash => taken.get(keyHash))), signers };
};

/**
 * The stored transaction `cbor` with the server's witness added, last: `key` ({ privateKey },
 * from loadKey) signs the stored `bodyHash`. Resolves to { cbor }. BODY_CHANGED if `cbor`'s body
 * does not hash to `bodyHash`, or the splice changed its body bytes.
 */
const addServerWitness = ({ cbor, bodyHash, key }) => {
    if (!bodyMatches(cbor, bodyHash)) {
        throw new ChainTxError('BODY_CHANGED');
    }
    const message = TransactionHash.toBytes(TransactionHash.fromHex(bodyHash));
    const witness = new TransactionWitnessSet.VKeyWitness({ vkey: PrivateKey.toPublicKey(key.privateKey), signature: PrivateKey.sign(key.privateKey, message) });
    return { cbor: withWitnesses(cbor, [witness]) };
};

module.exports = { ChainTxError, ownerOf, fundsCheck, readConfig, buildMint, buildBurn, verifyWitness, addServerWitness };
