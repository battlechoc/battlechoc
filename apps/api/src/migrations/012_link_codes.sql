-- Link codes (plan 3, 2026-11): a phone's wallet opens battlechoc's link page in its own browser,
-- which shares nothing with the game. A code (kept only as its SHA-256 hash, 10 minutes, one per
-- player) ties that page to the device's player; the game polls the code's state:
-- 'open' → 'busy' (a signature is being handled) → 'linked' (subject), 'known' (another player's wallet: owner_id and subject, the session is
-- made when the game polls), 'confirm' (a player with keys and no proof), 'failed' (error).
CREATE TABLE link_codes (
    code_hash TEXT PRIMARY KEY,
    player_id TEXT NOT NULL REFERENCES players(id),
    purpose TEXT NOT NULL,
    -- until when a key change counts as proved for this code (the confirm token's own expiry)
    confirmed_until TIMESTAMPTZ,
    state TEXT NOT NULL DEFAULT 'open',
    subject TEXT,
    owner_id TEXT REFERENCES players(id),
    error TEXT,
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX link_codes_player_id ON link_codes (player_id);
CREATE INDEX link_codes_expires_at ON link_codes (expires_at);
-- a challenge the link page asked for with a code
ALTER TABLE auth_challenges ADD COLUMN link_code_hash TEXT;
