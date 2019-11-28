workbox.routing.registerRoute(
  /https:.*sound\/.*\.mp3/,
  new workbox.strategies.StaleWhileRevalidate({ cacheName: 'sound-cache' })
);

workbox.routing.registerRoute(
  /https:.*music\/.*\.mp3/,
  new workbox.strategies.StaleWhileRevalidate({ cacheName: 'music-cache' })
);

workbox.routing.registerRoute(
  /https:.*models\/.*\.glb/,
  new workbox.strategies.StaleWhileRevalidate({ cacheName: 'model-cache' })
);

workbox.routing.registerRoute(
  /https:.*images\/.*\.png/,
  new workbox.strategies.StaleWhileRevalidate({ cacheName: 'image-cache' })
);

workbox.routing.registerRoute(
  /https:.*animations\/.*\.gif/,
  new workbox.strategies.StaleWhileRevalidate({ cacheName: 'animation-cache' })
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