-- The AI ladder (2026-11-05): a player's step against the AI (opponent and board), moved by their
-- results ({ step, wins, floor, games }, shared engine/setup.js). NULL: not played since the
-- ladder came, the step follows from the XP (engine.initialAiLadder).

ALTER TABLE players ADD COLUMN ai_ladder JSONB;
