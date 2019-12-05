workbox.precaching.precacheAndRoute([
  ...self.__precacheManifest,
  { url: '/sound/attack_bunny.mp3', revision: '998ecf84' },
  { url: '/sound/attack_explosion.mp3', revision: '998ecf84' },
  { url: '/sound/bunny_caught.mp3', revision: '998ecf84' },
  { url: '/sound/ui_accept.mp3', revision: '998ecf84' },
  { url: '/sound/ui_build.mp3', revision: '998ecf84' },
  { url: '/music/CacaoLiving.mp3', revision: '998ecf84' },
  { url: '/models/cacaotree.glb', revision: '998ecf84' },
  { url: '/models/cannon.glb', revision: '998ecf84' },
  { url: '/models/chocolateFountain.glb', revision: '998ecf84' },
  { url: '/models/cream.glb', revision: '998ecf84' },
  { url: '/models/creamAroundBuilding.glb', revision: '998ecf84' },
  { url: '/models/factory.glb', revision: '998ecf84' },
  { url: '/models/factoryExtension.glb', revision: '998ecf84' },
  { url: '/models/field.glb', revision: '998ecf84' },
  { url: '/models/fruitCannon.glb', revision: '998ecf84' },
  { url: '/models/hotChocolateBallista.glb', revision: '998ecf84' },
  { url: '/models/spyingEasterBunny.glb', revision: '998ecf84' },
  { url: '/models/xmasFactory.glb', revision: '998ecf84' },
  { url: '/images/attacksPerTurn.png', revision: '998ecf84' },
  { url: '/images/buildingsPerTurn.png', revision: '998ecf84' },
  { url: '/images/cacao_no_background.png', revision: '998ecf84' },
  { url: '/images/creamAtField.png', revision: '998ecf84' },
  { url: '/images/logo.svg', revision: '998ecf84' },
  { url: '/images/spyAttacksPerTurn.png', revision: '998ecf84' },
  { url: '/images/background.jpg', revision: '998ecf84' },
  { url: '/images/bunnyCaught.png', revision: '998ecf84' },
  { url: '/images/coins.png', revision: '998ecf84' },
  { url: '/images/cream_preview.png', revision: '998ecf84' },
  { url: '/images/logo.webp', revision: '998ecf84' },
  { url: '/images/toolbar_icon_palette.png', revision: '998ecf84' },
  { url: '/images/background.webp', revision: '998ecf84' },
  { url: '/images/cacaoPerTurn.png', revision: '998ecf84' },
  { url: '/images/coins.webp', revision: '998ecf84' },
  { url: '/images/logo.png', revision: '998ecf84' },
  { url: '/images/raindrop.png', revision: '998ecf84' },
  { url: '/images/toolbar_icon_palette.webp', revision: '998ecf84' },
  { url: '/animations/loading.gif', revision: '998ecf84' }
]);

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