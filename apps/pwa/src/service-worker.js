import { registerRoute } from "workbox-routing";
import { StaleWhileRevalidate, NetworkFirst } from "workbox-strategies";
import { clientsClaim } from "workbox-core";
import { precacheAndRoute } from "workbox-precaching";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { RangeRequestsPlugin } from "workbox-range-requests";
// Web Push without Firebase: the API sends JSON payloads { title, text, url, ... }, e.g. a
// live invite with url "/?invite=<id>".
// A notification is always shown (required for userVisibleOnly subscriptions); open app
// windows also get the payload to show it in-game.
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = { title: "battlechoc", text: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    (async () => {
      const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
      windows.forEach((client) => client.postMessage({ type: "battlechoc-push", payload }));
      await self.registration.showNotification(payload.title || "battlechoc", {
        body: payload.text,
        icon: "images/battlechoc_notification_icon.png",
        tag: payload.topic,
        data: { url: payload.url || "/" },
      });
    })()
  );
});

// a click opens the app at the notification's url, in an open window if there is one
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
      const app = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (app) {
        const navigated = await app.navigate(url);
        return (navigated || app).focus();
      }
      return clients.openWindow ? clients.openWindow(url) : undefined;
    })()
  );
});

// the fonts ship with the app now (precached from /fonts/); drop the old Google Fonts caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all(
      ["google-fonts-stylesheets", "google-fonts-webfonts"].map((name) =>
        caches.delete(name)
      )
    )
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
    { url: "/models/cacaotree.glb", revision: "5" },
    { url: "/models/cannon.glb", revision: "5" },
    { url: "/models/chocolateFountain.glb", revision: "5" },
    { url: "/models/cream.glb", revision: "5" },
    { url: "/models/creamAroundBuilding.glb", revision: "5" },
    { url: "/models/donut.glb", revision: "5" },
    { url: "/models/donutFactory.glb", revision: "5" },
    { url: "/models/factory.glb", revision: "5" },
    { url: "/models/factoryExtension.glb", revision: "5" },
    { url: "/models/field.glb", revision: "5" },
    { url: "/models/fruitCannon.glb", revision: "5" },
    { url: "/models/hotChocolateBallista.glb", revision: "5" },
    { url: "/models/spyingEasterBunny.glb", revision: "5" },
    { url: "/models/xmasFactory.glb", revision: "5" },
    { url: "/textures/sky.env", revision: "1" },
    { url: "/images/lab/badge-damage.svg", revision: "1" },
    { url: "/images/lab/badge-hp.svg", revision: "1" },
    { url: "/images/lab/badge-shield.svg", revision: "1" },
    { url: "/images/lab/badge-speed.svg", revision: "1" },
    { url: "/images/lab/badge-tag.svg", revision: "1" },
    { url: "/images/lab/bowl.svg", revision: "1" },
    { url: "/images/lab/recipe-book.svg", revision: "1" },
    { url: "/images/lab/steam.svg", revision: "1" },
    { url: "/images/ingredients/cocoa.svg", revision: "1" },
    { url: "/images/ingredients/sugar.svg", revision: "1" },
    { url: "/images/ingredients/milk.svg", revision: "1" },
    { url: "/images/ingredients/hazelnuts.svg", revision: "1" },
    { url: "/images/ingredients/rum.svg", revision: "1" },
    { url: "/images/ingredients/cherries.svg", revision: "1" },
    { url: "/images/ingredients/cream.svg", revision: "1" },
    { url: "/images/ingredients/marzipan.svg", revision: "1" },
    { url: "/images/ingredients/cinnamon.svg", revision: "1" },
    { url: "/images/ingredients/sprinkles.svg", revision: "1" },
    { url: "/images/ingredients/vanilla.svg", revision: "1" },
    { url: "/images/ingredients/goldleaf.svg", revision: "1" },
    { url: "/images/add-icon.svg", revision: "4" },
    { url: "/images/pause.svg", revision: "1" },
    { url: "/images/play.svg", revision: "1" },
    { url: "/images/swap-view.svg", revision: "1" },
    { url: "/images/dialog-border-left.svg", revision: "4" },
    { url: "/images/info-icon.svg", revision: "5" },
    { url: "/images/raindrop.png", revision: "4" },
    { url: "/images/apple-share-icon.svg", revision: "4" },
    { url: "/images/dialog-border-right.svg", revision: "4" },
    { url: "/images/info.svg", revision: "5" },
    { url: "/images/refresh.svg", revision: "4" },
    { url: "/images/arrow-down.svg", revision: "4" },
    { url: "/images/dialog-border-top.svg", revision: "4" },
    { url: "/images/instagram.svg", revision: "4" },
    { url: "/images/score.svg", revision: "4" },
    { url: "/images/done.svg", revision: "4" },
    { url: "/images/search.svg", revision: "4" },
    { url: "/images/back.svg", revision: "4" },
    { url: "/images/donut-factory-icon.svg", revision: "5" },
    { url: "/images/lab.svg", revision: "4" },
    { url: "/images/secondary-close.svg", revision: "4" },
    { url: "/images/backward-accent.svg", revision: "4" },
    { url: "/images/level-up-icon.svg", revision: "4" },
    { url: "/images/send.svg", revision: "4" },
    { url: "/images/backward.svg", revision: "4" },
    { url: "/images/donuts-disabled.svg", revision: "5" },
    { url: "/images/level.svg", revision: "4" },
    { url: "/images/settings.svg", revision: "4" },
    { url: "/images/ballista-icon.svg", revision: "5" },
    { url: "/images/donuts-enabled.svg", revision: "5" },
    { url: "/images/lock.svg", revision: "4" },
    { url: "/images/share.svg", revision: "4" },
    { url: "/images/battlechoc_notification_icon.png", revision: "4" },
    { url: "/images/dropdown.svg", revision: "4" },
    { url: "/images/logo.svg", revision: "5" },
    { url: "/images/buildings-icon.svg", revision: "5" },
    { url: "/images/easter-bunny-icon.svg", revision: "5" },
    { url: "/images/lost.svg", revision: "4" },
    { url: "/images/stop-donut-icon.svg", revision: "5" },
    { url: "/images/error-icon.svg", revision: "4" },
    { url: "/images/mute.svg", revision: "4" },
    { url: "/images/stripes.svg", revision: "5" },
    { url: "/images/facebook.svg", revision: "4" },
    { url: "/images/pen.svg", revision: "4" },
    { url: "/images/success-icon.svg", revision: "4" },
    { url: "/images/cacao-icon.svg", revision: "5" },
    { url: "/images/factory-extension-icon.svg", revision: "5" },
    { url: "/images/phone-rotation.svg", revision: "4" },
    { url: "/images/surprise-donut-icon.svg", revision: "5" },
    { url: "/images/cacao-tree-icon.svg", revision: "5" },
    { url: "/images/factory-icon.svg", revision: "5" },
    { url: "/images/portal-donut-icon.svg", revision: "5" },
    { url: "/images/cacao.svg", revision: "5" },
    { url: "/images/fast-backward.svg", revision: "4" },
    { url: "/images/primary-close.svg", revision: "4" },
    { url: "/images/fast-forward.svg", revision: "4" },
    { url: "/images/progress-10.svg", revision: "5" },
    { url: "/images/trophy.svg", revision: "4" },
    { url: "/images/progress-100.svg", revision: "5" },
    { url: "/images/truffle-cannon-icon.svg", revision: "5" },
    { url: "/images/choclab-decoration-left.svg", revision: "4" },
    { url: "/images/forward.svg", revision: "4" },
    { url: "/images/forward-accent.svg", revision: "4" },
    { url: "/images/progress-20.svg", revision: "5" },
    { url: "/images/user.svg", revision: "4" },
    { url: "/images/choclab-decoration-right.svg", revision: "4" },
    { url: "/images/fountain-icon.svg", revision: "5" },
    { url: "/images/progress-30.svg", revision: "5" },
    { url: "/images/volume.svg", revision: "4" },
    { url: "/images/close.svg", revision: "4" },
    { url: "/images/fruit-cannon-icon.svg", revision: "5" },
    { url: "/images/progress-40.svg", revision: "5" },
    { url: "/images/warning-close.svg", revision: "4" },
    { url: "/images/coins.svg", revision: "5" },
    { url: "/images/fullscreen.svg", revision: "4" },
    { url: "/images/progress-50.svg", revision: "5" },
    { url: "/images/warning-icon.svg", revision: "4" },
    { url: "/images/cream-donut-icon.svg", revision: "5" },
    { url: "/images/gears.svg", revision: "4" },
    { url: "/images/progress-60.svg", revision: "5" },
    { url: "/images/win.svg", revision: "4" },
    { url: "/images/cream-icon.svg", revision: "5" },
    { url: "/images/header.svg", revision: "4" },
    { url: "/images/progress-70.svg", revision: "5" },
    { url: "/images/xmas-factory-icon.svg", revision: "5" },
    { url: "/images/cream.svg", revision: "5" },
    { url: "/images/health-donut-icon.svg", revision: "5" },
    { url: "/images/progress-80.svg", revision: "5" },
    { url: "/images/decoration.svg", revision: "5" },
    { url: "/images/highscore.svg", revision: "4" },
    { url: "/images/progress-90.svg", revision: "5" },
    { url: "/images/attacks-per-turn.svg", revision: "5" },
    { url: "/images/buildings-per-turn.svg", revision: "5" },
    { url: "/images/bunny-caught.svg", revision: "5" },
    { url: "/images/cacao-per-turn.svg", revision: "5" },
    { url: "/images/fruit-attacks-per-turn.svg", revision: "5" },
    { url: "/images/spy-attacks-per-turn.svg", revision: "5" },
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
