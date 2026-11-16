// The on-chain config as the API reads it (minting plan D): plan B's readConfig through the
// provider, cached for a while, a provider failure answered as CHAIN UNAVAILABLE and never cached.

const { TransactionHash } = require('@evolution-sdk/evolution');
const { createConfigReader } = require('../src/chain/config');
const { HttpError } = require('../src/errors');
const { ProviderError } = require('../src/chain/provider');
const { CONFIG_TOKEN_NAME, ChainConfigError } = require('../src/chain/blueprint');
const { fixtureContracts } = require('./helpers/chain');
const { createChainApp } = require('./helpers/chainApp');
const { closeTestPools } = require('./helpers/db');

afterAll(closeTestPools);

const failureOf = async promise => {
    try {
        await promise;
    } catch (error) {
        return error;
    }
    throw new Error('resolved, but a failure was expected');
};
const withoutUtxo = contracts => ({ ...contracts, configUtxo: null });

// a provider that counts how often the config is asked for, and fails while `failing`
const countingProvider = provider => {
    const counted = { reads: 0, failing: false };
    const read = name => async (...args) => {
        counted.reads += 1;
        if (counted.failing) {
            throw new ProviderError('unavailable', 'down', 503);
        }
        return provider[name](...args);
    };
    return { counted, provider: { ...provider, utxoByUnit: read('utxoByUnit'), utxoByRef: read('utxoByRef') } };
};

describe('createConfigReader', () => {
    test('answers plan B\'s Contracts of the deployment, found by the config NFT', async () => {
        const env = await createChainApp();
        const reader = createConfigReader({ chain: env.chain, now: env.now });
        expect(withoutUtxo(await reader.get())).toEqual(withoutUtxo(fixtureContracts()));
    });

    test('without a config policy it is found by its reference', async () => {
        const env = await createChainApp();
        const ref = await env.chain.provider.utxoByUnit(env.contracts.configPolicyId + CONFIG_TOKEN_NAME);
        expect(ref).toBeDefined();
        const configRef = `${TransactionHash.toHex(ref.transactionId)}#${ref.index}`;
        const chain = { ...env.chain, configRef, configPolicyId: null };
        expect((await createConfigReader({ chain, now: env.now }).get()).config).toEqual(fixtureContracts().config);
        // a reference the chain does not hold is plan B's CONFIG_NOT_FOUND
        const lost = createConfigReader({ chain: { ...chain, configRef: `${'00'.repeat(32)}#0` }, now: env.now });
        expect(await failureOf(lost.get())).toMatchObject({ name: 'ChainConfigError', code: 'CONFIG_NOT_FOUND' });
    });

    test('cached for ttlMs; an admin update shows after that', async () => {
        const env = await createChainApp();
        const { counted, provider } = countingProvider(env.chain.provider);
        const reader = createConfigReader({ chain: { ...env.chain, provider }, ttlMs: 60_000, now: env.now });
        const readAt = env.now();
        const first = await reader.get();
        await env.setConfig({ paused: true });
        env.advance(readAt + 59_999 - env.now());
        expect(await reader.get()).toBe(first);
        expect(counted.reads).toBe(1);
        env.advance(1);
        expect((await reader.get()).config.paused).toBe(true);
        expect(counted.reads).toBe(2);
    });

    test('requests at the same time share one read', async () => {
        const env = await createChainApp();
        const { counted, provider } = countingProvider(env.chain.provider);
        const reader = createConfigReader({ chain: { ...env.chain, provider }, now: env.now });
        const [a, b, c] = await Promise.all([reader.get(), reader.get(), reader.get()]);
        expect(b).toBe(a);
        expect(c).toBe(a);
        expect(counted.reads).toBe(1);
    });

    test('a provider failure is CHAIN UNAVAILABLE (503) and is not cached', async () => {
        const env = await createChainApp();
        const { counted, provider } = countingProvider(env.chain.provider);
        const reader = createConfigReader({ chain: { ...env.chain, provider }, ttlMs: 60_000, now: env.now });
        counted.failing = true;
        const failure = await failureOf(reader.get());
        expect(failure).toBeInstanceOf(HttpError);
        expect(failure).toMatchObject({ status: 503, code: 'CHAIN UNAVAILABLE' });
        expect(failure.cause).toBeInstanceOf(ProviderError);
        counted.failing = false;
        expect((await reader.get()).config.paused).toBe(false);
        expect(counted.reads).toBe(2);
        // also through the double's own faults
        env.double.fail({ provider: 'busy' });
        expect(await failureOf(createConfigReader({ chain: env.chain, now: env.now }).get())).toMatchObject({ status: 503, code: 'CHAIN UNAVAILABLE' });
    });

    test('a config that is missing or not the deployment\'s: plan B\'s error as it is, not cached', async () => {
        const env = await createChainApp({ config: false });
        const reader = createConfigReader({ chain: env.chain, ttlMs: 60_000, now: env.now });
        const failure = await failureOf(reader.get());
        expect(failure).toBeInstanceOf(ChainConfigError);
        expect(failure.code).toBe('CONFIG_NOT_FOUND');
        // the config of another items policy
        const other = await createChainApp();
        const mismatch = await failureOf(createConfigReader({ chain: { ...other.chain, policyId: 'ab'.repeat(28) }, now: other.now }).get());
        expect(mismatch).toMatchObject({ name: 'ChainConfigError', code: 'POLICY_MISMATCH' });
    });
});
