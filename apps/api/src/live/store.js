// Postgres persistence of live matches: the match row with its latest snapshot and the
// append-only action log (see migrations/002_live_matches.sql). A match is running, ended, or
// failed (it could not be rebuilt after a restart, see Lobby.recover).

const { withTransaction } = require('../db');

const json = value => JSON.stringify(value);

// matches trimmed per transaction (trimEndedBefore)
const TRIM_BATCH_SIZE = 200;

const createMatchStore = pool => ({
    create: ({ id, kind, playerIds, snapshot }) => pool.query(
        'INSERT INTO matches (id, kind, player_ids, snapshot, snapshot_seq) VALUES ($1, $2, $3, $4, 0)',
        [id, kind, json(playerIds), json(snapshot)]),

    appendAction: (matchId, seq, action) => pool.query(
        'INSERT INTO match_actions (match_id, seq, t, action) VALUES ($1, $2, $3, $4)',
        [matchId, seq, action.t, json(action)]),

    saveSnapshot: (matchId, seq, snapshot) => pool.query(
        'UPDATE matches SET snapshot = $2, snapshot_seq = $3 WHERE id = $1',
        [matchId, json(snapshot), seq]),

    finish: (matchId, seq, snapshot, outcome) => pool.query(
        "UPDATE matches SET status = 'ended', snapshot = $2, snapshot_seq = $3, outcome = $4, ended_at = NOW() WHERE id = $1",
        [matchId, json(snapshot), seq, json(outcome)]),

    reached: (matchId, t) => pool.query('UPDATE matches SET reached_t = $2 WHERE id = $1 AND reached_t < $2', [matchId, t]),

    running: async () => (await pool.query(
        "SELECT id, kind, player_ids, snapshot, snapshot_seq, reached_t FROM matches WHERE status = 'running' ORDER BY created_at")).rows,

    actionsAfter: async (matchId, seq) => (await pool.query(
        'SELECT seq, action FROM match_actions WHERE match_id = $1 AND seq > $2 ORDER BY seq', [matchId, seq])).rows,

    /**
     * A running match that cannot be rebuilt: it is over without an outcome. Its snapshot and
     * actions stay, to find out why; setting the status back to 'running' by hand makes the next
     * start try it again.
     */
    fail: (matchId, reason) => pool.query(
        "UPDATE matches SET status = 'failed', recovery_error = $2, ended_at = NOW() WHERE id = $1 AND status = 'running'",
        [matchId, reason]),

    /**
     * Removes the logged actions and empties the snapshot of the matches that were over before
     * `before` (ended or failed); the row with players and outcome stays. Resolves with the number
     * of matches trimmed. In batches, each in a transaction of its own, so a long history does not
     * hold one big transaction.
     */
    trimEndedBefore: async (before, now = new Date(), { batchSize = TRIM_BATCH_SIZE } = {}) => {
        let trimmed = 0;
        for (;;) {
            const { rows } = await pool.query(
                `SELECT id FROM matches WHERE status IN ('ended', 'failed') AND ended_at < $1 AND trimmed_at IS NULL
                 ORDER BY ended_at LIMIT $2`, [before, batchSize]);
            if (rows.length === 0) {
                return trimmed;
            }
            const ids = rows.map(row => row.id);
            // $1, $2, … (pg-mem does not take an array with = ANY)
            const list = ids.map((id, i) => `$${i + 1}`).join(', ');
            await withTransaction(pool, async client => {
                await client.query(`DELETE FROM match_actions WHERE match_id IN (${list})`, ids);
                await client.query(`UPDATE matches SET snapshot = '{}', trimmed_at = $${ids.length + 1} WHERE id IN (${list})`, [...ids, now]);
            });
            trimmed += ids.length;
        }
    },
});

module.exports = { createMatchStore };
