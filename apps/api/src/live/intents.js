// Validates the shape of a match action ({ type, payload }) sent by a client and keeps only
// the fields the engine reads. The rules engine then decides whether the action is allowed;
// the player and the time are always set by the room, never taken from the message.

const { engine, AttackType, isDonut } = require('@battlechoc/battlechoc-shared-functions');

const { MatchActionTypes, BUILDABLE } = engine;

const isIndex = (value, size) => Number.isInteger(value) && value >= 0 && value < size;

const position = (payload, size) => (isIndex(payload.row, size.rows) && isIndex(payload.col, size.cols)
    ? { row: payload.row, col: payload.col }
    : null);

const payloads = {
    [MatchActionTypes.chooseField]: payload => (payload.fieldIndex === 0 || payload.fieldIndex === 1 ? { fieldIndex: payload.fieldIndex } : null),
    [MatchActionTypes.placeFactory]: (payload, size) => position(payload, size),
    [MatchActionTypes.build]: (payload, size) => {
        const at = position(payload, size);
        return at && BUILDABLE.includes(payload.entityType) ? { entityType: payload.entityType, ...at } : null;
    },
    [MatchActionTypes.placeDonut]: (payload, size) => {
        const at = position(payload, size);
        return at && typeof payload.donutType === 'string' && isDonut(payload.donutType) ? { donutType: payload.donutType, ...at } : null;
    },
    [MatchActionTypes.attack]: (payload, size) => {
        const at = position(payload, size);
        return at && AttackType.isInstanceOf(payload.attackType)
            ? { attackType: payload.attackType, ...at, allowRush: payload.allowRush === true }
            : null;
    },
    [MatchActionTypes.surrender]: () => ({}),
};

/** @returns {{type: string, payload: object} | null} */
const sanitizeIntent = (action, size) => {
    if (!action || typeof action !== 'object') {
        return null;
    }
    const toPayload = typeof action.type === 'string' && Object.prototype.hasOwnProperty.call(payloads, action.type)
        ? payloads[action.type]
        : null;
    if (!toPayload) {
        return null;
    }
    const raw = action.payload && typeof action.payload === 'object' && !Array.isArray(action.payload) ? action.payload : {};
    const payload = toPayload(raw, size);
    return payload ? { type: action.type, payload } : null;
};

module.exports = { sanitizeIntent };
