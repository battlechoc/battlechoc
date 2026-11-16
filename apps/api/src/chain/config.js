// The on-chain config of the deployment (the config datum: server keys, pause, fee options) as
// the routes read it: plan B's readConfig through the provider, kept for a while so that a
// readiness check or a mint does not ask the provider for it every time. The config is found by
// its NFT when the server knows the config policy (CHAIN_CONFIG_POLICY_ID), so an admin update is
// seen once the cached copy is older than `ttlMs`; else by CHAIN_CONFIG_REF.

const { readConfig } = require('./tx');
const { loadBlueprint } = require('./blueprint');
const { ProviderError } = require('./provider');
const { ErrorCode, chainError } = require('../errors');

const CONFIG_TTL_MS = 60000;

/**
 * A reader of the config of `chain` (createChain's: provider, policyId, network, configRef,
 * configPolicyId): `get()` resolves with plan B's Contracts ({ network, policyId, configPolicyId,
 * items, itemsAddress, treasuryAddress, configUtxo, config: { serverKeys, admins, threshold,
 * paused, fees } }), read at most once per `ttlMs` (ms of `now()`); requests at the same time
 * share one read. A failure of the provider rejects with the HttpError CHAIN UNAVAILABLE (503,
 * the ProviderError as its `cause`); a config that cannot be found or read with plan B's
 * ChainConfigError as it is. Neither is kept: the next get() reads again.
 */
const createConfigReader = ({ chain, ttlMs = CONFIG_TTL_MS, now = () => Date.now(), blueprint }) => {
    let loaded = blueprint;
    let cached = null;
    let reading = null;

    const read = async () => {
        loaded = loaded || loadBlueprint();
        try {
            return await readConfig({
                provider: chain.provider,
                blueprint: loaded,
                policyId: chain.policyId,
                network: chain.network,
                configRef: chain.configRef,
                configPolicyId: chain.configPolicyId,
            });
        } catch (error) {
            if (error instanceof ProviderError) {
                const unavailable = chainError(ErrorCode.CHAIN_UNAVAILABLE);
                unavailable.cause = error;
                throw unavailable;
            }
            throw error;
        }
    };

    const get = () => {
        if (cached && now() - cached.at < ttlMs) {
            return Promise.resolve(cached.contracts);
        }
        if (!reading) {
            const at = now();
            reading = read()
                .then(contracts => {
                    cached = { contracts, at };
                    return contracts;
                })
                .finally(() => {
                    reading = null;
                });
        }
        return reading;
    };

    return { get };
};

module.exports = { CONFIG_TTL_MS, createConfigReader };
