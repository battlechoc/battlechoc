-- Live matches hosted by the server (phase 6). The authoritative state never leaves the
-- server: a snapshot (match + AI agents) plus the actions applied after it rebuild a running
-- match after a crash or a deploy, because the engine is deterministic.

CREATE TABLE matches (
    id TEXT PRIMARY KEY,
    -- queue, invite or ai (matchmaking fell back to an AI)
    kind TEXT NOT NULL,
    -- one player id per match player, null for an AI
    player_ids JSONB NOT NULL,
    -- running, ended
    status TEXT NOT NULL DEFAULT 'running',
    snapshot JSONB NOT NULL,
    snapshot_seq INTEGER NOT NULL DEFAULT 0,
    -- match time the match had reached (written every few seconds): timers between actions
    -- are not logged, so a recovered match is advanced to here instead of rewinding
    reached_t INTEGER NOT NULL DEFAULT 0,
    outcome JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ
);

CREATE INDEX matches_status ON matches (status);

CREATE TABLE match_actions (
    match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    t INTEGER NOT NULL,
    action JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (match_id, seq)
);
