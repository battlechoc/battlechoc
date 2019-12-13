workbox.core.skipWaiting();
workbox.core.clientsClaim();

workbox.precaching.precacheAndRoute((self.__precacheManifest || []).concat([
  { url: '/', revision: '2' },
  { url: '/index.html?app_runs_as=pwa&app_version=1', revision: '2' },
  { url: '/manifest.json', revision: '2' },
  { url: '/sound/attack_bunny.mp3', revision: '1' },
  { url: '/sound/attack_explosion.mp3', revision: '1' },
  { url: '/sound/bunny_caught.mp3', revision: '1' },
  { url: '/sound/ui_accept.mp3', revision: '1' },
  { url: '/sound/ui_build.mp3', revision: '1' },
  { url: '/music/CacaoLiving.mp3', revision: '1' },
  { url: '/models/cacaotree.glb', revision: '1' },
  { url: '/models/cannon.glb', revision: '1' },
  { url: '/models/chocolateFountain.glb', revision: '1' },
  { url: '/models/cream.glb', revision: '1' },
  { url: '/models/creamAroundBuilding.glb', revision: '1' },
  { url: '/models/factory.glb', revision: '1' },
  { url: '/models/factoryExtension.glb', revision: '1' },
  { url: '/models/field.glb', revision: '1' },
  { url: '/models/fruitCannon.glb', revision: '1' },
  { url: '/models/hotChocolateBallista.glb', revision: '1' },
  { url: '/models/spyingEasterBunny.glb', revision: '1' },
  { url: '/models/xmasFactory.glb', revision: '1' },
  { url: '/images/attacksPerTurn.png', revision: '1' },
  { url: '/images/buildingsPerTurn.png', revision: '1' },
  { url: '/images/cacao_no_background.png', revision: '1' },
  { url: '/images/creamAtField.png', revision: '1' },
  { url: '/images/spyAttacksPerTurn.png', revision: '1' },
  { url: '/images/background.jpg', revision: '1' },
  { url: '/images/bunnyCaught.png', revision: '1' },
  { url: '/images/coins.png', revision: '1' },
  { url: '/images/cream_preview.png', revision: '1' },
  { url: '/images/logo.webp', revision: '1' },
  { url: '/images/toolbar_icon_palette.png', revision: '1' },
  { url: '/images/background.webp', revision: '1' },
  { url: '/images/cacaoPerTurn.png', revision: '1' },
  { url: '/images/coins.webp', revision: '1' },
  { url: '/images/logo.png', revision: '1' },
  { url: '/images/raindrop.png', revision: '1' },
  { url: '/images/toolbar_icon_palette.webp', revision: '1' },
  { url: '/animations/loading.gif', revision: '1' }
]));

workbox.precaching.precacheAndRoute([]);

workbox.routing.registerRoute(
  '/\.(?:js|css|html)$/',
  new workbox.strategies.NetworkFirst({
    plugins: [
      new workbox.cacheableResponse.Plugin({statuses: [200]})
    ],
    cacheName: 'static-resources',
  })
);

workbox.routing.registerRoute(
  /https:.*sound\/.*\.mp3/,
  new workbox.strategies.StaleWhileRevalidate({ 
    cacheName: 'sound-cache',
    plugins: [
      new workbox.cacheableResponse.Plugin({statuses: [200]}),
      new workbox.rangeRequests.Plugin(),
    ] 
  })
);

workbox.routing.registerRoute(
  /https:.*music\/.*\.mp3/,
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: 'music-cache',
    plugins: [
      new workbox.cacheableResponse.Plugin({statuses: [200]}),
      new workbox.rangeRequests.Plugin(),
    ]
  })
);

workbox.routing.registerRoute(
  /https:.*models\/.*\.glb/,
  new workbox.strategies.StaleWhileRevalidate({ 
    cacheName: 'model-cache',
    plugins: [
      new workbox.cacheableResponse.Plugin({statuses: [200]}) 
    ]
  })
);

workbox.routing.registerRoute(
  /https:.*images\/.*\.(png|webp)/,
  new workbox.strategies.StaleWhileRevalidate({ 
    cacheName: 'image-cache',
    plugins: [
      new workbox.cacheableResponse.Plugin({statuses: [200]})
    ]
  })
);

workbox.routing.registerRoute(
  /https:.*animations\/.*\.gif/,
  new workbox.strategies.StaleWhileRevalidate({ 
    cacheName: 'animation-cache',
    plugins: [
      new workbox.cacheableResponse.Plugin({statuses: [200]})
    ]
  })
);

workbox.routing.registerRoute(
  /^https:\/\/fonts\.googleapis\.com/,
  new workbox.strategies.StaleWhileRevalidate({ 
    cacheName: 'google-fonts-stylesheets',
    plugins: [
      new workbox.cacheableResponse.Plugin({statuses: [200]})
    ]
  })
);

workbox.routing.registerRoute(
  /^https:\/\/fonts\.gstatic\.com/,
  new workbox.strategies.StaleWhileRevalidate({ 
    cacheName: 'google-fonts-webfonts',
    plugins: [
      new workbox.cacheableResponse.Plugin({statuses: [200]})
    ]
  })
);