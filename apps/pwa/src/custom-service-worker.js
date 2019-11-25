workbox.routing.registerRoute(
  /https:.*sound\/.*\.mp3/,
  new workbox.strategies.CacheFirst({ cacheName: 'sound-cache' })
);

workbox.routing.registerRoute(
  /https:.*music\/.*\.mp3/,
  new workbox.strategies.CacheFirst({ cacheName: 'music-cache' })
);

workbox.routing.registerRoute(
  /https:.*models\/.*\.glb/,
  new workbox.strategies.CacheFirst({ cacheName: 'model-cache' })
);

workbox.routing.registerRoute(
  /https:.*images\/.*\.png/,
  new workbox.strategies.CacheFirst({ cacheName: 'image-cache' })
);

workbox.routing.registerRoute(
  /https:.*animations\/.*\.gif/,
  new workbox.strategies.CacheFirst({ cacheName: 'animation-cache' })
);

workbox.routing.registerRoute(
  /^https:\/\/fonts\.googleapis\.com/,
  new workbox.strategies.StaleWhileRevalidate({ cacheName: 'google-fonts-stylesheets' })
);

workbox.routing.registerRoute(
  /^https:\/\/fonts\.gstatic\.com/,
  new workbox.strategies.StaleWhileRevalidate({ cacheName: 'google-fonts-webfonts' })
);

workbox.core.skipWaiting();
workbox.core.clientsClaim();
workbox.precaching.precacheAndRoute([]);