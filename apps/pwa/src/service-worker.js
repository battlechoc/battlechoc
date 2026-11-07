import { registerRoute } from "workbox-routing";
import { StaleWhileRevalidate } from "workbox-strategies";
import { clientsClaim } from "workbox-core";
import { precacheAndRoute } from "workbox-precaching";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
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

// Caches of routes that are gone: the fonts ship with the app (precached from /fonts/),
// "static-resources" never matched (its pattern was a string), and the sounds, the music and the
// models are precached, so their stale-while-revalidate routes never answered (what an older
// worker put there is only taking up room).
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all(
      [
        "google-fonts-stylesheets",
        "google-fonts-webfonts",
        "static-resources",
        "sound-cache",
        "music-cache",
        "model-cache",
      ].map((name) => caches.delete(name))
    )
  );
});

self.skipWaiting();
clientsClaim();

// Everything precached comes from the build's manifest with revisions of its content
// (injectManifest.globPatterns in vite.config.js, the media folders too). Hand-kept
// revisions went stale: index.html with "NEXT_REVISION" (only CI replaced it) pointed a local
// build at scripts that no longer existed, and redrawn progress donuts kept revision "9", so
// installed games went on showing the old ones. "/" finds index.html as its directory index,
// and the start URL's parameters are ignored.
precacheAndRoute(
  self.__WB_MANIFEST,
  { ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^app_runs_as$/, /^app_version$/] }
);

// a picture that is not precached (the precache route above answers first for what is)
registerRoute(
  /https:.*images\/.*\.(svg|png)/,
  new StaleWhileRevalidate({
    cacheName: "image-cache",
    plugins: [new CacheableResponsePlugin({ statuses: [200] })],
  })
);
