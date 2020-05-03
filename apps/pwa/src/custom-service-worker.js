importScripts('https://www.gstatic.com/firebasejs/7.14.2/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/7.14.2/firebase-messaging.js');

const firebaseConfig = {
    apiKey: "***REMOVED***",
    authDomain: "battlechoc.firebaseapp.com",
    databaseURL: "https://battlechoc.firebaseio.com",
    projectId: "battlechoc",
    storageBucket: "battlechoc.appspot.com",
    messagingSenderId: "618424349380",
    appId: "1:618424349380:web:8880b60bbdd61aaf360f91"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.setBackgroundMessageHandler(function (payload) {
    const notificationOptions = {
        body: payload.data.text,
        icon: 'images/battlechoc-notification-icon.png',
        data: { reason: payload.data.reason, click_action: payload.data.click_action, session: payload.data.session }
    };
    return self.registration.showNotification(payload.data.title, notificationOptions);
});

self.addEventListener('notificationclick', function (event) {
    // Android doesn't close the notification when you click on it  
    // See: http://crbug.com/463146  
    event.notification.close();
    console.log(event);

    const originalUrl = "https://battlechoc.com/";
    const originalUrlDev = "https://battlechoc.dev/";

    event.waitUntil(
        clients.matchAll({
            type: "window"
        }).then(clientList => {
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                console.log(client.url);
                console.log(originalUrl);
                if (client.url === originalUrl || client.url === originalUrlDev) {
                    console.log("navigating and focusing");
                    return client.navigate(event.notification.data.click_action)
                        .then(client => client.focus());
                }
            }

            console.log("did not find original url trying to open new window");
            if (clients.openWindow) {
                console.log("openwindow");
                return clients.openWindow(event.notification.data.click_action);
            }
        })
    );
});

workbox.core.skipWaiting();
workbox.core.clientsClaim();

// NEXT REVISION will replaced by $CI_PIPELINE_ID within the GitLab build process
workbox.precaching.precacheAndRoute((self.__precacheManifest || []).concat([
    { url: '/', revision: 'NEXT_REVISION' },
    { url: '/index.html?app_runs_as=pwa&app_version=1', revision: 'NEXT_REVISION' },
    { url: '/manifest.json', revision: 'NEXT_REVISION' },
    { url: '/sound/attack_bunny.mp3', revision: '2' },
    { url: '/sound/attack_explosion.mp3', revision: '2' },
    { url: '/sound/bunny_caught.mp3', revision: '2' },
    { url: '/sound/ui_accept.mp3', revision: '2' },
    { url: '/sound/ui_build.mp3', revision: '2' },
    { url: '/music/CacaoLiving.mp3', revision: '2' },
    { url: '/models/cacaotree.glb', revision: '2' },
    { url: '/models/cannon.glb', revision: '2' },
    { url: '/models/chocolateFountain.glb', revision: '2' },
    { url: '/models/cream.glb', revision: '2' },
    { url: '/models/creamAroundBuilding.glb', revision: '2' },
    { url: '/models/factory.glb', revision: '2' },
    { url: '/models/factoryExtension.glb', revision: '2' },
    { url: '/models/field.glb', revision: '2' },
    { url: '/models/fruitCannon.glb', revision: '2' },
    { url: '/models/hotChocolateBallista.glb', revision: '2' },
    { url: '/models/spyingEasterBunny.glb', revision: '2' },
    { url: '/models/xmasFactory.glb', revision: '2' },
    { url: '/images/attacksPerTurn.png', revision: '2' },
    { url: '/images/buildingsPerTurn.png', revision: '2' },
    { url: '/images/cacao_no_background.png', revision: '2' },
    { url: '/images/creamAtField.png', revision: '2' },
    { url: '/images/spyAttacksPerTurn.png', revision: '2' },
    { url: '/images/background.jpg', revision: '2' },
    { url: '/images/bunnyCaught.png', revision: '2' },
    { url: '/images/coins.png', revision: '2' },
    { url: '/images/cream_preview.png', revision: '2' },
    { url: '/images/logo.webp', revision: '2' },
    { url: '/images/toolbar_icon_palette.png', revision: '2' },
    { url: '/images/background.webp', revision: '2' },
    { url: '/images/cacaoPerTurn.png', revision: '2' },
    { url: '/images/coins.webp', revision: '2' },
    { url: '/images/logo.png', revision: '2' },
    { url: '/images/raindrop.png', revision: '2' },
    { url: '/images/donut_icon_palette.png', revision: '2' },
    { url: '/images/toolbar_icon_palette.webp', revision: '2' },
    { url: '/animations/loading.gif', revision: '2' }
]));

workbox.precaching.precacheAndRoute([]);

workbox.routing.registerRoute(
    '/\.(?:js|css|html)$/',
    new workbox.strategies.NetworkFirst({
        plugins: [
            new workbox.cacheableResponse.Plugin({ statuses: [200] })
        ],
        cacheName: 'static-resources',
    })
);

workbox.routing.registerRoute(
    /https:.*sound\/.*\.mp3/,
    new workbox.strategies.StaleWhileRevalidate({
        cacheName: 'sound-cache',
        plugins: [
            new workbox.cacheableResponse.Plugin({ statuses: [200] }),
            new workbox.rangeRequests.Plugin(),
        ]
    })
);

workbox.routing.registerRoute(
    /https:.*music\/.*\.mp3/,
    new workbox.strategies.StaleWhileRevalidate({
        cacheName: 'music-cache',
        plugins: [
            new workbox.cacheableResponse.Plugin({ statuses: [200] }),
            new workbox.rangeRequests.Plugin(),
        ]
    })
);

workbox.routing.registerRoute(
    /https:.*models\/.*\.glb/,
    new workbox.strategies.StaleWhileRevalidate({
        cacheName: 'model-cache',
        plugins: [
            new workbox.cacheableResponse.Plugin({ statuses: [200] })
        ]
    })
);

workbox.routing.registerRoute(
    /https:.*images\/.*\.(png|webp)/,
    new workbox.strategies.StaleWhileRevalidate({
        cacheName: 'image-cache',
        plugins: [
            new workbox.cacheableResponse.Plugin({ statuses: [200] })
        ]
    })
);

workbox.routing.registerRoute(
    /https:.*animations\/.*\.gif/,
    new workbox.strategies.StaleWhileRevalidate({
        cacheName: 'animation-cache',
        plugins: [
            new workbox.cacheableResponse.Plugin({ statuses: [200] })
        ]
    })
);

workbox.routing.registerRoute(
    /^https:\/\/fonts\.googleapis\.com/,
    new workbox.strategies.StaleWhileRevalidate({
        cacheName: 'google-fonts-stylesheets',
        plugins: [
            new workbox.cacheableResponse.Plugin({ statuses: [200] })
        ]
    })
);

workbox.routing.registerRoute(
    /^https:\/\/fonts\.gstatic\.com/,
    new workbox.strategies.StaleWhileRevalidate({
        cacheName: 'google-fonts-webfonts',
        plugins: [
            new workbox.cacheableResponse.Plugin({ statuses: [200] })
        ]
    })
);