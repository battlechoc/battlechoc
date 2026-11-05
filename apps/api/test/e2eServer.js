// The backend as the browser tests run it (apps/pwa/playwright.config.js): the real server plus a
// route the game never has. It stocks a player's pantry the way drops of won matches would (rum
// is a rare drop, and the starter kit alone crafts nothing). Only against the in-memory database;
// the image holds src/ only (Dockerfile).

const express = require('express');
const pantry = require('../src/pantry');
const { main } = require('../src/server');

if (process.env.DATABASE_URL !== 'memory') {
    console.error('the test server runs only with DATABASE_URL=memory');
    process.exit(1);
}

const withTestRoutes = (app, { pool }) => {
    const outer = express();
    outer.post('/test/pantry', express.json(), async (req, res) => {
        const { username, items } = req.body || {};
        const { rows } = await pool.query('SELECT id FROM players WHERE username_lower = $1', [String(username).toLowerCase()]);
        if (rows.length === 0 || !Array.isArray(items)) {
            res.status(400).json({ error: 'INVALID REQUEST PARAMETERS' });
            return;
        }
        await pantry.add(pool, rows[0].id, items, Date.now());
        res.json({ pantry: await pantry.totals(pool, rows[0].id, Date.now()) });
    });
    outer.use(app);
    return outer;
};

main({ wrap: withTestRoutes }).catch(error => {
    console.error(error);
    process.exit(1);
});
