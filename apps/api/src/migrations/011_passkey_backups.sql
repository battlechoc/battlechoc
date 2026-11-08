-- Passkey backups of the recovery words (2026-11, plan 2 of the Cardano sign-in): the words,
-- encrypted on the device with a key only the player's passkey can give (WebAuthn PRF), stored
-- per passkey (credential id) for the key (`subject`) they belong to. The server cannot read them.
CREATE TABLE passkey_backups (
    credential_id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL REFERENCES players(id),
    subject TEXT NOT NULL,
    iv TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX passkey_backups_player ON passkey_backups (player_id);

-- a session signed in with a Cardano key remembers it: removing the key ends those sessions
-- (words that leaked must not keep a way in)
ALTER TABLE sessions ADD COLUMN subject TEXT;
-- why a session ended: 'key-removed' (the game then forgets the removed key's words)
ALTER TABLE sessions ADD COLUMN revoked_reason TEXT;
