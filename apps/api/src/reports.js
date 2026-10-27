// Problem reports that players send from the settings (game state, logs, their message). The
// privacy policy promises to delete them after 60 days: `cleanup` does, see cleanup.js.

const crypto = require('crypto');

const KEEP_MS = 60 * 24 * 60 * 60 * 1000;

const add = async (db, playerId, report) => {
    await db.query('INSERT INTO reports (id, player_id, payload) VALUES ($1, $2, $3)', [crypto.randomUUID(), playerId, JSON.stringify(report)]);
};

const cleanup = async (db, now) => {
    await db.query('DELETE FROM reports WHERE created_at <= $1', [new Date(now - KEEP_MS)]);
};

module.exports = { KEEP_MS, add, cleanup };
