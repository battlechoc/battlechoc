-- players: one per account, independent of how they log in (see identities)
CREATE TABLE players (
    id TEXT PRIMARY KEY,
    -- NULL until the player picks a name (shown as 'Chocnonymous')
    username TEXT,
    username_lower TEXT UNIQUE,
    coins INTEGER NOT NULL DEFAULT 0,
    score INTEGER NOT NULL DEFAULT 0,
    level JSONB NOT NULL,
    tutorial_started BOOLEAN NOT NULL DEFAULT FALSE,
    tutorial_skipped BOOLEAN NOT NULL DEFAULT FALSE,
    tutorial_finished BOOLEAN NOT NULL DEFAULT FALSE,
    language TEXT NOT NULL DEFAULT 'en',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- logins of a player: 'device' today, 'wallet' in the web3 stage
CREATE TABLE identities (
    provider TEXT NOT NULL,
    subject TEXT NOT NULL,
    player_id TEXT NOT NULL REFERENCES players(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (provider, subject)
);

-- refresh tokens (stored as SHA-256 hashes)
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL REFERENCES players(id),
    token_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE friends (
    player_id TEXT NOT NULL REFERENCES players(id),
    friend_id TEXT NOT NULL REFERENCES players(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (player_id, friend_id)
);

-- finished matches of a player (statistics, outcome, awards)
CREATE TABLE track_records (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL REFERENCES players(id),
    record JSONB NOT NULL,
    -- won, lost, draw or open
    result TEXT NOT NULL,
    coins INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    player_id TEXT NOT NULL REFERENCES players(id),
    keys JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE reports (
    id TEXT PRIMARY KEY,
    player_id TEXT,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
