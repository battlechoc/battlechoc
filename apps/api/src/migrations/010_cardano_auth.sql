-- Signing in with a Cardano key (2026-11): the challenges the server issued and not yet saw
-- signed (single use, a few minutes). A linked key is an identity ('cardano', 'stake:<key hash>');
-- its address is built from the hash and the server's network when it is shown.
CREATE TABLE auth_challenges (
    nonce TEXT PRIMARY KEY,
    purpose TEXT NOT NULL,
    address TEXT NOT NULL,
    -- the player a link challenge was issued to; NULL for signing in
    player_id TEXT REFERENCES players(id),
    message TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX auth_challenges_expires_at ON auth_challenges (expires_at);
