-- A player's records are read by player: won, drawn and lost matches for the stats and the
-- player infos (players.js), the verified matches of the day for the drops (rewards.js). The
-- table had only its primary key, so each of these read every record of every player.

CREATE INDEX track_records_player_result ON track_records (player_id, result);
