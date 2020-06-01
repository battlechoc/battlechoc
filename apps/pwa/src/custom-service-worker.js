importScripts('https://www.gstatic.com/firebasejs/7.13.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/7.13.1/firebase-messaging.js');

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
    { url: '/sound/attack_bunny.mp3', revision: '3' },
    { url: '/sound/attack_explosion.mp3', revision: '3' },
    { url: '/sound/bunny_caught.mp3', revision: '3' },
    { url: '/sound/ui_accept.mp3', revision: '3' },
    { url: '/sound/ui_build.mp3', revision: '3' },
    { url: '/music/CacaoLiving.mp3', revision: '3' },
    { url: '/models/cacaotree.glb', revision: '3' },
    { url: '/models/cannon.glb', revision: '3' },
    { url: '/models/chocolateFountain.glb', revision: '3' },
    { url: '/models/cream.glb', revision: '3' },
    { url: '/models/creamAroundBuilding.glb', revision: '3' },
    { url: '/models/factory.glb', revision: '3' },
    { url: '/models/factoryExtension.glb', revision: '3' },
    { url: '/models/field.glb', revision: '3' },
    { url: '/models/fruitCannon.glb', revision: '3' },
    { url: '/models/hotChocolateBallista.glb', revision: '3' },
    { url: '/models/spyingEasterBunny.glb', revision: '3' },
    { url: '/models/xmasFactory.glb', revision: '3' },
    { url: '/images/add-icon.svg', revision: '3' },
    { url: '/images/dialog-border-left.svg', revision: '3' },
    { url: '/images/info-icon.svg', revision: '3' },
    { url: '/images/raindrop.png', revision: '3' },
    { url: '/images/apple-share-icon.svg', revision: '3' },
    { url: '/images/dialog-border-right.svg', revision: '3' },
    { url: '/images/info.svg', revision: '3' },
    { url: '/images/refresh.svg', revision: '3' },
    { url: '/images/arrow-down.svg', revision: '3' },
    { url: '/images/dialog-border-top.svg', revision: '3' },
    { url: '/images/instagram.svg', revision: '3' },
    { url: '/images/ score.svg', revision: '3' },
    { url: '/images/attacksPerTurn.png', revision: '3' },
    { url: '/images/done.svg', revision: '3' },
    { url: '/images/search.svg', revision: '3' },
    { url: '/images/back.svg', revision: '3' },
    { url: '/images/donut-factory-icon.svg', revision: '3' },
    { url: '/images/lab.svg', revision: '3' },
    { url: '/images/secondary-close.svg', revision: '3' },
    { url: '/images/backward-accent.svg', revision: '3' },
    { url: '/images/donut_icon_palette.png', revision: '3' },
    { url: '/images/level-up-icon.svg', revision: '3' },
    { url: '/images/send.svg', revision: '3' },
    { url: '/images/backward.svg', revision: '3' },
    { url: '/images/donuts-disabled.svg', revision: '3' },
    { url: '/images/level.svg', revision: '3' },
    { url: '/images/settings.svg', revision: '3' },
    { url: '/images/ballista-icon.svg', revision: '3' },
    { url: '/images/donuts-enabled.svg', revision: '3' },
    { url: '/images/lock.svg', revision: '3' },
    { url: '/images/share.svg', revision: '3' },
    { url: '/images/battlechoc_notification_icon.png', revision: '3' },
    { url: '/images/dropdown.svg', revision: '3' },
    { url: '/images/logo.svg', revision: '3' },
    { url: '/images/spyAttacksPerTurn.png', revision: '3' },
    { url: '/images/buildings-icon.svg', revision: '3' },
    { url: '/images/easter-bunny-icon.svg', revision: '3' },
    { url: '/images/lost.svg', revision: '3' },
    { url: '/images/stop-donut-icon.svg', revision: '3' },
    { url: '/images/buildingsPerTurn.png', revision: '3' },
    { url: '/images/error-icon.svg', revision: '3' },
    { url: '/images/mute.svg', revision: '3' },
    { url: '/images/stripes.svg', revision: '3' },
    { url: '/images/bunnyCaught.png', revision: '3' },
    { url: '/images/facebook.svg', revision: '3' },
    { url: '/images/pen.svg', revision: '3' },
    { url: '/images/success-icon.svg', revision: '3' },
    { url: '/images/cacao-icon.svg', revision: '3' },
    { url: '/images/factory-extension-icon.svg', revision: '3' },
    { url: '/images/phone-rotation.svg', revision: '3' },
    { url: '/images/surprise-donut-icon.svg', revision: '3' },
    { url: '/images/cacao-tree-icon.svg', revision: '3' },
    { url: '/images/factory-icon.svg', revision: '3' },
    { url: '/images/portal-donut-icon.svg', revision: '3' },
    { url: '/images/cacao.svg', revision: '3' },
    { url: '/images/fast-backward.svg', revision: '3' },
    { url: '/images/primary-close.svg', revision: '3' },
    { url: '/images/cacaoPerTurn.png', revision: '3' },
    { url: '/images/fast-forward.svg', revision: '3' },
    { url: '/images/progress-10.svg', revision: '3' },
    { url: '/images/trophy.svg', revision: '3' },
    { url: '/images/cacao_no_background.png', revision: '3' },
    { url: '/images/first-turn.svg', revision: '3' },
    { url: '/images/progress-100.svg', revision: '3' },
    { url: '/images/truffle-cannon-icon.svg', revision: '3' },
    { url: '/images/choclab-decoration-left.svg', revision: '3' },
    { url: '/images/forward.svg', revision: '3' },
    { url: '/images/progress-20.svg', revision: '3' },
    { url: '/images/user.svg', revision: '3' },
    { url: '/images/choclab-decoration-right.svg', revision: '3' },
    { url: '/images/fountain-icon.svg', revision: '3' },
    { url: '/images/progress-30.svg', revision: '3' },
    { url: '/images/volume.svg', revision: '3' },
    { url: '/images/close.svg', revision: '3' },
    { url: '/images/fruit-cannon-icon.svg', revision: '3' },
    { url: '/images/progress-40.svg', revision: '3' },
    { url: '/images/warning-close.svg', revision: '3' },
    { url: '/images/coins.svg', revision: '3' },
    { url: '/images/fullscreen.svg', revision: '3' },
    { url: '/images/progress-50.svg', revision: '3' },
    { url: '/images/warning-icon.svg', revision: '3' },
    { url: '/images/cream-donut-icon.svg', revision: '3' },
    { url: '/images/gears.svg', revision: '3' },
    { url: '/images/progress-60.svg', revision: '3' },
    { url: '/images/win.svg', revision: '3' },
    { url: '/images/cream-icon.svg', revision: '3' },
    { url: '/images/header.svg', revision: '3' },
    { url: '/images/progress-70.svg', revision: '3' },
    { url: '/images/xmas-factory-icon.svg', revision: '3' },
    { url: '/images/cream.svg', revision: '3' },
    { url: '/images/health-donut-icon.svg', revision: '3' },
    { url: '/images/progress-80.svg', revision: '3' },
    { url: '/images/decoration.svg', revision: '3' },
    { url: '/images/highscore.svg', revision: '3' },
    { url: '/images/progress-90.svg', revision: '3' },
    { url: '/images/bell.svg', revision: '3' },
    { url: '/animations/loading.gif', revision: '3' }
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