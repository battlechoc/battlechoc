// The chain features of the server, put together once at the start (server.js) from the checked
// configuration (config.js `chain`). Off, the object only says what is missing; on, it carries the
// settings the routes and the watcher need, the provider (Koios or a Blockfrost-compatible API, by
// CHAIN_PROVIDER_KIND: UTxOs, parameters, tip, submit), the index (the views over Yaci Store's
// tables) and the server key (keys.loadKey's object, which server.js loads once from
// CHAIN_SERVER_KEY_FILE with loadServerKey: the one place that reads the file). Tests and the
// browser tests hand in doubles of the provider and the index as `overrides`. The provider key
// stays in the provider; the server key's private part stays in its object (not enumerable),
// which is passed on as it is: never spread, cloned, logged or serialised, and read only to
// co-sign (tx.addServerWitness).

const { createProvider } = require('./provider');
const { createChainIndex } = require('./chainIndex');
const { KeyFileError, loadKey } = require('./keys');
const { ConfigError } = require('../config');

/**
 * The server key in `file` (keys.loadKey: { keyHash, privateKey }). A file that is not a regular,
 * non-empty key file of mode 600 is a ConfigError that names CHAIN_SERVER_KEY_FILE and what is
 * wrong with the file, never what is in it.
 */
const loadServerKey = file => {
    try {
        return loadKey(file);
    } catch (error) {
        throw new ConfigError([error instanceof KeyFileError ? `CHAIN_SERVER_KEY_FILE: ${error.message}` : 'CHAIN_SERVER_KEY_FILE cannot be read']);
    }
};

// what loadKey answers: an object with the key hash (and its private key, not enumerable)
const isLoadedKey = key => typeof key === 'object' && key !== null && /^[0-9a-f]{56}$/.test(key.keyHash) && key.privateKey !== undefined;

/**
 * `{ enabled: false, missing }` without `config.chain` (missing: the names of the variables that
 * are not set); else `{ enabled: true, network, policyId, configRef, configPolicyId, kFinal,
 * indexMaxLagMs, provider, index, serverKey }` (configPolicyId null when not configured: the
 * config is then read by configRef alone, chain/config.js). `serverKey`: the key server.js loaded
 * (loadServerKey), required with the chain on: without it a TypeError (a programming error).
 */
const createChain = ({ config, pool, log = console, overrides = {}, serverKey }) => {
    if (!config.chain) {
        return Object.freeze({ enabled: false, missing: config.chainMissing || [] });
    }
    if (!isLoadedKey(serverKey)) {
        throw new TypeError('createChain: the server key as loadServerKey loaded it');
    }
    const { network, policyId, configRef, configPolicyId = null, kFinal, indexMaxLagMs, providerKind, providerUrl, providerKey } = config.chain;
    const provider = overrides.provider || createProvider({ kind: providerKind, url: providerUrl, key: providerKey, network, log });
    const index = overrides.index || createChainIndex({ pool, policyId, network });
    return Object.freeze({ enabled: true, network, policyId, configRef, configPolicyId, kFinal, indexMaxLagMs, provider, index, serverKey });
};

module.exports = { createChain, loadServerKey };
