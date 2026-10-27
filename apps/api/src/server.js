// Entry point of the battlechoc backend: REST API and the live match WebSocket (/live) on one
// HTTP server (see deploy/docker-compose.yml for the environment).

const http = require('http');
const { createPool, migrate } = require('./db');
const { createAuth } = require('./auth');
const { createPush } = require('./push');
const { createApp } = require('./app');
const { createLive } = require('./live');
const { scheduleCleanup } = require('./cleanup');

// optional overrides of the live timings (LiveDefaults), e.g. short ones for browser tests
const liveConfig = env => Object.fromEntries([
    ['disconnectGraceMs', 'LIVE_DISCONNECT_GRACE_MS'],
    ['aiFallbackMs', 'LIVE_AI_FALLBACK_MS'],
    ['inviteTtlMs', 'LIVE_INVITE_TTL_MS'],
].filter(([, name]) => Number(env[name]) > 0).map(([key, name]) => [key, Number(env[name])]));

const main = async () => {
    const pool = createPool();
    await migrate(pool);
    const auth = createAuth({ pool, secret: process.env.JWT_SECRET });
    const push = createPush({
        pool,
        publicKey: process.env.VAPID_PUBLIC_KEY,
        privateKey: process.env.VAPID_PRIVATE_KEY,
        subject: process.env.VAPID_SUBJECT,
    });
    const corsOrigins = (process.env.CORS_ORIGINS || '').split(',').map(origin => origin.trim()).filter(Boolean);
    const app = createApp({ pool, auth, push, corsOrigins });
    const server = http.createServer(app);
    const live = createLive({ server, pool, auth, push, origins: corsOrigins, config: liveConfig(process.env) });
    const recovered = await live.recover();
    if (recovered > 0) {
        console.log(`recovered ${recovered} running matches`);
    }
    // spoiled and used-up ingredient batches and old problem reports are deleted once an hour
    const stopCleanup = scheduleCleanup(pool);
    const port = Number(process.env.PORT || 8080);
    server.listen(port, () => console.log(`battlechoc api listening on ${port}`));

    // running matches are saved and resume after the restart (clients reconnect)
    const shutdown = async () => {
        stopCleanup();
        await live.close();
        server.close(() => pool.end().then(() => process.exit(0)));
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
};

main().catch(error => {
    console.error(error);
    process.exit(1);
});
