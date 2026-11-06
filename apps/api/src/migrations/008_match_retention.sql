-- What becomes of matches that are over (2026-11).
--
-- trimmed_at: when the retention cleanup removed the logged actions and emptied the snapshot of a
-- match (store.trimEndedBefore; only with MATCH_RETENTION_DAYS set). NULL: the match is complete.
--
-- recovery_error: why a running match could not be rebuilt after a restart. Such a match gets the
-- status 'failed' (next to running and ended) and is not tried again on every start.

ALTER TABLE matches ADD COLUMN trimmed_at TIMESTAMPTZ;
ALTER TABLE matches ADD COLUMN recovery_error TEXT;
