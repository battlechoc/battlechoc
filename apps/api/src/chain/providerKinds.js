// The kinds of chain provider (CHAIN_PROVIDER_KIND) and the rule that ties a kind to its URL, one
// place for the server's configuration (config.js), its providers (provider.js) and the operator
// scripts (scripts/chain/lib.js). No SDK here: config.js reads it before anything else loads.
//
// A Blockfrost URL needs the kind blockfrost and a Koios URL the kind koios. Without the rule a
// server whose .env had the Blockfrost settings from before CHAIN_PROVIDER_KIND (unset: koios)
// would send its project id as a Koios bearer token to Blockfrost, and every call would fail as
// "the key was refused" when the kind is what is wrong.

const PROVIDER_KINDS = Object.freeze(['koios', 'blockfrost']);
const DEFAULT_PROVIDER_KIND = 'koios';

/** CHAIN_PROVIDER_KIND as read: trimmed and in lower case; '' (or none) is the default, koios. */
const providerKindOf = text => (typeof text === 'string' ? text.trim().toLowerCase() : '') || DEFAULT_PROVIDER_KIND;

// whether `host` is `domain` or one of its subdomains
const isHostOf = (host, domain) => host === domain || host.endsWith(`.${domain}`);

// the kind a URL's host belongs to, null for any other host; a fully qualified host (one
// trailing dot, `blockfrost.io.`) is the same host
const kindOfUrl = url => {
    let host;
    try {
        host = new URL(url).hostname.toLowerCase().replace(/\.$/, '');
    } catch {
        return null;
    }
    if (isHostOf(host, 'blockfrost.io')) {
        return 'blockfrost';
    }
    return isHostOf(host, 'koios.rest') ? 'koios' : null;
};

/**
 * What is wrong with the kind `kind` (providerKindOf's) for the provider URL `url`: a message that
 * names CHAIN_PROVIDER_KIND and neither value (a value in the wrong variable may be the key), or
 * null. `url` may be undefined (not set yet): then only the kind itself is judged.
 */
const providerKindProblem = (kind, url) => {
    if (!PROVIDER_KINDS.includes(kind)) {
        return 'CHAIN_PROVIDER_KIND is unknown: it must be koios or blockfrost (or not set: koios)';
    }
    const ofUrl = url === undefined ? null : kindOfUrl(url);
    if (ofUrl === 'blockfrost' && kind !== 'blockfrost') {
        return 'CHAIN_PROVIDER_KIND must be blockfrost for a Blockfrost URL (CHAIN_PROVIDER_URL): set CHAIN_PROVIDER_KIND=blockfrost';
    }
    if (ofUrl === 'koios' && kind !== 'koios') {
        return 'CHAIN_PROVIDER_KIND must be koios (or not set) for a Koios URL (CHAIN_PROVIDER_URL)';
    }
    return null;
};

module.exports = { DEFAULT_PROVIDER_KIND, PROVIDER_KINDS, providerKindOf, providerKindProblem };
