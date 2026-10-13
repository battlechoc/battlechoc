// Postgres persistence of live matches: the match row with its latest snapshot and the
// append-only action log (see migrations/002_live_matches.sql).

const json = value => JSON.stringify(value);

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
});

module.exports = { createMatchStore };
