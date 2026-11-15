// The chain features of the server, put together once at the start (server.js) from the checked
// configuration (config.js `chain`). Off, the object only says what is missing; on, it carries the
// settings the routes and the watcher need, the provider (a Blockfrost-compatible API: UTxOs,
// parameters, tip, submit) and the index (the views over Yaci Store's tables). Tests and the
// browser tests hand in doubles of both as `overrides`. The provider key stays in the provider.

const { createProvider } = require('./provider');
const { createChainIndex } = require('./chainIndex');

/**
 * `{ enabled: false, missing }` without `config.chain` (missing: the names of the variables that
 * are not set); else `{ enabled: true, network, policyId, kFinal, indexMaxLagMs, provider, index }`.
 */
const createChain = ({ config, pool, log = console, overrides = {} }) => {
    if (!config.chain) {
        return Object.freeze({ enabled: false, missing: config.chainMissing || [] });
    }
    const { network, policyId, kFinal, indexMaxLagMs, providerUrl, providerKey } = config.chain;
    const provider = overrides.provider || createProvider({ url: providerUrl, key: providerKey, network, log });
    const index = overrides.index || createChainIndex({ pool, policyId, network });
    return Object.freeze({ enabled: true, network, policyId, kFinal, indexMaxLagMs, provider, index });
};

module.exports = { createChain };
