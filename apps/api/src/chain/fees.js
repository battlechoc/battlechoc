// The battlechoc fee of a mint, from the config's fee options (pure: no chain, no SDK). A receiver
// is due exactly what the items validator demands (contracts/lib/battlechoc/rules.ak `fee_due`):
// the floor of its share of the tier's amount, and the first receiver also gets what the floors
// leave over, so the dues add up to the amount.
//
// ChainTxError lives here, the module tx.js builds on, so both throw the same class; tx.js
// exports it.

const { chain } = require('@battlechoc/battlechoc-shared-functions');

/**
 * A transaction the API cannot build or accept for this player; `code` says why (the message is
 * only the code). NOT_ENOUGH_ADA carries `missing` (lovelace); BUILD_FAILED carries the SDK's
 * message as `cause`, for the logs, never for players.
 */
class ChainTxError extends Error {
    constructor(code, { missing, cause } = {}) {
        super(code);
        this.name = 'ChainTxError';
        this.code = code;
        if (missing !== undefined) {
            this.missing = missing;
        }
        if (cause !== undefined) {
            this.cause = cause;
        }
    }
}

const isIndex = (value, length) => Number.isInteger(value) && value >= 0 && value < length;

/** The fee options of `config` as the readiness answer lists them: [{ asset, amounts }], in order. */
const gameFeesOf = config => config.fees.map(({ asset, amounts }) => ({ asset, amounts: [...amounts] }));

/**
 * The fee of minting an item of tier `tier` (an index of TIER_ORDER) with the option `fee` (an
 * index of the config's fees): { asset, amount, payments: [{ address, amount }] } with one payment
 * per receiver, in the option's order; null when the config has no fees. NO_SUCH_TIER,
 * NO_SUCH_FEE.
 */
const gameFeeOf = (config, { tier, fee }) => {
    if (!isIndex(tier, chain.TIER_ORDER.length)) {
        throw new ChainTxError('NO_SUCH_TIER');
    }
    if (config.fees.length === 0) {
        return null;
    }
    if (!isIndex(fee, config.fees.length)) {
        throw new ChainTxError('NO_SUCH_FEE');
    }
    const { asset, amounts, receivers } = config.fees[fee];
    const amount = amounts[tier];
    const total = receivers.reduce((sum, receiver) => sum + receiver.share, 0);
    // BigInt for the products: amount × share may pass Number.MAX_SAFE_INTEGER
    const dues = receivers.map(({ share }) => Number((BigInt(amount) * BigInt(share)) / BigInt(total)));
    const others = dues.slice(1).reduce((sum, due) => sum + due, 0);
    return {
        asset,
        amount,
        payments: receivers.map(({ address }, i) => ({ address, amount: i === 0 ? amount - others : dues[i] })),
    };
};

module.exports = { ChainTxError, gameFeesOf, gameFeeOf };
