// Other players: friends, the highscore list and ranks, lookups.

const players = require('../players');
const { HttpError, ErrorCode } = require('../errors');

const MAX_QUERY_RESULTS = 20;

/**
 * Register these after the other routes under /user: GET /user/:name would otherwise take
 * /user/pantry and /user/items.
 */
const registerSocialRoutes = (app, { pool, auth, user }) => {
    app.get('/user/friends', ...user, async (req, res) => {
        res.json(await players.friendsOf(pool, req.playerId));
    });

    app.post('/user/friend', ...user, async (req, res) => {
        const friend = await players.findPlayerByName(pool, req.body && req.body.friend);
        if (!friend || friend.id === req.playerId) {
            throw new HttpError(404, ErrorCode.PLAYER_NOT_FOUND);
        }
        await players.addFriend(pool, req.playerId, friend.id);
        res.json({});
    });

    app.delete('/user/friend', ...user, async (req, res) => {
        const friend = await players.findPlayerByName(pool, req.body && req.body.friend);
        if (!friend) {
            throw new HttpError(404, ErrorCode.PLAYER_NOT_FOUND);
        }
        await players.removeFriend(pool, req.playerId, friend.id);
        res.json({});
    });

    // null while the player has no name (only named players are on the highscore list)
    app.get('/rank', ...user, async (req, res) => {
        res.json({ ranking: await players.rankOf(pool, req.player) });
    });

    // a page of the list (default: the page of the requesting player) and the requesting
    // player's own entry (own null without a player name), so the
    // client can always show where the player stands
    app.get('/highscore', ...user, async (req, res) => {
        res.json(await players.highscore(pool, req.player, req.query.page));
    });

    app.get('/query/user/:text', auth.requireAuth, async (req, res) => {
        res.json(await players.searchByName(pool, req.params.text, MAX_QUERY_RESULTS));
    });

    app.get('/random/opponent', ...user, async (req, res) => {
        const opponent = await players.randomOpponent(pool, req.playerId);
        if (!opponent) {
            throw new HttpError(404, ErrorCode.NO_MATCHING_PLAYER);
        }
        res.json(opponent);
    });

    app.get('/user/:name', auth.requireAuth, async (req, res) => {
        const player = await players.findPlayerByName(pool, req.params.name);
        if (!player) {
            throw new HttpError(404, ErrorCode.PLAYER_NOT_FOUND);
        }
        res.json([await players.playerInfo(pool, player)]);
    });
};

module.exports = { registerSocialRoutes };
