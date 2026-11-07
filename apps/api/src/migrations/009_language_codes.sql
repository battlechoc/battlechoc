-- Japanese and Vietnamese go by their language codes now (the game's first versions used the
-- country codes); the API answers a player in the language stored here.
UPDATE players SET language = 'ja' WHERE language = 'jp';
UPDATE players SET language = 'vi' WHERE language = 'vn';
