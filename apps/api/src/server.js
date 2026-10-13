// Entry point of the battlechoc backend (see deploy/docker-compose.yml for the environment).

const http = require('http');
const { createPool, migrate } = require('./db');
const { createAuth } = require('./auth');
const { createPush } = require('./push');
const { createApp } = require('./app');

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
    const port = Number(process.env.PORT || 8080);
    server.listen(port, () => console.log(`battlechoc api listening on ${port}`));

    const shutdown = () => {
        server.close(() => pool.end().then(() => process.exit(0)));
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
};

main().catch(error => {
    console.error(error);
    process.exit(1);
});
