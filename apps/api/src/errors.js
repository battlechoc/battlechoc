// The errors the REST API answers with. A route throws an HttpError and the error middleware
// (middleware.js) turns it into the response `{ "error": <code> }` with its status.

// The codes are what the clients get, character for character: installed games (also old cached
// versions) match on them, e.g. on "MISSING INGREDIENTS". The three of the authentication are in
// lower case because the first clients got them that way.
const ErrorCode = Object.freeze({
    MISSING_ACCESS_TOKEN: 'missing access token',
    INVALID_ACCESS_TOKEN: 'invalid access token',
    INVALID_REFRESH_TOKEN: 'invalid refresh token',
    // a refresh token whose session ended because the key that signed it in was removed
    SESSION_ENDED: 'session ended',

    NOT_FOUND: 'NOT FOUND',
    INVALID_JSON: 'INVALID JSON',
    TOO_MANY_REQUESTS: 'TOO MANY REQUESTS',
    INTERNAL_SERVER_ERROR: 'INTERNAL SERVER ERROR',
    INVALID_REQUEST_PARAMETERS: 'INVALID REQUEST PARAMETERS',

    PLAYER_NOT_FOUND: 'PLAYER NOT FOUND',
    UNKNOWN_TUTORIAL_STEP: 'UNKNOWN TUTORIAL STEP',
    USERNAME_NOT_VALID: 'USERNAME NOT VALID',
    USERNAME_TAKEN: 'PLAYER WITH GIVEN NAME DOES ALREADY EXIST',
    INVALID_LANGUAGE: 'INVALID LANGUAGE GIVEN',
    INVALID_REPORT: 'INVALID REPORT',
    INVALID_SUBSCRIPTION: 'INVALID SUBSCRIPTION',

    MISSING_INGREDIENTS: 'MISSING INGREDIENTS',
    TOO_MANY_TRIES: 'TOO MANY TRIES',
    RECIPE_NOT_DISCOVERED: 'RECIPE NOT DISCOVERED',
    NOT_ENOUGH_INGREDIENTS: 'NOT ENOUGH INGREDIENTS',
    NOT_YOUR_ITEM: 'NOT YOUR ITEM',
    WRONG_BUILDING: 'WRONG BUILDING',
    ALREADY_ON_THIS_BUILDING: 'ALREADY ON THIS BUILDING',
    OVER_BUDGET: 'OVER BUDGET',
    // salvaging an item whose recipe is no longer in the recipe table
    NO_RECIPE: 'NO RECIPE',
    // salvaging a minted item plainly (409): its token is on the chain (plan E salvages it by burning)
    ITEM_MINTED: 'ITEM MINTED',
    // signing in with a Cardano key (routes/cardano.js)
    CHALLENGE_EXPIRED: 'CHALLENGE EXPIRED',
    INVALID_SIGNATURE: 'INVALID SIGNATURE',
    WRONG_NETWORK: 'WRONG NETWORK',
    UNKNOWN_IDENTITY: 'UNKNOWN IDENTITY',
    // a link code (plan 3) that is unknown, expired, replaced or another player's
    UNKNOWN_LINK_CODE: 'UNKNOWN LINK CODE',
    IDENTITY_TAKEN: 'IDENTITY TAKEN',
    LAST_IDENTITY: 'LAST IDENTITY',
    CONFIRMATION_REQUIRED: 'CONFIRMATION REQUIRED',
    NOT_YOUR_KEY: 'NOT YOUR KEY',
    TOO_MANY_PASSKEYS: 'TOO MANY PASSKEYS',
    PASSKEY_TAKEN: 'PASSKEY TAKEN',
    // the items on the chain (minting plan D, routes/chain.js); their statuses are CHAIN_STATUS's
    CHAIN_OFF: 'CHAIN OFF',
    CHAIN_UNAVAILABLE: 'CHAIN UNAVAILABLE',
    CHAIN_PAUSED: 'CHAIN PAUSED',
    NOT_ENOUGH_MATCHES: 'NOT ENOUGH MATCHES',
    MINT_LIMIT: 'MINT LIMIT',
    OPERATION_RUNNING: 'OPERATION RUNNING',
    ITEM_BUSY: 'ITEM BUSY',
    ALREADY_MINTED: 'ALREADY MINTED',
    NOT_YOUR_WALLET: 'NOT YOUR WALLET',
    WALLET_WAITING: 'WALLET WAITING',
    // with `missing` and `needed` (lovelace strings) beside the code
    NOT_ENOUGH_ADA: 'NOT ENOUGH ADA',
    // the wallet has the ADA, but nothing the transaction can take as its collateral
    NO_COLLATERAL: 'NO COLLATERAL',
    // the wallet holds so many tokens that the transaction (the change carries them) is too large
    WALLET_TOO_FULL: 'WALLET TOO FULL',
    UNKNOWN_FEE: 'UNKNOWN FEE',
    UNKNOWN_SIGN_CODE: 'UNKNOWN SIGN CODE',
    INVALID_WITNESS: 'INVALID WITNESS',
    OPERATION_NOT_OPEN: 'OPERATION NOT OPEN',
    // the operation's owner address was chosen by the server alone: the wallet must name (and,
    // without the player's session, sign for) its addresses first
    ADDRESSES_NEEDED: 'ADDRESSES NEEDED',
});

// The status of each code of the chain routes, in one place: the game tells "try later" (503)
// from "not you" (403) and "not now" (409) by it.
const CHAIN_STATUS = Object.freeze({
    [ErrorCode.CHAIN_OFF]: 404,
    [ErrorCode.CHAIN_UNAVAILABLE]: 503,
    [ErrorCode.CHAIN_PAUSED]: 503,
    [ErrorCode.NOT_ENOUGH_MATCHES]: 403,
    [ErrorCode.MINT_LIMIT]: 409,
    [ErrorCode.OPERATION_RUNNING]: 409,
    [ErrorCode.ITEM_BUSY]: 409,
    [ErrorCode.ALREADY_MINTED]: 409,
    [ErrorCode.NOT_YOUR_WALLET]: 400,
    [ErrorCode.WALLET_WAITING]: 409,
    [ErrorCode.NOT_ENOUGH_ADA]: 400,
    [ErrorCode.NO_COLLATERAL]: 400,
    [ErrorCode.WALLET_TOO_FULL]: 400,
    [ErrorCode.UNKNOWN_FEE]: 400,
    [ErrorCode.UNKNOWN_SIGN_CODE]: 404,
    [ErrorCode.INVALID_WITNESS]: 400,
    [ErrorCode.OPERATION_NOT_OPEN]: 409,
    [ErrorCode.ADDRESSES_NEEDED]: 409,
});

class HttpError extends Error {
    /**
     * @param {number} status HTTP status of the response
     * @param {string} code one of ErrorCode, the `error` of the response body
     * @param {object} [details] fields the body carries after `error` (e.g. NOT ENOUGH ADA's
     *   `missing`), JSON values only and never an `error` of their own
     */
    constructor(status, code, details) {
        super(code);
        if (details !== undefined && (details === null || typeof details !== 'object' || Object.prototype.hasOwnProperty.call(details, 'error'))) {
            throw new TypeError('HttpError: details are an object without an `error`');
        }
        this.status = status;
        this.code = code;
        if (details !== undefined) {
            this.details = details;
        }
    }
}

/** The HttpError of a chain route's `code` (one of CHAIN_STATUS's) with its status, and `details`. */
const chainError = (code, details) => {
    if (!Object.prototype.hasOwnProperty.call(CHAIN_STATUS, code)) {
        throw new TypeError(`chainError: no chain code: ${code}`);
    }
    return new HttpError(CHAIN_STATUS[code], code, details);
};

/** The body of an HttpError's response: `{ error: <code> }`, then its details. */
const bodyOf = error => ({ error: error.code, ...error.details });

module.exports = { HttpError, ErrorCode, CHAIN_STATUS, chainError, bodyOf };
