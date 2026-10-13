// Web Push (VAPID) without Firebase: subscriptions are stored per player; subscriptions the
// browser vendor reports as gone (404/410) are removed.

const webpush = require('web-push');

const createPush = ({ pool, publicKey, privateKey, subject, sender = webpush }) => {
    const enabled = Boolean(publicKey && privateKey);
    if (enabled) {
        sender.setVapidDetails(subject || 'mailto:info@battlechoc.dev', publicKey, privateKey);
    }

    const subscribe = async (playerId, subscription) => {
        if (!subscription || typeof subscription.endpoint !== 'string' || !subscription.keys ||
            typeof subscription.keys.p256dh !== 'string' || typeof subscription.keys.auth !== 'string') {
            return false;
        }
        await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [subscription.endpoint]);
        await pool.query('INSERT INTO push_subscriptions (endpoint, player_id, keys) VALUES ($1, $2, $3)',
            [subscription.endpoint, playerId, JSON.stringify(subscription.keys)]);
        return true;
    };

    const unsubscribe = (playerId, endpoint) => pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND player_id = $2', [endpoint, playerId]);

    // sends a notification to all devices of a player; returns the number of deliveries
    const sendToPlayer = async (playerId, payload, { ttl = 60, urgency = 'normal', topic } = {}) => {
        if (!enabled) {
            return 0;
        }
        const { rows } = await pool.query('SELECT endpoint, keys FROM push_subscriptions WHERE player_id = $1', [playerId]);
        let delivered = 0;
        for (const row of rows) {
            try {
                await sender.sendNotification({ endpoint: row.endpoint, keys: row.keys }, JSON.stringify(payload), { TTL: ttl, urgency, topic });
                delivered += 1;
            } catch (error) {
                if (error.statusCode === 404 || error.statusCode === 410) {
                    await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [row.endpoint]);
                }
            }
        }
        return delivered;
    };

    return { enabled, publicKey, subscribe, unsubscribe, sendToPlayer };
};

module.exports = { createPush };
