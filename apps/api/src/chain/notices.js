// The notices of minted items that arrived in or departed from a player's wallet (item_notices,
// kind 'arrived' | 'departed'), written by the ownership sync in the transaction that moves the
// item. A notice the player has not seen yet is withdrawn instead of being followed by its
// opposite: a transfer seen at depth 0 and then rolled back leaves no "departed, arrived" pair.

const crypto = require('crypto');
const players = require('../players');

/** The entity type whose slots in `equipment` (players.equipment) hold `itemId`, null when none does. */
const buildingOf = (equipment, itemId) => {
    const found = Object.entries(players.equipmentOf({ equipment })).find(([, slots]) => Array.isArray(slots) && slots.includes(itemId));
    return found ? found[0] : null;
};

// deletes the unseen notices of `kind` of `playerId` for the item: whether there was one
const withdraw = async (db, { playerId, itemId, kind }) =>
    (await db.query('DELETE FROM item_notices WHERE player_id = $1 AND item_id = $2 AND kind = $3 AND seen_at IS NULL RETURNING id', [playerId, itemId, kind])).rows.length > 0;

const write = (db, { playerId, itemId, kind, building, now }) =>
    db.query('INSERT INTO item_notices (id, player_id, item_id, kind, building, created_at) VALUES ($1, $2, $3, $4, $5, $6)', [
        crypto.randomUUID(),
        playerId,
        itemId,
        kind,
        building,
        new Date(now),
    ]);

/**
 * The notices of `item` ({ id }) going from the player `from` to the player `to` (either null:
 * nobody), on `db` (the sync's transaction), at `now` (ms):
 * - `from` loses it and the token moved (`holderMoved`: an unlinked key or a hop wait is no move):
 *   a `departed` notice for `from` with `building` (the entity type of the slot it was in, or
 *   null); unless `from` has an unseen `arrived` notice for it, which is deleted instead;
 * - `to` gains it: an `arrived` notice for `to`, unless `to` has an unseen `departed` notice for
 *   it, which is deleted instead.
 * Nothing for nobody, nothing when `from` and `to` are the same.
 */
const noticeChange = async (db, { item, from, to, holderMoved, building, now }) => {
    if (from !== null && to !== from && holderMoved) {
        if (!(await withdraw(db, { playerId: from, itemId: item.id, kind: 'arrived' }))) {
            await write(db, { playerId: from, itemId: item.id, kind: 'departed', building, now });
        }
    }
    if (to !== null && to !== from) {
        if (!(await withdraw(db, { playerId: to, itemId: item.id, kind: 'departed' }))) {
            await write(db, { playerId: to, itemId: item.id, kind: 'arrived', building: null, now });
        }
    }
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** How long a seen notice is kept, and any notice at most. */
const SEEN_KEEP_MS = 30 * DAY_MS;
const KEEP_MS = 180 * DAY_MS;

/** Deletes the notices seen more than SEEN_KEEP_MS before `now` (ms) and any older than KEEP_MS (cleanup.js). */
const cleanupNotices = async (db, now) => {
    await db.query('DELETE FROM item_notices WHERE seen_at < $1 OR created_at < $2', [new Date(now - SEEN_KEEP_MS), new Date(now - KEEP_MS)]);
};

module.exports = { SEEN_KEEP_MS, KEEP_MS, buildingOf, noticeChange, cleanupNotices };
