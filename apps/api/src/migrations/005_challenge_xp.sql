-- Challenges (2026-11): the XP a player got from challenge matches. Until they unlock online play
-- themselves, matches against the AI are set up without it (the beginner track).

ALTER TABLE players ADD COLUMN challenge_xp INTEGER NOT NULL DEFAULT 0;
