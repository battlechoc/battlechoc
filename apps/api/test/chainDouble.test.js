// The chain double (plan C, Task 3): an in-memory chain of blocks, a mempool and rollbacks, read
// through the real provider (over a fetch the double answers in Blockfrost's JSON) and through an
// index of Task 4's shapes. Plans D and E and the browser tests run against it.

const { Address, Assets, Data, InlineDatum, KeyHash, PlutusV3, ScriptHash, TransactionHash, UTxO } = require('@evolution-sdk/evolution');
const { cardano } = require('@battlechoc/battlechoc-shared-functions');
const { TEST_PARAMETERS, createChainDouble, describeJsonTx, jsonTx } = require('./chainDouble');
const { ProviderError } = require('../src/chain/provider');
const { IndexUnavailableError } = require('../src/chain/indexUnavailable');
const { holderOf } = require('../src/chain/addresses');
const { CONFIG_TOKEN_NAME, ChainConfigError, loadBlueprint } = require('../src/chain/blueprint');
const { fundsCheck, readConfig } = require('../src/chain/tx');
const { testKeys } = require('./helpers/cardano');
const { fixtureContracts, loadParams, utxo } = require('./helpers/chain');
const { indexContract } = require('./helpers/indexContract');

const { preprod } = cardano.Networks;
const contracts = fixtureContracts();
const { policyId } = contracts;
const START = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;

// the user token (label 222) and the reference token (label 100) of item `n`
const userName = n => '000de140' + n.toString(16).padStart(56, '0');
const referenceName = n => '000643b0' + n.toString(16).padStart(56, '0');
const hashOf = n => n.toString(16).padStart(64, '0');

const failureOf = async promise => {
    try {
        await promise;
    } catch (error) {
        return error;
    }
    throw new Error('resolved, but a failure was expected');
};

const doubleWith = (options = {}) => {
    let clock = START;
    const chain = createChainDouble({ policyId, now: () => clock, ...options });
    return { chain, advance: ms => (clock += ms), now: () => clock };
};

const lovelaceAt = async (chain, address) => (await chain.provider().utxosAt(address)).map(found => Assets.lovelaceOf(found.assets));

describe('blocks, the tip and the mempool', () => {
    test('the genesis tip exists from the start; each block advances slotsPerBlock slots and takes its time from now', async () => {
        const { chain, advance } = doubleWith();
        expect(chain.tip()).toEqual({ blockNo: 1000, slot: 50_000_000, hash: expect.stringMatching(/^[0-9a-f]{64}$/), time: START });
        advance(20_000);
        const tip = chain.produceBlocks(3);
        expect(tip).toEqual({ blockNo: 1003, slot: 50_000_060, hash: expect.stringMatching(/^[0-9a-f]{64}$/), time: START + 20_000 });
        expect(chain.tip()).toEqual(tip);
        // the provider's tip is Blockfrost's latest block (its time in whole seconds)
        expect(await chain.provider().tip()).toEqual(tip);
    });

    test('block hashes are deterministic: the same blocks give the same hashes', () => {
        const one = doubleWith().chain;
        const two = doubleWith().chain;
        const address = one.addressOf(testKeys());
        one.fund(address, 2_000_000);
        two.fund(address, 2_000_000);
        expect(one.produceBlocks()).toEqual(two.produceBlocks());
        const before = one.tip();
        expect(one.produceBlocks().hash).not.toBe(before.hash);
    });

    test('a funded address shows in utxosOf only after produceBlocks', async () => {
        const { chain } = doubleWith();
        const keys = testKeys();
        const base = chain.addressOf(keys);
        const { txHash, index } = chain.fund(base, 5_000_000);
        expect(index).toBe(0);
        expect(chain.mempool()).toEqual([txHash]);
        expect(await chain.provider().utxosOf(`stake:${keys.stakeKeyHashHex}`)).toEqual([]);
        chain.produceBlocks();
        expect(chain.mempool()).toEqual([]);
        const [found, ...rest] = await chain.provider().utxosOf(`stake:${keys.stakeKeyHashHex}`);
        expect(rest).toEqual([]);
        expect(found).toBeInstanceOf(UTxO.UTxO);
        expect(TransactionHash.toHex(found.transactionId)).toBe(txHash);
        expect(found.index).toBe(0n);
        expect(Address.toBech32(found.address)).toBe(base);
        expect(Assets.lovelaceOf(found.assets)).toBe(5_000_000n);
        // a payment key alone: the UTxOs at its enterprise address
        const enterprise = chain.addressOf(keys, 'enterprise');
        chain.fund(enterprise, 7_000_000, { [policyId + userName(1)]: 1 });
        chain.produceBlocks();
        const [atEnterprise] = await chain.provider().utxosOf(`pay:${keys.paymentKeyHashHex}`);
        expect(Address.toBech32(atEnterprise.address)).toBe(enterprise);
        expect(Assets.getByUnit(atEnterprise.assets, policyId + userName(1))).toBe(1n);
        expect(chain.addressOf(keys)).toBe(keys.baseAddress);
        expect(enterprise).toBe(keys.enterpriseAddress);
        expect(() => chain.addressOf(keys, 'reward')).toThrow(TypeError);
    });

    test('a stranger\'s address is a fresh key address, another each time', () => {
        const { chain } = doubleWith();
        const stranger = chain.newAddress();
        const holder = holderOf(stranger);
        expect(holder.stake).toMatch(/^stake:[0-9a-f]{56}$/);
        expect(holder.pay).toMatch(/^pay:[0-9a-f]{56}$/);
        expect(chain.newAddress()).not.toBe(stranger);
    });

    test('a transaction whose ttlSlot is not above the next block\'s slot never lands and leaves the mempool', async () => {
        const { chain } = doubleWith();
        const address = chain.addressOf(testKeys());
        const funded = chain.fund(address, 9_000_000);
        chain.produceBlocks();
        const late = jsonTx({ txHash: hashOf(1), ttlSlot: chain.tip().slot + 19, inputs: [funded], outputs: [{ address, lovelace: '8000000', assets: {} }], mint: {} });
        expect(await chain.submit(late)).toBe(hashOf(1));
        expect(chain.mempool()).toEqual([hashOf(1)]);
        chain.produceBlocks();
        expect(chain.mempool()).toEqual([]);
        expect(await lovelaceAt(chain, address)).toEqual([9_000_000n]);
        // ttlSlot is the ledger's invalid_hereafter (exclusive): a block in slot ttlSlot does not
        // take the transaction, a block in slot ttlSlot − 1 does
        const atTtl = jsonTx({ txHash: hashOf(2), ttlSlot: chain.tip().slot + 20, inputs: [funded], outputs: [{ address, lovelace: '8000000', assets: {} }], mint: {} });
        await chain.submit(atTtl);
        chain.produceBlocks();
        expect(chain.mempool()).toEqual([]);
        expect(await lovelaceAt(chain, address)).toEqual([9_000_000n]);
        const beforeTtl = jsonTx({ txHash: hashOf(3), ttlSlot: chain.tip().slot + 21, inputs: [funded], outputs: [{ address, lovelace: '8000000', assets: {} }], mint: {} });
        await chain.submit(beforeTtl);
        chain.produceBlocks();
        expect(await lovelaceAt(chain, address)).toEqual([8_000_000n]);
    });

    test('submit refuses a transaction whose input a waiting one spends (BadInputsUTxO), before and after the first lands', async () => {
        const { chain } = doubleWith();
        const address = chain.addressOf(testKeys());
        const funded = chain.fund(address, 9_000_000);
        chain.produceBlocks();
        const spend = (n, lovelace) => jsonTx({ txHash: hashOf(n), ttlSlot: null, inputs: [funded], outputs: [{ address, lovelace, assets: {} }], mint: {} });
        expect(await chain.provider().submit(spend(1, '8000000'))).toBe(hashOf(1));
        const conflict = await failureOf(chain.provider().submit(spend(2, '7000000')));
        expect(conflict).toBeInstanceOf(ProviderError);
        expect(conflict).toMatchObject({ code: 'rejected', status: 400 });
        expect(conflict.message).toMatch(/BadInputsUTxO/);
        expect(chain.mempool()).toEqual([hashOf(1)]);
        chain.produceBlocks();
        expect(await failureOf(chain.provider().submit(spend(2, '7000000')))).toMatchObject({ code: 'rejected', message: expect.stringMatching(/BadInputsUTxO/) });
        expect(await lovelaceAt(chain, address)).toEqual([8_000_000n]);
    });

    test('two mempool transactions spending the same input (queued as another node accepted them): the first lands, the second is dropped', async () => {
        const { chain } = doubleWith();
        const address = chain.addressOf(testKeys());
        const funded = chain.fund(address, 9_000_000);
        chain.produceBlocks();
        const spend = (n, lovelace) => jsonTx({ txHash: hashOf(n), ttlSlot: null, inputs: [funded], outputs: [{ address, lovelace, assets: {} }], mint: {} });
        expect(await chain.submit(spend(1, '8000000'))).toBe(hashOf(1));
        expect(await chain.queue(spend(2, '7000000'))).toBe(hashOf(2));
        expect(await chain.queue(spend(2, '7000000'))).toBe(hashOf(2));
        expect(chain.mempool()).toEqual([hashOf(1), hashOf(2)]);
        chain.produceBlocks();
        expect(chain.mempool()).toEqual([]);
        expect(await lovelaceAt(chain, address)).toEqual([8_000_000n]);
        expect(await chain.provider().utxoByRef(`${hashOf(2)}#0`)).toBeUndefined();
        expect(await failureOf(chain.submit(spend(2, '7000000')))).toMatchObject({ code: 'rejected' });
    });

    test('a transaction may spend what an earlier one of the same block creates', async () => {
        const { chain } = doubleWith();
        const address = chain.addressOf(testKeys());
        const funded = chain.fund(address, 9_000_000);
        await chain.submit(jsonTx({ txHash: hashOf(1), ttlSlot: null, inputs: [funded], outputs: [{ address, lovelace: '8000000', assets: {} }], mint: {} }));
        await chain.submit(jsonTx({ txHash: hashOf(2), ttlSlot: null, inputs: [{ txHash: hashOf(1), index: 0 }], outputs: [{ address, lovelace: '7000000', assets: {} }], mint: {} }));
        chain.produceBlocks();
        expect(await lovelaceAt(chain, address)).toEqual([7_000_000n]);
    });

    test('holdMempool(true): three blocks, the transaction still waits; holdMempool(false) and a block: it lands', async () => {
        const { chain } = doubleWith();
        const address = chain.addressOf(testKeys());
        chain.holdMempool(true);
        const { txHash } = chain.fund(address, 3_000_000);
        chain.produceBlocks(3);
        expect(chain.tip().blockNo).toBe(1003);
        expect(chain.mempool()).toEqual([txHash]);
        expect(await lovelaceAt(chain, address)).toEqual([]);
        chain.holdMempool(false);
        chain.produceBlocks();
        expect(chain.mempool()).toEqual([]);
        expect(await lovelaceAt(chain, address)).toEqual([3_000_000n]);
    });

    test('a held transaction that expires meanwhile leaves the mempool', async () => {
        const { chain } = doubleWith();
        const address = chain.addressOf(testKeys());
        const funded = chain.fund(address, 9_000_000);
        chain.produceBlocks();
        chain.holdMempool(true);
        await chain.submit(jsonTx({ txHash: hashOf(1), ttlSlot: chain.tip().slot + 50, inputs: [funded], outputs: [{ address, lovelace: '8000000', assets: {} }], mint: {} }));
        chain.produceBlocks(2);
        expect(chain.mempool()).toEqual([hashOf(1)]);
        chain.produceBlocks();
        expect(chain.mempool()).toEqual([]);
    });
});

describe('rollbacks', () => {
    test('rollback(count) removes the last blocks, never below the genesis tip', () => {
        const { chain } = doubleWith();
        const genesis = chain.tip();
        chain.produceBlocks(2);
        expect(chain.rollback(1).blockNo).toBe(1001);
        expect(chain.rollback(5)).toEqual(genesis);
    });

    test('moveToken, block: the holder changed; rollback(1): the old holder is back and the move waits again; block: moved again; rollback(1, { drop: true }) and a block: it stays', async () => {
        const { chain } = doubleWith();
        const ann = testKeys();
        const bob = testKeys();
        const name = userName(7);
        chain.mintToken({ assetName: name, to: chain.addressOf(ann) });
        chain.produceBlocks();
        const holder = async () => (await chain.index().holdersOf([name])).map(row => row.address);
        expect(await holder()).toEqual([ann.baseAddress]);
        const move = chain.moveToken({ assetName: name, to: chain.addressOf(bob) });
        chain.produceBlocks();
        expect(await holder()).toEqual([bob.baseAddress]);
        chain.rollback(1);
        expect(await holder()).toEqual([ann.baseAddress]);
        expect(chain.mempool()).toEqual([move]);
        chain.produceBlocks();
        expect(await holder()).toEqual([bob.baseAddress]);
        chain.rollback(1, { drop: true });
        expect(chain.mempool()).toEqual([]);
        chain.produceBlocks();
        expect(await holder()).toEqual([ann.baseAddress]);
    });

    test('the transactions of rolled back blocks go to the front of the mempool, in chain order', async () => {
        const { chain } = doubleWith();
        const address = chain.addressOf(testKeys());
        const first = chain.fund(address, 1_000_000).txHash;
        chain.produceBlocks();
        const second = chain.fund(address, 2_000_000).txHash;
        chain.produceBlocks();
        const waiting = chain.fund(address, 3_000_000).txHash;
        chain.rollback(2);
        expect(chain.mempool()).toEqual([first, second, waiting]);
    });

    test('index().transaction(hash): null before its block, { blockNo, slot } after it, null after a rollback that drops it', async () => {
        const { chain } = doubleWith();
        const name = userName(3);
        const txHash = chain.mintToken({ assetName: name, to: chain.addressOf(testKeys()) });
        expect(await chain.index().transaction(txHash)).toBeNull();
        const tip = chain.produceBlocks();
        expect(await chain.index().transaction(txHash)).toEqual({ blockNo: tip.blockNo, slot: tip.slot });
        chain.produceBlocks(2);
        expect(await chain.index().transaction(txHash)).toEqual({ blockNo: tip.blockNo, slot: tip.slot });
        chain.rollback(3, { drop: true });
        expect(await chain.index().transaction(txHash)).toBeNull();
    });
});

describe('the index', () => {
    test('mintToken and a block: one holder at the base address, the reference token at the double\'s script address, held by nobody', async () => {
        const { chain } = doubleWith();
        const ann = testKeys();
        const name = userName(1);
        const txHash = chain.mintToken({ assetName: name, to: chain.addressOf(ann) });
        const tip = chain.produceBlocks();
        const rows = await chain.index().holdersOf([name]);
        expect(rows).toEqual([
            { assetName: name, address: ann.baseAddress, stake: `stake:${ann.stakeKeyHashHex}`, pay: `pay:${ann.paymentKeyHashHex}`, txHash, index: 0, blockNo: tip.blockNo, slot: tip.slot },
        ]);
        expect(await chain.index().tokensHeldBy([`stake:${ann.stakeKeyHashHex}`])).toEqual(rows);
        expect(await chain.index().tokensHeldBy([`pay:${ann.paymentKeyHashHex}`])).toEqual(rows);
        expect(await chain.index().holdersOf([referenceName(1)])).toEqual([
            { assetName: referenceName(1), address: chain.scriptAddress, stake: null, pay: null, txHash, index: 1, blockNo: tip.blockNo, slot: tip.slot },
        ]);
        expect(holderOf(chain.scriptAddress)).toEqual({ stake: null, pay: null });
        // the reference-token store is the items script's address
        expect(ScriptHash.toHex(Address.fromBech32(chain.scriptAddress).paymentCredential)).toBe(policyId);
        const store = await chain.provider().utxoByUnit(policyId + referenceName(1));
        expect(Address.toBech32(store.address)).toBe(chain.scriptAddress);
        expect(await chain.index().mintOf(name)).toEqual({ txHash, blockNo: tip.blockNo, time: tip.time });
    });

    test('tokensHeldBy: only the policy\'s user tokens, only of the given subjects', async () => {
        const { chain } = doubleWith();
        const ann = testKeys();
        const bob = testKeys();
        chain.mintToken({ assetName: userName(1), to: chain.addressOf(ann) });
        chain.mintToken({ assetName: userName(2), to: chain.addressOf(ann, 'enterprise') });
        chain.mintToken({ assetName: userName(3), to: chain.addressOf(bob) });
        chain.fund(chain.addressOf(ann), 2_000_000, { ['ab'.repeat(28) + userName(4)]: 1, [policyId + 'cafe']: 1 });
        chain.produceBlocks();
        const names = async subjects => (await chain.index().tokensHeldBy(subjects)).map(row => row.assetName).sort();
        expect(await names([`stake:${ann.stakeKeyHashHex}`])).toEqual([userName(1)]);
        expect(await names([`pay:${ann.paymentKeyHashHex}`])).toEqual([userName(1), userName(2)]);
        expect(await names([`stake:${ann.stakeKeyHashHex}`, `stake:${bob.stakeKeyHashHex}`])).toEqual([userName(1), userName(3)]);
        expect(await names([])).toEqual([]);
    });

    test('burnToken: nobody holds the pair any more; the burn is a transaction of the index, the mint stays where it was', async () => {
        const { chain } = doubleWith();
        const name = userName(5);
        const minted = chain.mintToken({ assetName: name, to: chain.addressOf(testKeys()) });
        const mintTip = chain.produceBlocks();
        const burned = chain.burnToken({ assetName: name });
        const burnTip = chain.produceBlocks();
        expect(await chain.index().holdersOf([name, referenceName(5)])).toEqual([]);
        expect(await chain.index().transaction(burned)).toEqual({ blockNo: burnTip.blockNo, slot: burnTip.slot });
        expect(await chain.index().mintOf(name)).toEqual({ txHash: minted, blockNo: mintTip.blockNo, time: mintTip.time });
        expect(await chain.index().mintOf(userName(6))).toBeNull();
        expect(await chain.provider().utxoByUnit(policyId + name)).toBeUndefined();
        expect(() => chain.burnToken({ assetName: name })).toThrow(/nobody holds/);
    });

    test('the index sees what the real one sees: only transactions that touch the policy', async () => {
        const { chain } = doubleWith();
        const { txHash } = chain.fund(chain.addressOf(testKeys()), 2_000_000);
        chain.produceBlocks();
        expect(await chain.index().transaction(txHash)).toBeNull();
    });

    test('a token minted and moved before any block: both land in the next one', async () => {
        const { chain } = doubleWith();
        const bob = testKeys();
        chain.mintToken({ assetName: userName(9), to: chain.addressOf(testKeys()) });
        chain.moveToken({ assetName: userName(9), to: chain.addressOf(bob) });
        chain.produceBlocks();
        expect((await chain.index().holdersOf([userName(9)])).map(row => row.address)).toEqual([bob.baseAddress]);
    });

    test('moveToken keeps the other assets of the spent output with its old address', async () => {
        const { chain } = doubleWith();
        const ann = chain.addressOf(testKeys());
        const bob = chain.addressOf(testKeys());
        const other = 'ab'.repeat(28) + 'cafe';
        chain.fund(ann, 10_000_000, { [policyId + userName(4)]: 1, [other]: 5 });
        chain.produceBlocks();
        chain.moveToken({ assetName: userName(4), to: bob });
        chain.produceBlocks();
        const [atAnn] = await chain.provider().utxosAt(ann);
        expect(Assets.getByUnit(atAnn.assets, other)).toBe(5n);
        expect(Assets.getByUnit(atAnn.assets, policyId + userName(4))).toBe(0n);
        const [atBob] = await chain.provider().utxosAt(bob);
        expect(Assets.getByUnit(atBob.assets, policyId + userName(4))).toBe(1n);
    });
});

// the same answers as the real index over Yaci Store's tables (chainIndex.test.js, Postgres only)
indexContract('the chain double', chain => chain.index());

describe('submit', () => {
    const setup = () => {
        const { chain } = doubleWith();
        const address = chain.addressOf(testKeys());
        const funded = chain.fund(address, 9_000_000);
        chain.produceBlocks();
        const tx = (n, extra = {}) => jsonTx({ txHash: hashOf(n), ttlSlot: null, inputs: [funded], outputs: [{ address, lovelace: '8000000', assets: {} }], mint: {}, ...extra });
        return { chain, address, funded, tx };
    };

    test('the same hash again, waiting or on chain: resolves with the hash', async () => {
        const { chain, tx } = setup();
        expect(await chain.submit(tx(1))).toBe(hashOf(1));
        expect(await chain.submit(tx(1))).toBe(hashOf(1));
        expect(chain.mempool()).toEqual([hashOf(1)]);
        chain.produceBlocks();
        expect(await chain.submit(tx(1))).toBe(hashOf(1));
        expect(chain.mempool()).toEqual([]);
    });

    test('rejected: an input spent on chain, an input that never was, a tip past ttlSlot, a transaction that cannot be read', async () => {
        const { chain, tx } = setup();
        await chain.submit(tx(1));
        chain.produceBlocks();
        const spent = await failureOf(chain.submit(tx(2)));
        expect(spent).toBeInstanceOf(ProviderError);
        expect(spent).toMatchObject({ code: 'rejected' });
        expect(spent.message).toMatch(/BadInputsUTxO/);
        expect(await failureOf(chain.submit(tx(3, { inputs: [{ txHash: hashOf(99), index: 0 }] })))).toMatchObject({ code: 'rejected' });
        const expired = await failureOf(chain.submit(tx(4, { inputs: [{ txHash: hashOf(1), index: 0 }], ttlSlot: chain.tip().slot - 1 })));
        expect(expired).toMatchObject({ code: 'rejected', message: expect.stringMatching(/OutsideValidityIntervalUTxO/) });
        expect(await failureOf(chain.submit('zz'))).toMatchObject({ code: 'rejected' });
        expect(await failureOf(chain.submit(Buffer.from('{"txHash":"nope"}').toString('hex')))).toMatchObject({ code: 'rejected' });
        expect(chain.mempool()).toEqual([]);
    });

    test('ttlSlot is exclusive at submit too: refused at tip.slot === ttlSlot, accepted at tip.slot === ttlSlot − 1', async () => {
        const { chain, tx } = setup();
        const atTtl = await failureOf(chain.provider().submit(tx(1, { ttlSlot: chain.tip().slot })));
        expect(atTtl).toMatchObject({ code: 'rejected', status: 400, message: expect.stringMatching(/OutsideValidityIntervalUTxO/) });
        expect(await chain.provider().submit(tx(2, { ttlSlot: chain.tip().slot + 1 }))).toBe(hashOf(2));
        expect(chain.mempool()).toEqual([hashOf(2)]);
    });

    test('through the provider: a submit resolves with the hash, a refused one is the provider\'s rejected ProviderError with the reason', async () => {
        const { chain, tx } = setup();
        expect(await chain.provider().submit(tx(1))).toBe(hashOf(1));
        chain.produceBlocks();
        const refused = await failureOf(chain.provider().submit(tx(2)));
        expect(refused).toBeInstanceOf(ProviderError);
        expect(refused).toMatchObject({ code: 'rejected', status: 400 });
        expect(refused.message).toMatch(/BadInputsUTxO/);
    });

    test('describeJsonTx reads what jsonTx writes', () => {
        const description = { txHash: hashOf(1), ttlSlot: 5, inputs: [{ txHash: hashOf(2), index: 1 }], outputs: [{ address: 'addr_test1x', lovelace: '1', assets: { ab: '2' } }], mint: { ab: '-1' } };
        expect(describeJsonTx(jsonTx(description))).toEqual(description);
    });
});

describe('the provider over the double', () => {
    test('UTxOs at an address, with and without an asset; pages of 100 as Blockfrost pages them; 404 for an address or account never seen', async () => {
        const { chain } = doubleWith();
        const keys = testKeys();
        const address = chain.addressOf(keys);
        const unit = policyId + userName(1);
        for (let i = 0; i < 100; i++) {
            chain.fund(address, 1_000_000 + i);
        }
        chain.fund(address, 2_000_000, { [unit]: 1 });
        chain.produceBlocks();
        expect(await chain.provider().utxosAt(address)).toHaveLength(101);
        const [holding, ...more] = await chain.provider().utxosAt(address, { asset: unit });
        expect(more).toEqual([]);
        expect(Assets.getByUnit(holding.assets, unit)).toBe(1n);
        expect(await chain.provider().utxosOf(`stake:${keys.stakeKeyHashHex}`)).toHaveLength(101);
        const get = async path => {
            const response = await chain.fetch(`${chain.url}${path}`, { method: 'GET', headers: { project_id: 'x' } });
            return { status: response.status, json: JSON.parse(await response.text()) };
        };
        expect((await get(`/addresses/${address}/utxos?count=100&page=1`)).json).toHaveLength(100);
        expect((await get(`/addresses/${address}/utxos?count=100&page=2`)).json).toHaveLength(1);
        expect((await get(`/addresses/${address}/utxos?count=100&page=3`)).json).toEqual([]);
        expect((await get(`/addresses/${address}/utxos?count=7`)).json).toHaveLength(7);
        expect((await get(`/addresses/${address}/utxos?count=101`)).status).toBe(400);
        const stranger = testKeys();
        expect((await get(`/addresses/${stranger.baseAddress}/utxos`)).status).toBe(404);
        expect((await get(`/accounts/${stranger.rewardAddress}/utxos`)).status).toBe(404);
        expect((await get(`/assets/${policyId + userName(2)}/addresses`)).status).toBe(404);
        expect((await get(`/assets/${unit}/addresses`)).json).toEqual([{ address, quantity: '1' }]);
        // an address that held something once is known: no UTxOs, no 404
        chain.moveToken({ assetName: userName(1), to: stranger.baseAddress });
        chain.produceBlocks();
        expect(await chain.provider().utxosAt(address, { asset: unit })).toEqual([]);
        expect((await get(`/addresses/${address}/utxos/${unit}`)).json).toEqual([]);
    });

    test('a transaction\'s outputs say who spent them: utxoByRef finds an unspent output, not a spent one', async () => {
        const { chain } = doubleWith();
        const address = chain.addressOf(testKeys());
        const funded = chain.fund(address, 9_000_000);
        chain.produceBlocks();
        expect(Assets.lovelaceOf((await chain.provider().utxoByRef(`${funded.txHash}#0`)).assets)).toBe(9_000_000n);
        expect(await chain.provider().utxoByRef(`${funded.txHash}#1`)).toBeUndefined();
        expect(await chain.provider().utxoByRef(`${hashOf(5)}#0`)).toBeUndefined();
        await chain.submit(jsonTx({ txHash: hashOf(1), ttlSlot: null, inputs: [funded], outputs: [{ address, lovelace: '8000000', assets: {} }], mint: {} }));
        // a transaction in the mempool is no transaction of the chain yet
        expect(await chain.provider().utxoByRef(`${hashOf(1)}#0`)).toBeUndefined();
        chain.produceBlocks();
        expect(await chain.provider().utxoByRef(`${funded.txHash}#0`)).toBeUndefined();
        expect(await chain.provider().utxoByRef(`${hashOf(1)}#0`)).toBeDefined();
        const response = await chain.fetch(`${chain.url}/txs/${funded.txHash}/utxos`, { method: 'GET' });
        expect(JSON.parse(await response.text()).outputs[0]).toMatchObject({ output_index: 0, collateral: false, consumed_by_tx: hashOf(1) });
    });

    test('the parameters are those plan B builds with; evaluate answers no execution units', async () => {
        const { chain } = doubleWith();
        expect(await chain.provider().protocolParameters()).toEqual(loadParams());
        expect(TEST_PARAMETERS.min_fee_a).toBe(loadParams().minFeeA);
        expect(await chain.provider().evaluate('84a0')).toEqual([]);
        const custom = doubleWith({ protocolParameters: { ...TEST_PARAMETERS, coins_per_utxo_size: '4000' } }).chain;
        expect((await custom.provider().protocolParameters()).coinsPerUtxoByte).toBe(4000n);
    });

    test('an inline datum and a reference script come back as datumOption and scriptRef', async () => {
        const { chain } = doubleWith();
        const address = chain.addressOf(testKeys());
        const datum = Data.constr(0n, [42n, Data.bytearray('beef')]);
        const script = contracts.items.script;
        chain.fund(address, 20_000_000, {}, { inlineDatum: Data.toCBORHex(datum), referenceScript: { type: 'plutusV3', cbor: Buffer.from(script.bytes).toString('hex') } });
        chain.produceBlocks();
        const [found] = await chain.provider().utxosAt(address);
        expect(found.datumOption).toBeInstanceOf(InlineDatum.InlineDatum);
        expect(Data.toCBORHex(found.datumOption.data)).toBe(Data.toCBORHex(datum));
        expect(found.scriptRef).toBeInstanceOf(PlutusV3.PlutusV3);
        expect(ScriptHash.toHex(ScriptHash.fromScript(found.scriptRef))).toBe(policyId);
        expect(() => chain.fund(address, 1, {}, { referenceScript: { type: 'plutusV9', cbor: '00' } })).toThrow(/script type/);
    });

    test('faults: unavailable answers 503, busy 429, as the real provider\'s ProviderError; fail({}) clears', async () => {
        const { chain } = doubleWith();
        chain.fail({ provider: 'unavailable' });
        expect(await failureOf(chain.provider().tip())).toMatchObject({ name: 'ProviderError', code: 'unavailable', status: 503 });
        expect(await failureOf(chain.provider().submit('00'))).toMatchObject({ code: 'unavailable' });
        chain.fail({ provider: 'busy' });
        expect(await failureOf(chain.provider().utxosAt(chain.scriptAddress))).toMatchObject({ code: 'busy', status: 429 });
        // the index is another door
        expect((await chain.index().tip()).blockNo).toBe(1000);
        chain.fail({});
        expect((await chain.provider().tip()).blockNo).toBe(1000);
    });
});

describe('index faults', () => {
    test('stale: index().tip() is the current tip an hour old; unavailable: every index call throws IndexUnavailableError', async () => {
        const { chain, now, advance } = doubleWith();
        chain.produceBlocks();
        advance(5000);
        chain.fail({ index: 'stale' });
        const tip = await chain.index().tip();
        expect(tip).toEqual({ ...chain.tip(), time: now() - 3_600_000 });
        expect(tip.time).toBe(now() - HOUR);
        chain.fail({ index: 'unavailable' });
        const index = chain.index();
        for (const call of [index.tip(), index.holdersOf([userName(1)]), index.tokensHeldBy(['stake:' + 'ab'.repeat(28)]), index.transaction(hashOf(1)), index.mintOf(userName(1)), index.eventsAmong([userName(1)])]) {
            expect(await failureOf(call)).toBeInstanceOf(IndexUnavailableError);
        }
        // the provider is another door
        expect((await chain.provider().tip()).blockNo).toBe(1001);
        chain.fail({});
        expect(await chain.index().tip()).toEqual(chain.tip());
    });
});

describe('what plan B\'s tx.js does with the double', () => {
    const configUnit = contracts.configPolicyId + CONFIG_TOKEN_NAME;
    const configAddress = Address.toBech32(contracts.configUtxo.address);
    const configDatum = Data.toCBORHex(contracts.configUtxo.datumOption.data);
    const read = (chain, where) => readConfig({ provider: chain.provider(), blueprint: loadBlueprint(), policyId, network: preprod, ...where });
    const withoutUtxo = found => ({ ...found, configUtxo: null });

    test('readConfig answers the fixture deployment\'s Contracts from the config UTxO the double holds, by reference and by the config NFT', async () => {
        const { chain } = doubleWith();
        const { txHash } = chain.fund(configAddress, 2_000_000, { [configUnit]: 1 }, { inlineDatum: configDatum });
        chain.produceBlocks();
        const byNft = await read(chain, { configPolicyId: contracts.configPolicyId });
        const byRef = await read(chain, { configRef: `${txHash}#0` });
        expect(withoutUtxo(byNft)).toEqual(withoutUtxo(contracts));
        expect(withoutUtxo(byRef)).toEqual(withoutUtxo(contracts));
        const held = utxo({ address: configAddress, lovelace: 2_000_000n, tokens: { [configUnit]: 1n }, txId: txHash, index: 0, datum: contracts.configUtxo.datumOption.data });
        expect(byNft.configUtxo).toEqual(held);
        expect(byRef.configUtxo).toEqual(held);
        // an admin update moves the config: the old reference finds nothing, the NFT the new UTxO
        await chain.submit(
            jsonTx({ txHash: hashOf(1), ttlSlot: null, inputs: [{ txHash, index: 0 }], outputs: [{ address: configAddress, lovelace: '3000000', assets: { [configUnit]: '1' }, inlineDatum: configDatum }], mint: {} })
        );
        chain.produceBlocks();
        expect(await failureOf(read(chain, { configRef: `${txHash}#0` }))).toMatchObject({ code: 'CONFIG_NOT_FOUND' });
        const moved = await read(chain, { configPolicyId: contracts.configPolicyId });
        expect(TransactionHash.toHex(moved.configUtxo.transactionId)).toBe(hashOf(1));
        expect(withoutUtxo(moved)).toEqual(withoutUtxo(contracts));
        expect(await failureOf(read(doubleWith().chain, { configPolicyId: contracts.configPolicyId }))).toBeInstanceOf(ChainConfigError);
    });

    test('fundsCheck accepts the UTxOs utxosOf answers for a funded wallet, as for the same UTxOs built by hand', async () => {
        const { chain } = doubleWith();
        const keys = testKeys();
        const base = chain.addressOf(keys);
        const token = 'd5'.repeat(28) + Buffer.from('CHOC', 'utf8').toString('hex');
        const one = chain.fund(base, 30_000_000);
        const two = chain.fund(base, 2_000_000, { [token]: 5 });
        const three = chain.fund(base, 50_000_000, {}, { inlineDatum: Data.toCBORHex(42n) });
        // Blockfrost lists every address of the account, also a script's with the wallet's stake
        // part (a marketplace listing): tx.js leaves it alone
        const listing = Address.toBech32(new Address.Address({ networkId: 0, paymentCredential: ScriptHash.fromHex(policyId), stakingCredential: KeyHash.fromHex(keys.stakeKeyHashHex) }));
        chain.fund(listing, 100_000_000);
        chain.produceBlocks();
        const utxos = await chain.provider().utxosOf(`stake:${keys.stakeKeyHashHex}`);
        expect(utxos).toHaveLength(4);
        const byHand = [
            utxo({ address: base, lovelace: 30_000_000n, txId: one.txHash, index: 0 }),
            utxo({ address: base, lovelace: 2_000_000n, tokens: { [token]: 5n }, txId: two.txHash, index: 0 }),
            utxo({ address: base, lovelace: 50_000_000n, txId: three.txHash, index: 0, datum: 42n }),
        ];
        expect(fundsCheck({ utxos, kind: 'mint' })).toEqual(fundsCheck({ utxos: byHand, kind: 'mint' }));
        expect(fundsCheck({ utxos, kind: 'mint' })).toMatchObject({ enough: true, collateral: true });
    });
});
