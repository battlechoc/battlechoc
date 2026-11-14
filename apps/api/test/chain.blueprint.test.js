// The contracts inside the API (plan B, Task 6): the blueprint, the scripts applied to their
// parameters, the config datum, the mint redeemer, the asset names and the item datum. The
// vectors are pinned twice: here and in the Aiken tests named next to them (contracts/), so the
// two languages cannot drift apart.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Address, CBOR, Data, KeyHash, ScriptHash } = require('@evolution-sdk/evolution');
const { cardano } = require('@battlechoc/battlechoc-shared-functions');
const {
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
} = require('../src/chain/blueprint');
const { assetNamesOf, itemDatum, outRef } = require('../src/chain/names');
const { fixtureKey, utxo } = require('./helpers/chain');

const preprod = cardano.Networks.preprod;
const cbor = data => Data.toCBORHex(data, CBOR.PLUTUS_DATA_OPTIONS);
const text = string => Buffer.from(string, 'utf8').toString('hex');

// `aiken blueprint apply` + `aiken blueprint policy` (compiler v1.1.24) on contracts/plutus.json:
// items and treasury with the config policy 581c c0…c0, config with the seed aa…aa#0
const CONFIG_POLICY = 'c0'.repeat(28);
const ITEMS_POLICY_VECTOR = '2b5f5dca023587605c005c4b87b9155478592505c5a1da25bd0351d0';
const TREASURY_HASH_VECTOR = 'c65a2935236929936e5ce41e6438440c58532b8d810e07e2314619a3';
const CONFIG_SEED = 'aa'.repeat(32) + '#0';
const CONFIG_POLICY_VECTOR = '57e7507db9c453389eb999af28af71e751ba44101d5943222291cd69';

// names.ak `suffix_vector`: the suffix of `example_seed`
const EXAMPLE_SEED = '0123456789abcdef'.repeat(4) + '#1';
const SUFFIX_VECTOR = '8131afd50ec08843dc8e60d31df11c1e9a4c2299f2096d9bfef16ad9';

// config.ak `config_datum_vector`: fixtures.ak `base_config()`, one server key, admins a, b, c
// with threshold 2, not paused, the preprod fee (1, 2 or 4 ADA, all of it to the treasury's
// enterprise script address)
const baseConfig = {
    serverKeys: ['51'.repeat(28)],
    admins: ['a1'.repeat(28), 'a2'.repeat(28), 'a3'.repeat(28)],
    threshold: 2,
    paused: false,
    fees: [{ asset: 'lovelace', amounts: [1_000_000, 2_000_000, 4_000_000], receivers: [{ address: scriptAddress('7e'.repeat(28), preprod), share: 1 }] }],
};
const CONFIG_DATUM_VECTOR =
    'd8799f9f581c51515151515151515151515151515151515151515151515151515151ff9f581ca1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1581ca2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2581ca3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3ff02d879809fd8799f40409f1a000f42401a001e84801a003d0900ff9f9fd8799fd87a9f581c7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7effd87a80ff01ffffffffff';

// items.ak `mint_redeemer_vector`: fixtures.ak `item_mint_redeemer()`, a RARE item, fee option 0
const mintRedeemer = { seed: '5d'.repeat(32) + '#2', owner: '0e'.repeat(28), tier: 1, fee: 0 };
const MINT_REDEEMER_VECTOR =
    'd8799fd8799f58205d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d02ff581c0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0100ff';

const codeOf = error => (error instanceof ChainConfigError ? error.code : error);
const thrown = fn => {
    try {
        fn();
    } catch (error) {
        return error;
    }
    return undefined;
};

describe('the blueprint', () => {
    const blueprint = loadBlueprint();

    test('loads from contracts/plutus.json, built by Aiken v1.1.24 for Plutus V3', () => {
        expect(BLUEPRINT_FILE).toBe(path.resolve(__dirname, '../../../contracts/plutus.json'));
        expect(blueprint.compiler).toMatch(/^v1\.1\.24(\+|$)/);
        expect(blueprint.plutusVersion).toBe('v3');
        for (const name of ['config', 'items', 'treasury']) {
            expect(blueprint[name].compiledCode).toMatch(/^(?:[0-9a-f]{2})+$/);
        }
    });

    describe('a blueprint the API cannot use', () => {
        const json = JSON.parse(fs.readFileSync(BLUEPRINT_FILE, 'utf8'));
        let dir;
        const written = content => {
            const file = path.join(dir, 'plutus.json');
            fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
            return file;
        };
        beforeAll(() => {
            dir = fs.mkdtempSync(path.join(os.tmpdir(), 'battlechoc-blueprint-'));
        });
        afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

        test('without one of the validators', () => {
            for (const title of ['config.config.mint', 'items.items.mint', 'treasury.treasury.spend']) {
                const without = { ...json, validators: json.validators.filter(validator => validator.title !== title) };
                expect(codeOf(thrown(() => loadBlueprint(written(without))))).toBe('BLUEPRINT_INVALID');
            }
        });

        test('for another Plutus version', () => {
            const v2 = { ...json, preamble: { ...json.preamble, plutusVersion: 'v2' } };
            expect(codeOf(thrown(() => loadBlueprint(written(v2))))).toBe('BLUEPRINT_INVALID');
        });

        test('that is not JSON', () => {
            expect(codeOf(thrown(() => loadBlueprint(written('{ not json'))))).toBe('BLUEPRINT_INVALID');
        });
    });
});

describe('the scripts with their parameters', () => {
    const blueprint = loadBlueprint();

    test('the items policy is what aiken blueprint apply gives', () => {
        const { script, policyId } = itemsScript(blueprint, CONFIG_POLICY);
        expect(policyId).toBe(ITEMS_POLICY_VECTOR);
        expect(ScriptHash.toHex(ScriptHash.fromScript(script))).toBe(policyId);
    });

    test('the treasury hash is what aiken blueprint apply gives', () => {
        const { script, hash } = treasuryScript(blueprint, CONFIG_POLICY);
        expect(hash).toBe(TREASURY_HASH_VECTOR);
        expect(ScriptHash.toHex(ScriptHash.fromScript(script))).toBe(hash);
    });

    test('the config policy (the seed as an output reference) is what aiken blueprint apply gives', () => {
        expect(configScript(blueprint, CONFIG_SEED).policyId).toBe(CONFIG_POLICY_VECTOR);
    });

    test('a script address is the enterprise address of the script on the network', () => {
        expect(scriptAddress('7e'.repeat(28), preprod)).toBe('addr_test1wpl8uln70el8uln70el8uln70el8uln70el8uln70el8ulsp0t5nh');
        expect(scriptAddress('7e'.repeat(28), cardano.Networks.mainnet)).toMatch(/^addr1w/);
    });
});

describe('the config datum', () => {
    test('encodes as Aiken serialises base_config()', () => {
        expect(cbor(encodeConfigDatum(baseConfig))).toBe(CONFIG_DATUM_VECTOR);
    });

    test('decodes back to what was encoded', () => {
        expect(decodeConfigDatum(Data.fromCBORHex(CONFIG_DATUM_VECTOR), preprod)).toEqual(baseConfig);
    });

    test('round-trips a paused config with a split fee in a token, keys with stake parts and no fee', () => {
        const team = fixtureKey('team').baseAddress('team-stake');
        const config = {
            serverKeys: ['51'.repeat(28), '52'.repeat(28)],
            admins: ['a1'.repeat(28)],
            threshold: 1,
            paused: true,
            fees: [
                baseConfig.fees[0],
                {
                    asset: 'c4'.repeat(28) + text('CHOC'),
                    amounts: [10, 20, 40],
                    receivers: [
                        { address: scriptAddress('90'.repeat(28), preprod), share: 9 },
                        { address: team, share: 1 },
                    ],
                },
            ],
        };
        expect(decodeConfigDatum(Data.fromCBORHex(cbor(encodeConfigDatum(config))), preprod)).toEqual(config);
        const free = { ...config, fees: [] };
        expect(decodeConfigDatum(Data.fromCBORHex(cbor(encodeConfigDatum(free))), preprod)).toEqual(free);
    });

    test('anything else is CONFIG_INVALID', () => {
        const valid = encodeConfigDatum(baseConfig);
        const withField = (index, value) => Data.constr(0n, valid.fields.map((field, i) => (i === index ? value : field)));
        const fee = valid.fields[4][0];
        const withFee = (index, value) => withField(4, [Data.constr(0n, fee.fields.map((field, i) => (i === index ? value : field)))]);
        const bad = [
            42n,
            Data.constr(1n, valid.fields),
            Data.constr(0n, valid.fields.slice(0, 4)),
            withField(0, [Data.bytearray('51'.repeat(27))]),
            withField(1, Data.bytearray('a1'.repeat(28))),
            withField(2, Data.bytearray('02')),
            withField(2, 2n ** 64n),
            withField(3, Data.constr(2n, [])),
            withFee(0, Data.bytearray('c4'.repeat(27))),
            // ADA with a name
            withFee(1, Data.bytearray(text('CHOC'))),
            withFee(2, [1n, 2n]),
            withFee(3, [Data.constr(0n, [fee.fields[3][0][0], 1n])]),
            withFee(3, [[Data.bytearray('7e'.repeat(28)), 1n]]),
            // a pointer as the stake part (Some(Pointer { 1, 2, 3 })): no bech32 for it
            withFee(3, [[Data.constr(0n, [Data.constr(0n, [Data.bytearray('7e'.repeat(28))]), Data.constr(0n, [Data.constr(1n, [1n, 2n, 3n])])]), 1n]]),
        ];
        for (const data of bad) {
            expect(codeOf(thrown(() => decodeConfigDatum(data, preprod)))).toBe('CONFIG_INVALID');
        }
    });
});

describe('the mint redeemer', () => {
    test('encodes as Aiken serialises item_mint_redeemer()', () => {
        expect(cbor(mintItemRedeemer(mintRedeemer))).toBe(MINT_REDEEMER_VECTOR);
    });

    test('survives CBOR unchanged', () => {
        const data = mintItemRedeemer(mintRedeemer);
        expect(Data.equals(Data.fromCBORHex(cbor(data)), data)).toBe(true);
    });
});

describe('the asset names', () => {
    test('end with the suffix Aiken computes for the seed (names.ak suffix_vector)', () => {
        expect(assetNamesOf(EXAMPLE_SEED)).toEqual({
            suffix: SUFFIX_VECTOR,
            reference: '000643b0' + SUFFIX_VECTOR,
            user: '000de140' + SUFFIX_VECTOR,
        });
    });

    test('another output index is another item', () => {
        expect(assetNamesOf('0123456789abcdef'.repeat(4) + '#0').suffix).not.toBe(SUFFIX_VECTOR);
    });

    test('an output reference is txid#index', () => {
        const seed = utxo({ address: scriptAddress('7e'.repeat(28), preprod), lovelace: 2_000_000n, txId: 'ab'.repeat(32), index: 3 });
        expect(outRef(seed)).toBe('ab'.repeat(32) + '#3');
        for (const notARef of ['ab'.repeat(32), 'ab'.repeat(31) + '#0', 'ab'.repeat(32) + '#-1', 'zz'.repeat(32) + '#0', 42]) {
            expect(() => assetNamesOf(notARef)).toThrow(TypeError);
        }
    });
});

describe('the item datum', () => {
    const { user } = assetNamesOf(EXAMPLE_SEED);
    const datum = itemDatum({ item: { key: 'DARK_WALLS', name: 'Dark Walls', serial: 7 }, userAssetName: user });

    test('is CIP-68 version 1: the metadata, 1, an empty list', () => {
        const [metadata, version, extra] = datum.fields;
        expect(datum.index).toBe(0n);
        expect(version).toBe(1n);
        expect(extra).toEqual([]);
        const entries = [...metadata].map(([key, value]) => [Buffer.from(key).toString('utf8'), value instanceof Uint8Array ? Buffer.from(value).toString('utf8') : value]);
        expect(entries).toEqual([
            ['name', 'Dark Walls'],
            ['image', 'https://battlechoc.com/items/dark-walls.png'],
            ['mediaType', 'image/png'],
            ['description', 'A battlechoc item. What it does today: https://battlechoc.com/item/?a=' + user],
            ['item', 'DARK_WALLS'],
            ['serial', 7n],
        ]);
    });

    test('survives CBOR unchanged', () => {
        expect(Data.equals(Data.fromCBORHex(cbor(datum)), datum)).toBe(true);
    });

    test('a description over 64 bytes is written in chunks of 64 bytes, as the ledger requires', () => {
        const description = text('A battlechoc item. What it does today: https://battlechoc.com/item/?a=' + user);
        expect(description.length / 2).toBeGreaterThan(64);
        expect(cbor(datum)).toContain('5f5840' + description.slice(0, 128));
        expect(cbor(datum)).not.toContain('5880' + description.slice(0, 128));
    });
});

describe('the contracts of a deployment', () => {
    const blueprint = loadBlueprint();
    const configPolicyId = configScript(blueprint, CONFIG_SEED).policyId;
    const { policyId } = itemsScript(blueprint, configPolicyId);
    const configNft = { [configPolicyId + CONFIG_TOKEN_NAME]: 1n };
    // the config address with a stake part: it is free, the NFT identifies the config
    const configAddress = Address.toBech32(
        new Address.Address({ networkId: 0, paymentCredential: ScriptHash.fromHex(configPolicyId), stakingCredential: KeyHash.fromHex(fixtureKey('stake').keyHash) })
    );
    const configUtxo = (tokens = configNft, datum = encodeConfigDatum(baseConfig)) =>
        utxo({ address: configAddress, lovelace: 2_000_000n, tokens, txId: 'cf'.repeat(32), index: 0, datum });

    test('CONFIG_TOKEN_NAME is "config" in UTF-8', () => {
        expect(CONFIG_TOKEN_NAME).toBe(text('config'));
    });

    test('are the items script, the addresses and the config the deployment reads', () => {
        const found = configUtxo();
        const contracts = contractsFor({ blueprint, configUtxo: found, policyId, network: preprod });
        expect(contracts).toEqual({
            network: preprod,
            policyId,
            configPolicyId,
            items: { script: itemsScript(blueprint, configPolicyId).script },
            itemsAddress: scriptAddress(policyId, preprod),
            treasuryAddress: scriptAddress(treasuryScript(blueprint, configPolicyId).hash, preprod),
            configUtxo: found,
            config: baseConfig,
        });
    });

    test('POLICY_MISMATCH: the items policy applied to that config is another', () => {
        expect(codeOf(thrown(() => contractsFor({ blueprint, configUtxo: configUtxo(), policyId: 'ff'.repeat(28), network: preprod })))).toBe('POLICY_MISMATCH');
        // a "config" token under another policy, with a valid datum, is not the config
        const lookAlike = configUtxo({ [CONFIG_POLICY + CONFIG_TOKEN_NAME]: 1n });
        expect(codeOf(thrown(() => contractsFor({ blueprint, configUtxo: lookAlike, policyId, network: preprod })))).toBe('POLICY_MISMATCH');
    });

    test('CONFIG_NOT_FOUND: no config NFT in that UTxO', () => {
        for (const tokens of [{}, { [configPolicyId + text('other')]: 1n }, { [configPolicyId + CONFIG_TOKEN_NAME]: 2n }]) {
            expect(codeOf(thrown(() => contractsFor({ blueprint, configUtxo: configUtxo(tokens), policyId, network: preprod })))).toBe('CONFIG_NOT_FOUND');
        }
    });

    test('CONFIG_INVALID: the datum is not a config or not inline', () => {
        expect(codeOf(thrown(() => contractsFor({ blueprint, configUtxo: configUtxo(configNft, 42n), policyId, network: preprod })))).toBe('CONFIG_INVALID');
        const withoutDatum = utxo({ address: configAddress, lovelace: 2_000_000n, tokens: configNft, txId: 'cf'.repeat(32), index: 0 });
        expect(codeOf(thrown(() => contractsFor({ blueprint, configUtxo: withoutDatum, policyId, network: preprod })))).toBe('CONFIG_INVALID');
    });

    test('a ChainConfigError names its code and nothing else', () => {
        const error = new ChainConfigError('CONFIG_INVALID');
        expect(error).toBeInstanceOf(Error);
        expect(error.code).toBe('CONFIG_INVALID');
        expect(error.message).toBe('CONFIG_INVALID');
        expect(error.name).toBe('ChainConfigError');
    });
});
