// The contract of the two chain providers (CHAIN_PROVIDER_KIND koios and blockfrost): one small
// chain, told to each adapter in its own provider's JSON by a fake fetch, must give the same
// answer from each of the eight functions. UTxOs are compared as the Evolution SDK's objects
// (address, assets, datum, reference script), so whatever tx.js builds from them, it builds the
// same with either provider. No network: the fetches answer from the chain below.

const { Address, Assets, Data, InlineDatum, KeyHash, NativeScripts, ScriptHash, TransactionHash } = require('@evolution-sdk/evolution');
const { cardano } = require('@battlechoc/battlechoc-shared-functions');
const { createProvider } = require('../src/chain/provider');
const { addressOfSubjectForFunds } = require('../src/chain/addresses');
const { testKeys } = require('./helpers/cardano');
const { fixtureContracts, loadParams } = require('./helpers/chain');
const { koiosEntry, koiosParamsOf } = require('./helpers/koios');

const { preprod } = cardano.Networks;
const txHashOf = n => n.toString(16).padStart(64, '0');
const refOf = ({ txHash, index }) => `${txHash}#${index}`;

// The chain: Ann's wallet (a base address and an enterprise address), the items script's store
// with a reference script, an output already spent, the tip, the parameters, and what the node
// answers to a submit and an evaluation.
const chainOf = () => {
    const ann = testKeys();
    const { items, policyId } = fixtureContracts();
    const plutusCbor = Buffer.from(items.script.bytes).toString('hex');
    const native = NativeScripts.fromCBORHex('8201818200581c' + ann.paymentKeyHashHex);
    const user = policyId + '000de140' + 'cd'.repeat(28);
    const reference = policyId + '000643b0' + 'cd'.repeat(28);
    const fungible = 'f0'.repeat(28) + Buffer.from('CHOC').toString('hex');
    const datum = Data.toCBORHex(Data.constr(0n, [Data.bytearray('beef'), 7n]));
    const outputs = [
        { txHash: txHashOf(1), index: 0, address: ann.baseAddress, lovelace: '30000000', tokens: {} },
        { txHash: txHashOf(1), index: 1, address: ann.baseAddress, lovelace: '1500000', tokens: { [user]: '1', [fungible]: '250' } },
        { txHash: txHashOf(2), index: 0, address: ann.enterpriseAddress, lovelace: '4000000', tokens: {}, dataHash: 'da'.repeat(32) },
        { txHash: txHashOf(2), index: 1, address: ann.enterpriseAddress, lovelace: '9000000', tokens: {}, script: { type: 'timelock', cbor: NativeScripts.toCBORHex(native), hash: ScriptHash.toHex(ScriptHash.fromScript(native)) } },
        { txHash: txHashOf(3), index: 0, address: Address.toBech32(fixtureContracts().configUtxo.address), lovelace: '2000000', tokens: { [reference]: '1' }, inlineDatum: datum },
        { txHash: txHashOf(3), index: 1, address: ann.enterpriseAddress, lovelace: '20000000', tokens: {}, script: { type: 'plutusV3', cbor: plutusCbor, hash: ScriptHash.toHex(ScriptHash.fromScript(items.script)) } },
        { txHash: txHashOf(4), index: 0, address: ann.baseAddress, lovelace: '8000000', tokens: { [fungible]: '5' }, spentBy: txHashOf(5) },
    ];
    return {
        ann,
        units: { user, reference, fungible, burned: policyId + '000de140' + 'ee'.repeat(28) },
        outputs,
        tip: { blockNo: 5_415_506, slot: 139_066_878, hash: 'bc'.repeat(32), seconds: 1_794_750_078 },
        params: loadParams(),
        submitted: txHashOf(9),
        evaluation: [
            { tag: 'spend', index: 1, memory: 1700, steps: 476468 },
            { tag: 'mint', index: 0, memory: 2200, steps: 600000 },
        ],
    };
};

// the reward address of an address's stake key, null without one
const rewardOf = bech32 => {
    const credential = Address.fromBech32(bech32).stakingCredential;
    return credential instanceof KeyHash.KeyHash ? addressOfSubjectForFunds(`stake:${KeyHash.toHex(credential)}`, preprod) : null;
};
const unspent = chain => chain.outputs.filter(output => !output.spentBy);
const holds = (output, unit) => output.tokens[unit] !== undefined && BigInt(output.tokens[unit]) > 0n;
const response = (status, body) => ({ status, ok: status >= 200 && status < 300, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });

// The chain in Blockfrost's JSON (the routes provider.js reads)
const blockfrostFetch = chain => {
    const entryOf = output => ({
        address: output.address,
        tx_hash: output.txHash,
        tx_index: output.index,
        output_index: output.index,
        amount: [{ unit: 'lovelace', quantity: output.lovelace }, ...Object.entries(output.tokens).map(([unit, quantity]) => ({ unit, quantity }))],
        block: 'b1'.repeat(32),
        data_hash: output.dataHash ?? null,
        inline_datum: output.inlineDatum ?? null,
        reference_script_hash: output.script?.hash ?? null,
    });
    const paged = (list, query) => {
        const { count, page } = Object.fromEntries(new URLSearchParams(query));
        return list.slice((Number(page) - 1) * Number(count), Number(page) * Number(count));
    };
    const params = chain.params;
    return async (url, init = {}) => {
        const { pathname, search } = new URL(url);
        const path = pathname.replace(/^\/api\/v0/, '');
        let match;
        if ((match = /^\/accounts\/([^/]+)\/utxos$/.exec(path))) {
            return response(200, paged(unspent(chain).filter(output => rewardOf(output.address) === match[1]).map(entryOf), search));
        }
        if ((match = /^\/addresses\/([^/]+)\/utxos(?:\/([0-9a-f]+))?$/.exec(path))) {
            const found = unspent(chain).filter(output => output.address === match[1] && (!match[2] || holds(output, match[2]))).map(entryOf);
            return response(200, search ? paged(found, search) : found);
        }
        if ((match = /^\/assets\/([0-9a-f]+)\/addresses$/.exec(path))) {
            const holders = [...new Set(unspent(chain).filter(output => holds(output, match[1])).map(output => output.address))];
            return response(200, holders.map(address => ({ address, quantity: '1' })));
        }
        if ((match = /^\/txs\/([0-9a-f]{64})\/utxos$/.exec(path))) {
            const outputs = chain.outputs.filter(output => output.txHash === match[1]);
            return outputs.length === 0
                ? response(404, { status_code: 404 })
                : response(200, { hash: match[1], inputs: [], outputs: outputs.map(output => ({ ...entryOf(output), collateral: false, consumed_by_tx: output.spentBy ?? null })) });
        }
        if ((match = /^\/scripts\/([0-9a-f]{56})(\/cbor)?$/.exec(path))) {
            const { script } = chain.outputs.find(output => output.script?.hash === match[1]);
            return response(200, match[2] ? { cbor: script.cbor } : { script_hash: script.hash, type: script.type });
        }
        if (path === '/epochs/latest/parameters') {
            return response(200, {
                min_fee_a: params.minFeeA,
                min_fee_b: params.minFeeB,
                max_tx_size: params.maxTxSize,
                max_val_size: String(params.maxValSize),
                key_deposit: String(params.keyDeposit),
                pool_deposit: String(params.poolDeposit),
                drep_deposit: String(params.drepDeposit),
                gov_action_deposit: String(params.govActionDeposit),
                price_mem: params.priceMem,
                price_step: params.priceStep,
                max_tx_ex_mem: String(params.maxTxExMem),
                max_tx_ex_steps: String(params.maxTxExSteps),
                coins_per_utxo_size: String(params.coinsPerUtxoByte),
                collateral_percent: params.collateralPercentage,
                max_collateral_inputs: params.maxCollateralInputs,
                min_fee_ref_script_cost_per_byte: params.minFeeRefScriptCostPerByte,
                cost_models_raw: Object.fromEntries(Object.entries(params.costModels).map(([language, costs]) => [language, Object.values(costs)])),
            });
        }
        if (path === '/blocks/latest') {
            return response(200, { height: chain.tip.blockNo, slot: chain.tip.slot, hash: chain.tip.hash, time: chain.tip.seconds });
        }
        if (path === '/tx/submit' && init.method === 'POST') {
            return response(200, JSON.stringify(chain.submitted));
        }
        if (path === '/utils/txs/evaluate' && init.method === 'POST') {
            return response(200, { type: 'jsonwsp/response', result: { EvaluationResult: Object.fromEntries(chain.evaluation.map(({ tag, index, memory, steps }) => [`${tag}:${index}`, { memory, steps }])) } });
        }
        throw new Error(`no Blockfrost route for ${init.method || 'GET'} ${path}`);
    };
};

// The same chain in Koios's JSON (the routes koiosProvider.js reads)
const koiosFetch = chain => {
    const entryOf = output =>
        koiosEntry({
            address: output.address,
            lovelace: output.lovelace,
            tokens: output.tokens,
            txHash: output.txHash,
            index: output.index,
            inlineDatum: output.inlineDatum ?? null,
            dataHash: output.dataHash ?? null,
            referenceScript: output.script ? { hash: output.script.hash, size: output.script.cbor.length / 2, type: output.script.type, bytes: output.script.cbor, value: null } : null,
            isSpent: Boolean(output.spentBy),
        });
    const paged = (list, query) => {
        const { offset, limit } = Object.fromEntries(new URLSearchParams(query));
        return list.slice(Number(offset), Number(offset) + Number(limit));
    };
    // Koios's asset_list=cs.[{ policy_id, asset_name }] filter
    const holdingFilter = query => {
        const filter = new URLSearchParams(query).get('asset_list');
        if (!filter) {
            return () => true;
        }
        const [{ policy_id: policy, asset_name: name }] = JSON.parse(filter.slice('cs.'.length));
        return output => holds(output, policy + name);
    };
    return async (url, init = {}) => {
        const { pathname, search } = new URL(url);
        const path = pathname.replace(/^\/api\/v1/, '');
        const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
        if (path === '/account_utxos') {
            return response(200, paged(unspent(chain).filter(output => body._stake_addresses.includes(rewardOf(output.address))).map(entryOf), search));
        }
        if (path === '/address_utxos') {
            const filter = holdingFilter(search);
            return response(200, paged(unspent(chain).filter(output => body._addresses.includes(output.address) && filter(output)).map(entryOf), search));
        }
        if (path === '/utxo_info') {
            return response(200, chain.outputs.filter(output => body._utxo_refs.includes(refOf(output))).map(entryOf));
        }
        if (path === '/asset_utxos') {
            const units = body._asset_list.map(([policy, name]) => policy + name);
            const { limit } = Object.fromEntries(new URLSearchParams(search));
            return response(200, unspent(chain).filter(output => units.some(unit => holds(output, unit))).map(entryOf).slice(0, Number(limit)));
        }
        if (path === '/epoch_params') {
            return response(200, [koiosParamsOf(chain.params)]);
        }
        if (path === '/tip') {
            return response(200, [{ hash: chain.tip.hash, epoch_no: 325, abs_slot: chain.tip.slot, epoch_slot: 1, block_height: chain.tip.blockNo, block_no: chain.tip.blockNo, block_time: chain.tip.seconds }]);
        }
        if (path === '/submittx') {
            return response(202, chain.submitted);
        }
        if (path === '/ogmios') {
            const purposes = { spend: 'spend', mint: 'mint' };
            return response(200, { jsonrpc: '2.0', method: 'evaluateTransaction', result: chain.evaluation.map(({ tag, index, memory, steps }) => ({ validator: { index, purpose: purposes[tag] }, budget: { memory, cpu: steps } })), id: null });
        }
        throw new Error(`no Koios route for ${init.method || 'GET'} ${path}`);
    };
};

// what makes a UTxO for tx.js: its reference, address, assets, datum and script
const shapeOf = found =>
    found === undefined
        ? undefined
        : {
              ref: `${TransactionHash.toHex(found.transactionId)}#${found.index}`,
              address: Address.toBech32(found.address),
              lovelace: Assets.lovelaceOf(found.assets),
              tokens: Object.fromEntries(Assets.getUnits(found.assets).filter(unit => unit !== 'lovelace').map(unit => [unit, Assets.getByUnit(found.assets, unit)])),
              datum: found.datumOption === undefined ? undefined : found.datumOption instanceof InlineDatum.InlineDatum ? Data.toCBORHex(found.datumOption.data) : found.datumOption,
              script: found.scriptRef === undefined ? undefined : ScriptHash.toHex(ScriptHash.fromScript(found.scriptRef)),
          };
const sorted = list => [...list].sort((a, b) => refOf({ txHash: TransactionHash.toHex(a.transactionId), index: a.index }).localeCompare(refOf({ txHash: TransactionHash.toHex(b.transactionId), index: b.index })));

describe('the providers agree: Koios and Blockfrost answer the same chain alike', () => {
    const chain = chainOf();
    const quiet = { log() {}, info() {}, warn() {}, error() {} };
    const blockfrost = createProvider({ kind: 'blockfrost', url: 'https://cardano-preprod.blockfrost.io/api/v0', key: 'project-id', network: preprod, fetch: blockfrostFetch(chain), log: quiet });
    const koios = createProvider({ kind: 'koios', url: 'https://preprod.koios.rest/api/v1', network: preprod, fetch: koiosFetch(chain), log: quiet });
    const both = async call => Promise.all([call(blockfrost), call(koios)]);
    // equal as SDK objects, and in what they hold
    const sameUtxos = async call => {
        const [one, other] = (await both(call)).map(sorted);
        expect(other).toEqual(one);
        expect(other.map(shapeOf)).toEqual(one.map(shapeOf));
        return one;
    };
    const sameUtxo = async call => {
        const [one, other] = await both(call);
        expect(other).toEqual(one);
        expect(shapeOf(other)).toEqual(shapeOf(one));
        return one;
    };

    test('utxosOf: a stake key (its base addresses) and a payment key (its enterprise address)', async () => {
        const byStake = await sameUtxos(provider => provider.utxosOf(`stake:${chain.ann.stakeKeyHashHex}`));
        expect(byStake.map(shapeOf).map(found => found.ref)).toEqual([`${txHashOf(1)}#0`, `${txHashOf(1)}#1`]);
        const byPayment = await sameUtxos(provider => provider.utxosOf(`pay:${chain.ann.paymentKeyHashHex}`));
        expect(byPayment.map(shapeOf)).toEqual([
            expect.objectContaining({ ref: `${txHashOf(2)}#0`, datum: expect.anything() }),
            expect.objectContaining({ ref: `${txHashOf(2)}#1`, script: chain.outputs[3].script.hash }),
            expect.objectContaining({ ref: `${txHashOf(3)}#1`, script: chain.outputs[5].script.hash }),
        ]);
        expect(addressOfSubjectForFunds(`pay:${chain.ann.paymentKeyHashHex}`, preprod)).toBe(chain.ann.enterpriseAddress);
    });

    test('utxosAt: an address, and its UTxOs that hold an asset; an address without UTxOs', async () => {
        expect(await sameUtxos(provider => provider.utxosAt(chain.ann.baseAddress))).toHaveLength(2);
        expect((await sameUtxos(provider => provider.utxosAt(chain.ann.baseAddress, { asset: chain.units.fungible }))).map(shapeOf)).toEqual([
            expect.objectContaining({ ref: `${txHashOf(1)}#1`, tokens: { [chain.units.user]: 1n, [chain.units.fungible]: 250n } }),
        ]);
        expect(await sameUtxos(provider => provider.utxosAt(testKeys().baseAddress))).toEqual([]);
    });

    test('utxoByRef: an unspent output with an inline datum, a spent one, one that does not exist', async () => {
        const store = await sameUtxo(provider => provider.utxoByRef(`${txHashOf(3)}#0`));
        expect(shapeOf(store)).toMatchObject({ datum: chain.outputs[4].inlineDatum, tokens: { [chain.units.reference]: 1n } });
        expect(await both(provider => provider.utxoByRef(`${txHashOf(4)}#0`))).toEqual([undefined, undefined]);
        expect(await both(provider => provider.utxoByRef(`${txHashOf(1)}#7`))).toEqual([undefined, undefined]);
        expect(await both(provider => provider.utxoByRef(`${txHashOf(8)}#0`))).toEqual([undefined, undefined]);
    });

    test('utxoByUnit: the one output of a user token and of a reference token; a token nobody holds', async () => {
        expect(shapeOf(await sameUtxo(provider => provider.utxoByUnit(chain.units.user))).ref).toBe(`${txHashOf(1)}#1`);
        expect(shapeOf(await sameUtxo(provider => provider.utxoByUnit(chain.units.reference))).ref).toBe(`${txHashOf(3)}#0`);
        expect(await both(provider => provider.utxoByUnit(chain.units.burned))).toEqual([undefined, undefined]);
    });

    test('protocolParameters and tip', async () => {
        const [params, otherParams] = await both(provider => provider.protocolParameters());
        expect(otherParams).toEqual(params);
        expect(params).toEqual(chain.params);
        const [tip, otherTip] = await both(provider => provider.tip());
        expect(otherTip).toEqual(tip);
        expect(tip).toEqual({ blockNo: chain.tip.blockNo, slot: chain.tip.slot, hash: chain.tip.hash, time: chain.tip.seconds * 1000 });
    });

    test('submit and evaluate', async () => {
        expect(await both(provider => provider.submit('84a3'))).toEqual([chain.submitted, chain.submitted]);
        const [units, otherUnits] = await both(provider => provider.evaluate('84a3'));
        expect(otherUnits).toEqual(units);
        expect(units).toEqual(chain.evaluation);
    });
});

describe('the providers agree on the edges of a chain', () => {
    const quiet = { log() {}, info() {}, warn() {}, error() {} };
    // the chain of chainOf with `more` outputs added, told to each adapter
    const providersOf = more => {
        const chain = chainOf();
        chain.outputs.push(...more(chain));
        return {
            chain,
            blockfrost: createProvider({ kind: 'blockfrost', url: 'https://cardano-preprod.blockfrost.io/api/v0', key: 'project-id', network: preprod, fetch: blockfrostFetch(chain), log: quiet }),
            koios: createProvider({ kind: 'koios', url: 'https://preprod.koios.rest/api/v1', network: preprod, fetch: koiosFetch(chain), log: quiet }),
        };
    };

    test('utxoByUnit of a unit two outputs hold: each answers one output that holds it, the same one', async () => {
        const { chain, blockfrost, koios } = providersOf(chain => [{ txHash: txHashOf(6), index: 0, address: chain.ann.enterpriseAddress, lovelace: '2000000', tokens: { [chain.units.fungible]: '7' } }]);
        const [one, other] = await Promise.all([blockfrost.utxoByUnit(chain.units.fungible), koios.utxoByUnit(chain.units.fungible)]);
        expect(shapeOf(other)).toEqual(shapeOf(one));
        expect(shapeOf(one).tokens[chain.units.fungible]).toBeGreaterThan(0n);
        expect(shapeOf(one).ref).toBe(`${txHashOf(1)}#1`);
    });

    test('utxosOf a stake key: an output at a script\'s payment credential with the player\'s stake key is listed by both, as it is', async () => {
        const script = fixtureContracts().items.script;
        const { chain, blockfrost, koios } = providersOf(chain => [
            {
                txHash: txHashOf(7),
                index: 0,
                address: Address.toBech32(new Address.Address({ networkId: 0, paymentCredential: ScriptHash.fromScript(script), stakingCredential: KeyHash.fromHex(chain.ann.stakeKeyHashHex) })),
                lovelace: '50000000',
                tokens: {},
            },
        ]);
        const [one, other] = (await Promise.all([blockfrost.utxosOf(`stake:${chain.ann.stakeKeyHashHex}`), koios.utxosOf(`stake:${chain.ann.stakeKeyHashHex}`)])).map(sorted);
        expect(other.map(shapeOf)).toEqual(one.map(shapeOf));
        expect(one.map(shapeOf).map(found => found.ref)).toEqual([`${txHashOf(1)}#0`, `${txHashOf(1)}#1`, `${txHashOf(7)}#0`]);
        expect(Address.fromBech32(shapeOf(one[2]).address).paymentCredential).toBeInstanceOf(ScriptHash.ScriptHash);
    });
});
