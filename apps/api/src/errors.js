// The errors the REST API answers with. A route throws an HttpError and the error middleware
// (middleware.js) turns it into the response `{ "error": <code> }` with its status.

// The codes are what the clients get, character for character: installed games (also old cached
// versions) match on them, e.g. on "MISSING INGREDIENTS". The three of the authentication are in
// lower case because the first clients got them that way.
const ErrorCode = Object.freeze({
    MISSING_ACCESS_TOKEN: 'missing access token',
    INVALID_ACCESS_TOKEN: 'invalid access token',
    INVALID_REFRESH_TOKEN: 'invalid refresh token',

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
    NO_MATCHING_PLAYER: 'NO MATCHING PLAYER FOUND',
    INVALID_SUBSCRIPTION: 'INVALID SUBSCRIPTION',

    MISSING_INGREDIENTS: 'MISSING INGREDIENTS',
    TOO_MANY_TRIES: 'TOO MANY TRIES',
    RECIPE_NOT_DISCOVERED: 'RECIPE NOT DISCOVERED',
    NOT_ENOUGH_INGREDIENTS: 'NOT ENOUGH INGREDIENTS',
    NOT_YOUR_ITEM: 'NOT YOUR ITEM',
    WRONG_BUILDING: 'WRONG BUILDING',
    ALREADY_ON_THIS_BUILDING: 'ALREADY ON THIS BUILDING',
    OVER_BUDGET: 'OVER BUDGET',
});

class HttpError extends Error {
    /**
     * @param {number} status HTTP status of the response
     * @param {string} code one of ErrorCode, the `error` of the response body
     */
    constructor(status, code) {
        super(code);
        this.status = status;
        this.code = code;
    }
}

module.exports = { HttpError, ErrorCode };
