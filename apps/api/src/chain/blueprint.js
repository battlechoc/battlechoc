// The contracts inside the API: the blueprint Aiken wrote (contracts/plutus.json), its validators
// applied to their parameters, the config datum and the mint redeemer as Plutus data, and the
// contracts of one deployment (contractsFor). The encodings are the Aiken types of
// contracts/lib/battlechoc/types.ak; test/chain.blueprint.test.js pins them against Aiken.
//
// A deployment is known by its items policy id. The config is the UTxO that holds the config NFT
// (whatever its address's stake part); the NFT's policy is the config policy, and only if the
// items validator applied to it hashes to the items policy id is it this deployment's config.

const fs = require('fs');
const path = require('path');
const { Address, AssetName, Assets, CBOR, Data, InlineDatum, KeyHash, PlutusV3, PolicyId, ScriptHash, UPLC } = require('@evolution-sdk/evolution');
const { Address: PlutusAddress } = require('@evolution-sdk/evolution/plutus');
const { outRefData } = require('./names');

/** The blueprint: at the same path in the repository and in the image's /app. */
const BLUEPRINT_FILE = path.resolve(__dirname, '../../../../contracts/plutus.json');

/** The asset name of the config NFT: "config" in UTF-8. */
const CONFIG_TOKEN_NAME = '636f6e666967';

const VALIDATORS = { config: 'config.config.mint', items: 'items.items.mint', treasury: 'treasury.treasury.spend' };
const HEX = /^(?:[0-9a-f]{2})*$/;

/** A contract the API cannot work with; `code` says what (the message is only the code). */
class ChainConfigError extends Error {
    constructor(code) {
        super(code);
        this.name = 'ChainConfigError';
        this.code = code;
    }
}

/**
 * The blueprint at `file`: { compiler, plutusVersion, config, items, treasury }, each validator as
 * { compiledCode } (unapplied). BLUEPRINT_INVALID if it is not JSON, not Plutus V3 or lacks one of
 * the three validators.
 */
const loadBlueprint = (file = BLUEPRINT_FILE) => {
    let json;
    try {
        json = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        if (!(error instanceof SyntaxError)) {
            throw error;
        }
        throw new ChainConfigError('BLUEPRINT_INVALID');
    }
    const preamble = json?.preamble ?? {};
    if (preamble.plutusVersion !== 'v3' || !Array.isArray(json.validators)) {
        throw new ChainConfigError('BLUEPRINT_INVALID');
    }
    const validators = Object.fromEntries(
        Object.entries(VALIDATORS).map(([name, title]) => {
            const compiledCode = json.validators.find(validator => validator.title === title)?.compiledCode;
            if (typeof compiledCode !== 'string' || compiledCode === '' || !HEX.test(compiledCode)) {
                throw new ChainConfigError('BLUEPRINT_INVALID');
            }
            return [name, { compiledCode }];
        })
    );
    return { compiler: preamble.compiler?.version, plutusVersion: preamble.plutusVersion, ...validators };
};

// A validator with its parameters (Plutus data) applied, and its hash. applyParamsToScript
// answers double CBOR; the ledger hashes a Plutus script in single CBOR.
const applied = (compiledCode, params) => {
    const code = UPLC.applySingleCborEncoding(UPLC.applyParamsToScript(compiledCode, params, CBOR.PLUTUS_DATA_OPTIONS));
    const script = new PlutusV3.PlutusV3({ bytes: Buffer.from(code, 'hex') });
    return { script, hash: ScriptHash.toHex(ScriptHash.fromScript(script)) };
};

/** The config validator, one-shot on the seed `seedRef` ('txid#index'): { script, policyId }. */
const configScript = (blueprint, seedRef) => {
    const { script, hash } = applied(blueprint.config.compiledCode, [outRefData(seedRef)]);
    return { script, policyId: hash };
};

/** The items validator of the config policy `configPolicyId` (hex): { script, policyId }. */
const itemsScript = (blueprint, configPolicyId) => {
    const { script, hash } = applied(blueprint.items.compiledCode, [Data.bytearray(configPolicyId)]);
    return { script, policyId: hash };
};

/** The treasury of the config policy `configPolicyId` (hex): { script, hash }. */
const treasuryScript = (blueprint, configPolicyId) => applied(blueprint.treasury.compiledCode, [Data.bytearray(configPolicyId)]);

/** The enterprise address (no stake part) of the script `policyId` on `network`, bech32. */
const scriptAddress = (policyId, network) => Address.toBech32(new Address.Address({ networkId: network.networkId, paymentCredential: ScriptHash.fromHex(policyId) }));

// Credentials and addresses between bech32 and Aiken's `Address` as Plutus data, through the
// SDK's Plutus address codec (VerificationKey 0, Script 1; a stake part Inline, never Pointer).
const credentialData = credential =>
    credential instanceof KeyHash.KeyHash
        ? { VerificationKey: { hash: Buffer.from(KeyHash.toHex(credential), 'hex') } }
        : { Script: { hash: Buffer.from(ScriptHash.toHex(credential), 'hex') } };
const credentialOf = data => {
    const hex = Buffer.from((data.VerificationKey ?? data.Script).hash).toString('hex');
    return data.VerificationKey ? KeyHash.fromHex(hex) : ScriptHash.fromHex(hex);
};
const addressData = bech32 => {
    const address = Address.fromBech32(bech32);
    return PlutusAddress.Codec.toData({
        payment_credential: credentialData(address.paymentCredential),
        stake_credential: address.stakingCredential === undefined ? undefined : { Inline: { credential: credentialData(address.stakingCredential) } },
    });
};
const addressOf = (data, network) => {
    const { payment_credential: payment, stake_credential: stake } = PlutusAddress.Codec.fromData(data);
    if (stake !== undefined && !stake.Inline) {
        throw new TypeError('a pointer address has no bech32 form here');
    }
    const parts = { networkId: network.networkId, paymentCredential: credentialOf(payment) };
    return Address.toBech32(new Address.Address(stake === undefined ? parts : { ...parts, stakingCredential: credentialOf(stake.Inline.credential) }));
};

const bool = value => Data.constr(value ? 1n : 0n, []);
const bytesList = hexes => Data.list(hexes.map(hex => Data.bytearray(hex)));

/**
 * The config datum (Aiken's `ConfigDatum`) of { serverKeys, admins (key hashes, hex), threshold,
 * paused, fees: [{ asset ('lovelace' or policy hex + name hex), amounts (by TIER_ORDER),
 * receivers: [{ address (bech32), share }] }] }. A receiver is an Aiken tuple: a 2-element list.
 */
const encodeConfigDatum = ({ serverKeys, admins, threshold, paused, fees }) =>
    Data.constr(0n, [
        bytesList(serverKeys),
        bytesList(admins),
        BigInt(threshold),
        bool(paused),
        Data.list(
            fees.map(({ asset, amounts, receivers }) => {
                const [policy, name] = asset === 'lovelace' ? ['', ''] : [asset.slice(0, 56), asset.slice(56)];
                return Data.constr(0n, [
                    Data.bytearray(policy),
                    Data.bytearray(name),
                    Data.list(amounts.map(amount => BigInt(amount))),
                    Data.list(receivers.map(({ address, share }) => Data.list([addressData(address), BigInt(share)]))),
                ]);
            })
        ),
    ]);

// The readers of decodeConfigDatum: each one throws CONFIG_INVALID for data of another shape.
const invalid = () => {
    throw new ChainConfigError('CONFIG_INVALID');
};
const constrOf = (data, index, arity) => (Data.isConstr(data) && data.index === BigInt(index) && data.fields.length === arity ? data.fields : invalid());
const listOf = data => (Data.isList(data) ? data : invalid());
// a byte string whose length (in bytes) `fits`, as hex
const bytesOf = (data, fits) => {
    const hex = Data.isBytes(data) ? Buffer.from(data).toString('hex') : invalid();
    return fits(hex.length / 2) ? hex : invalid();
};
const numberOf = data => (Data.isInt(data) && data >= BigInt(Number.MIN_SAFE_INTEGER) && data <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(data) : invalid());
const boolOf = data => (Data.isConstr(data) && data.fields.length === 0 && (data.index === 0n || data.index === 1n) ? data.index === 1n : invalid());
const keyHashes = data => listOf(data).map(key => bytesOf(key, length => length === 28));

const feeOf = (data, network) => {
    const [policyData, nameData, amountsData, receiversData] = constrOf(data, 0, 4);
    const policy = bytesOf(policyData, length => length === 0 || length === 28);
    const name = bytesOf(nameData, length => length <= 32);
    if (policy === '' && name !== '') {
        invalid();
    }
    const amounts = listOf(amountsData).map(numberOf);
    if (amounts.length !== 3) {
        invalid();
    }
    const receivers = listOf(receiversData).map(receiver => {
        const pair = listOf(receiver);
        if (pair.length !== 2) {
            invalid();
        }
        let address;
        try {
            address = addressOf(pair[0], network);
        } catch {
            invalid();
        }
        return { address, share: numberOf(pair[1]) };
    });
    return { asset: policy === '' ? 'lovelace' : policy + name, amounts, receivers };
};

/**
 * The config datum as `encodeConfigDatum` takes it, the receivers' addresses as bech32 on
 * `network`. CONFIG_INVALID for anything that is not a `ConfigDatum`.
 */
const decodeConfigDatum = (data, network) => {
    const [serverKeys, admins, threshold, paused, fees] = constrOf(data, 0, 5);
    return {
        serverKeys: keyHashes(serverKeys),
        admins: keyHashes(admins),
        threshold: numberOf(threshold),
        paused: boolOf(paused),
        fees: listOf(fees).map(fee => feeOf(fee, network)),
    };
};

/**
 * The items policy's redeemer `MintItem { seed, owner, tier, fee }`: the seed 'txid#index' the
 * mint spends, the owner's payment key hash (hex), the tier's index in TIER_ORDER and the index of
 * the fee option in the config's `fees`.
 */
const mintItemRedeemer = ({ seed, owner, tier, fee }) => Data.constr(0n, [outRefData(seed), Data.bytearray(owner), BigInt(tier), BigInt(fee)]);

/**
 * The contracts of the deployment whose items policy is `policyId`, with its config in
 * `configUtxo` (an SDK UTxO): { network, policyId, configPolicyId, items: { script },
 * itemsAddress, treasuryAddress, configUtxo, config (decoded datum) }. The fee goes wherever the
 * config's receivers say; `treasuryAddress` is for display and checks. CONFIG_NOT_FOUND: no
 * config NFT in that UTxO; POLICY_MISMATCH: it is the config of another items policy;
 * CONFIG_INVALID: its datum is not an inline config datum.
 */
const contractsFor = ({ blueprint, configUtxo, policyId, network }) => {
    const candidates = Assets.flatten(configUtxo.assets)
        .filter(([, name, quantity]) => AssetName.toHex(name) === CONFIG_TOKEN_NAME && quantity === 1n)
        .map(([policy]) => PolicyId.toHex(policy));
    if (candidates.length === 0) {
        throw new ChainConfigError('CONFIG_NOT_FOUND');
    }
    const found = candidates.map(configPolicyId => ({ configPolicyId, ...itemsScript(blueprint, configPolicyId) })).find(candidate => candidate.policyId === policyId);
    if (!found) {
        throw new ChainConfigError('POLICY_MISMATCH');
    }
    const { configPolicyId, script } = found;
    if (!(configUtxo.datumOption instanceof InlineDatum.InlineDatum)) {
        throw new ChainConfigError('CONFIG_INVALID');
    }
    return {
        network,
        policyId,
        configPolicyId,
        items: { script },
        itemsAddress: scriptAddress(policyId, network),
        treasuryAddress: scriptAddress(treasuryScript(blueprint, configPolicyId).hash, network),
        configUtxo,
        config: decodeConfigDatum(configUtxo.datumOption.data, network),
    };
};

module.exports = {
    BLUEPRINT_FILE,
    CONFIG_TOKEN_NAME,
    ChainConfigError,
    loadBlueprint,
    configScript,
    itemsScript,
    treasuryScript,
    scriptAddress,
    encodeConfigDatum,
    decodeConfigDatum,
    mintItemRedeemer,
    contractsFor,
};
