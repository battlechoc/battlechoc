// The Cardano networks battlechoc can run on. The API (CARDANO_NETWORK) and the game
// (VITE_CARDANO_NETWORK) name one of them; everything network-specific is read from it.

const Networks = Object.freeze({
    preprod: Object.freeze({ name: 'preprod', networkId: 0 }),
    mainnet: Object.freeze({ name: 'mainnet', networkId: 1 }),
});

/** The network of that name, null for any other value. */
const networkOf = name => (Object.prototype.hasOwnProperty.call(Networks, name) ? Networks[name] : null);

module.exports = { Networks, networkOf };
