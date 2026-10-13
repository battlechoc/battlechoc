import { registerRoute } from "workbox-routing";
import { StaleWhileRevalidate, NetworkFirst } from "workbox-strategies";
import { clientsClaim } from "workbox-core";
import { precacheAndRoute } from "workbox-precaching";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { RangeRequestsPlugin } from "workbox-range-requests";
import { initializeApp } from "firebase/app";
import { getMessaging, onBackgroundMessage } from "firebase/messaging/sw";
import firebaseConfig from "./firebaseConfig";

const messaging = getMessaging(initializeApp(firebaseConfig));

onBackgroundMessage(messaging, function (payload) {
  const notificationOptions = {
    body: payload.data.text,
    icon: "images/battlechoc-notification-icon.png",
    data: {
      reason: payload.data.reason,
      click_action: payload.data.click_action,
      session: payload.data.session,
    },
  };
  return self.registration.showNotification(
    payload.data.title,
    notificationOptions
  );
});

self.addEventListener("notificationclick", function (event) {
  // Android doesn't close the notification when you click on it
  // See: http://crbug.com/463146
  event.notification.close();
  console.log(event);

  const originalUrl = "https://battlechoc.com/";
  const originalUrlDev = "https://battlechoc.dev/";

  event.waitUntil(
    clients
      .matchAll({
        type: "window",
      })
      .then((clientList) => {
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          console.log(client.url);
          console.log(originalUrl);
          if (client.url === originalUrl || client.url === originalUrlDev) {
            console.log("navigating and focusing");
            return client
              .navigate(event.notification.data.click_action)
              .then((client) => client.focus());
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

self.skipWaiting();
clientsClaim();

// NEXT REVISION will replaced by $CI_PIPELINE_ID within the GitLab build process
precacheAndRoute(
  (self.__precacheManifest || self.__WB_MANIFEST || []).concat([
    { url: "/", revision: "NEXT_REVISION" },
    {
      url: "/index.html?app_runs_as=pwa&app_version=1",
      revision: "NEXT_REVISION",
    },
    { url: "/manifest.json", revision: "NEXT_REVISION" },
    { url: "/sound/attack_bunny.mp3", revision: "4" },
    { url: "/sound/attack_explosion.mp3", revision: "4" },
    { url: "/sound/bunny_caught.mp3", revision: "4" },
    { url: "/sound/ui_accept.mp3", revision: "4" },
    { url: "/sound/ui_build.mp3", revision: "4" },
    { url: "/music/CacaoLiving.mp3", revision: "4" },
    { url: "/models/cacaotree.glb", revision: "4" },
    { url: "/models/cannon.glb", revision: "4" },
    { url: "/models/chocolateFountain.glb", revision: "4" },
    { url: "/models/cream.glb", revision: "4" },
    { url: "/models/creamAroundBuilding.glb", revision: "4" },
    { url: "/models/factory.glb", revision: "4" },
    { url: "/models/factoryExtension.glb", revision: "4" },
    { url: "/models/field.glb", revision: "4" },
    { url: "/models/fruitCannon.glb", revision: "4" },
    { url: "/models/hotChocolateBallista.glb", revision: "4" },
    { url: "/models/spyingEasterBunny.glb", revision: "4" },
    { url: "/models/xmasFactory.glb", revision: "4" },
    { url: "/images/add-icon.svg", revision: "4" },
    { url: "/images/dialog-border-left.svg", revision: "4" },
    { url: "/images/info-icon.svg", revision: "4" },
    { url: "/images/raindrop.png", revision: "4" },
    { url: "/images/apple-share-icon.svg", revision: "4" },
    { url: "/images/dialog-border-right.svg", revision: "4" },
    { url: "/images/info.svg", revision: "4" },
    { url: "/images/refresh.svg", revision: "4" },
    { url: "/images/arrow-down.svg", revision: "4" },
    { url: "/images/dialog-border-top.svg", revision: "4" },
    { url: "/images/instagram.svg", revision: "4" },
    { url: "/images/ score.svg", revision: "4" },
    { url: "/images/done.svg", revision: "4" },
    { url: "/images/search.svg", revision: "4" },
    { url: "/images/back.svg", revision: "4" },
    { url: "/images/donut-factory-icon.svg", revision: "4" },
    { url: "/images/lab.svg", revision: "4" },
    { url: "/images/secondary-close.svg", revision: "4" },
    { url: "/images/backward-accent.svg", revision: "4" },
    { url: "/images/level-up-icon.svg", revision: "4" },
    { url: "/images/send.svg", revision: "4" },
    { url: "/images/backward.svg", revision: "4" },
    { url: "/images/donuts-disabled.svg", revision: "4" },
    { url: "/images/level.svg", revision: "4" },
    { url: "/images/settings.svg", revision: "4" },
    { url: "/images/ballista-icon.svg", revision: "4" },
    { url: "/images/donuts-enabled.svg", revision: "4" },
    { url: "/images/lock.svg", revision: "4" },
    { url: "/images/share.svg", revision: "4" },
    { url: "/images/battlechoc_notification_icon.png", revision: "4" },
    { url: "/images/dropdown.svg", revision: "4" },
    { url: "/images/logo.svg", revision: "4" },
    { url: "/images/buildings-icon.svg", revision: "4" },
    { url: "/images/easter-bunny-icon.svg", revision: "4" },
    { url: "/images/lost.svg", revision: "4" },
    { url: "/images/stop-donut-icon.svg", revision: "4" },
    { url: "/images/error-icon.svg", revision: "4" },
    { url: "/images/mute.svg", revision: "4" },
    { url: "/images/stripes.svg", revision: "4" },
    { url: "/images/facebook.svg", revision: "4" },
    { url: "/images/pen.svg", revision: "4" },
    { url: "/images/success-icon.svg", revision: "4" },
    { url: "/images/cacao-icon.svg", revision: "4" },
    { url: "/images/factory-extension-icon.svg", revision: "4" },
    { url: "/images/phone-rotation.svg", revision: "4" },
    { url: "/images/surprise-donut-icon.svg", revision: "4" },
    { url: "/images/cacao-tree-icon.svg", revision: "4" },
    { url: "/images/factory-icon.svg", revision: "4" },
    { url: "/images/portal-donut-icon.svg", revision: "4" },
    { url: "/images/cacao.svg", revision: "4" },
    { url: "/images/fast-backward.svg", revision: "4" },
    { url: "/images/primary-close.svg", revision: "4" },
    { url: "/images/fast-forward.svg", revision: "4" },
    { url: "/images/progress-10.svg", revision: "4" },
    { url: "/images/trophy.svg", revision: "4" },
    { url: "/images/first-turn.svg", revision: "4" },
    { url: "/images/progress-100.svg", revision: "4" },
    { url: "/images/truffle-cannon-icon.svg", revision: "4" },
    { url: "/images/choclab-decoration-left.svg", revision: "4" },
    { url: "/images/forward.svg", revision: "4" },
    { url: "/images/forward-accent.svg", revision: "4" },
    { url: "/images/progress-20.svg", revision: "4" },
    { url: "/images/user.svg", revision: "4" },
    { url: "/images/choclab-decoration-right.svg", revision: "4" },
    { url: "/images/fountain-icon.svg", revision: "4" },
    { url: "/images/progress-30.svg", revision: "4" },
    { url: "/images/volume.svg", revision: "4" },
    { url: "/images/close.svg", revision: "4" },
    { url: "/images/fruit-cannon-icon.svg", revision: "4" },
    { url: "/images/progress-40.svg", revision: "4" },
    { url: "/images/warning-close.svg", revision: "4" },
    { url: "/images/coins.svg", revision: "4" },
    { url: "/images/fullscreen.svg", revision: "4" },
    { url: "/images/progress-50.svg", revision: "4" },
    { url: "/images/warning-icon.svg", revision: "4" },
    { url: "/images/cream-donut-icon.svg", revision: "4" },
    { url: "/images/gears.svg", revision: "4" },
    { url: "/images/progress-60.svg", revision: "4" },
    { url: "/images/win.svg", revision: "4" },
    { url: "/images/cream-icon.svg", revision: "4" },
    { url: "/images/header.svg", revision: "4" },
    { url: "/images/progress-70.svg", revision: "4" },
    { url: "/images/xmas-factory-icon.svg", revision: "4" },
    { url: "/images/cream.svg", revision: "4" },
    { url: "/images/health-donut-icon.svg", revision: "4" },
    { url: "/images/progress-80.svg", revision: "4" },
    { url: "/images/decoration.svg", revision: "4" },
    { url: "/images/highscore.svg", revision: "4" },
    { url: "/images/progress-90.svg", revision: "4" },
    { url: "/images/bell.svg", revision: "4" },
    { url: "/images/attacks-per-turn.svg", revision: "4" },
    { url: "/images/buildings-per-turn.svg", revision: "4" },
    { url: "/images/bunny-caught.svg", revision: "4" },
    { url: "/images/cacao-per-turn.svg", revision: "4" },
    { url: "/images/fruit-attacks-per-turn.svg", revision: "4" },
    { url: "/images/spy-attacks-per-turn.svg", revision: "4" },
  ])
);

precacheAndRoute([]);

registerRoute(
  "/.(?:js|css|html)$/",
  new NetworkFirst({
    plugins: [new CacheableResponsePlugin({ statuses: [200] })],
    cacheName: "static-resources",
  })
);

registerRoute(
  /https:.*sound\/.*\.mp3/,
  new StaleWhileRevalidate({
    cacheName: "sound-cache",
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new RangeRequestsPlugin(),
    ],
  })
);

registerRoute(
  /https:.*music\/.*\.mp3/,
  new StaleWhileRevalidate({
    cacheName: "music-cache",
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new RangeRequestsPlugin(),
    ],
  })
);

registerRoute(
  /https:.*models\/.*\.glb/,
  new StaleWhileRevalidate({
    cacheName: "model-cache",
    plugins: [new CacheableResponsePlugin({ statuses: [200] })],
  })
);

registerRoute(
  /https:.*images\/.*\.(svg|png)/,
  new StaleWhileRevalidate({
    cacheName: "image-cache",
    plugins: [new CacheableResponsePlugin({ statuses: [200] })],
  })
);

registerRoute(
  /^https:\/\/fonts\.googleapis\.com/,
  new StaleWhileRevalidate({
    cacheName: "google-fonts-stylesheets",
    plugins: [new CacheableResponsePlugin({ statuses: [200] })],
  })
);

registerRoute(
  /^https:\/\/fonts\.gstatic\.com/,
  new StaleWhileRevalidate({
    cacheName: "google-fonts-webfonts",
    plugins: [new CacheableResponsePlugin({ statuses: [200] })],
  })
);
