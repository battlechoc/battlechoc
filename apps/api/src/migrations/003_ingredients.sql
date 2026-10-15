-- Ingredients replace coins (2026-10): private XP for progress, a public Glicko-2 rating from
-- verified online matches, and a pantry of ingredient batches (rare ones spoil).

ALTER TABLE players ADD COLUMN xp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN rating DOUBLE PRECISION NOT NULL DEFAULT 1500;
ALTER TABLE players ADD COLUMN rating_deviation DOUBLE PRECISION NOT NULL DEFAULT 350;
ALTER TABLE players ADD COLUMN rating_volatility DOUBLE PRECISION NOT NULL DEFAULT 0.06;
ALTER TABLE players ADD COLUMN rated_matches INTEGER NOT NULL DEFAULT 0;

ALTER TABLE track_records ADD COLUMN verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE track_records ADD COLUMN xp INTEGER NOT NULL DEFAULT 0;

-- one row per batch; expires_at NULL = never spoils
CREATE TABLE pantry (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL REFERENCES players(id),
    ingredient TEXT NOT NULL,
    amount INTEGER NOT NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX pantry_player ON pantry (player_id);

-- what each verified match gave (support and balancing)
CREATE TABLE drops (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    player_id TEXT NOT NULL REFERENCES players(id),
    ingredient TEXT NOT NULL,
    amount INTEGER NOT NULL,
    achievement TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- matches whose rating change was applied (once per match)
CREATE TABLE rated_matches (
    match_id TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- conversion of existing players
UPDATE players SET xp = score;
INSERT INTO pantry (id, player_id, ingredient, amount)
    SELECT 'coins:' || id, id, 'COCOA', coins FROM players WHERE coins > 0;
UPDATE players SET coins = 0;
