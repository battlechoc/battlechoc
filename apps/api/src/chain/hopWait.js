// The wallet hop wait (spec 2): the tokens in a wallet that was linked to another player count for
// the player who has it now only WALLET_HOP_WAIT_MS after that player's first link since the other
// player's, so a wallet passed on carries no items into a match at once. The wait runs from the
// first link, not the newest: unlinking and linking again neither restarts nor ends it. A wallet
// that was never another player's counts at once. The history is identity_history (written by
// cardano.linkIdentity and players.removeIdentity).

const { chain: rules } = require('@battlechoc/battlechoc-shared-functions');

/** The most subjects one linkedPlayers call takes (the caller batches). */
const MAX_SUBJECTS = 500;

/**
 * When the tokens of `subject` start to count for `playerId` (ms), or null: at once, or not at
 * all because the subject is not linked to that player now. `history`: the subject's rows
 * [{ playerId, linkedAt, unlinkedAt }] (ms; unlinkedAt null while linked), in any order; rows that
 * carry another `subject` are left out.
 */
const hopWaitUntil = (history, subject, playerId, waitMs) => {
    const rows = history.filter(row => typeof row.subject === 'undefined' || row.subject === subject);
    const own = rows.filter(row => row.playerId === playerId);
    const current = own.filter(row => row.unlinkedAt === null).reduce((latest, row) => (!latest || row.linkedAt > latest.linkedAt ? row : latest), null);
    if (!current) {
        return null;
    }
    const lastOther = rows.filter(row => row.playerId !== playerId && row.linkedAt < current.linkedAt)
        .reduce((latest, row) => (!latest || row.linkedAt > latest.linkedAt ? row : latest), null);
    if (!lastOther) {
        return null;
    }
    // current is one of them, so there is a first
    const first = own.filter(row => row.linkedAt > lastOther.linkedAt).reduce((earliest, row) => (row.linkedAt < earliest.linkedAt ? row : earliest));
    return first.linkedAt + waitMs;
};

const placeholders = values => values.map((value, i) => `$${i + 1}`).join(', ');
const millis = value => (value === null ? null : new Date(value).getTime());

/**
 * The players `subjects` (Cardano subjects, 'stake:…' / 'pay:…'; up to MAX_SUBJECTS, else a
 * RangeError) are linked to, at `now` (ms): Map of subject → { playerId, waitUntil }, with
 * waitUntil the end of the hop wait while it is still ahead of `now`, else null. A subject linked
 * to nobody is not in the map. Two queries, whatever the number of subjects.
 */
const linkedPlayers = async (db, subjects, now) => {
    if (!Array.isArray(subjects) || !subjects.every(subject => typeof subject === 'string')) {
        throw new TypeError('linkedPlayers: a list of subjects');
    }
    if (!Number.isFinite(now)) {
        throw new TypeError('linkedPlayers: now in milliseconds');
    }
    if (subjects.length > MAX_SUBJECTS) {
        throw new RangeError(`linkedPlayers: at most ${MAX_SUBJECTS} subjects per call`);
    }
    const wanted = [...new Set(subjects)];
    const linked = new Map();
    if (wanted.length === 0) {
        return linked;
    }
    const identities = await db.query(
        `SELECT subject, player_id FROM identities WHERE provider = 'cardano' AND subject IN (${placeholders(wanted)})`, wanted);
    if (identities.rows.length === 0) {
        return linked;
    }
    const history = await db.query(
        `SELECT subject, player_id, linked_at, unlinked_at FROM identity_history WHERE subject IN (${placeholders(wanted)})`, wanted);
    const rows = history.rows.map(row => ({ subject: row.subject, playerId: row.player_id, linkedAt: millis(row.linked_at), unlinkedAt: millis(row.unlinked_at) }));
    identities.rows.forEach(({ subject, player_id: playerId }) => {
        const until = hopWaitUntil(rows, subject, playerId, rules.WALLET_HOP_WAIT_MS);
        linked.set(subject, { playerId, waitUntil: until !== null && until > now ? until : null });
    });
    return linked;
};

module.exports = { MAX_SUBJECTS, hopWaitUntil, linkedPlayers };
