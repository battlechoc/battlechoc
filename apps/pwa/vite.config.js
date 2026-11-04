import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// The shared package is linked through the npm workspace and is CommonJS, so the dev server
// pre-bundles it like a dependency (optimizeDeps below). Vite rebuilds that bundle only when
// the lockfile or this config changes, never when the shared sources change: a stale bundle
// misses new exports and crashes the app. So the dev server re-bundles whenever the sources
// differ from the last bundle, and restarts itself when they change while it runs.
const here = path.dirname(fileURLToPath(import.meta.url));
const sharedDir = path.resolve(here, '../../packages/shared');
// Every dev server on this project needs its own dependency cache (VITE_CACHE_DIR): a second server
// (the e2e suite's, a lookdev server) that re-bundled the shared one left a running server's page
// importing chunks that no longer existed, a white page until a hard reload.
const cacheDir = path.resolve(here, process.env.VITE_CACHE_DIR || 'node_modules/.vite');
const NOT_BUNDLED = new Set(['node_modules', 'coverage', 'tests', 'scripts']);

const sharedSources = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      return NOT_BUNDLED.has(entry.name) ? [] : sharedSources(path.join(dir, entry.name));
    }
    return entry.name.endsWith('.js') ? [path.join(dir, entry.name)] : [];
  });

const sharedHash = () => {
  const hash = crypto.createHash('sha256');
  sharedSources(sharedDir)
    .sort()
    .forEach((file) => {
      hash.update(path.relative(sharedDir, file));
      hash.update(fs.readFileSync(file));
    });
  return hash.digest('hex');
};

// true when the shared sources changed since the last pre-bundle (remembered next to Vite's cache)
const sharedChanged = () => {
  const stamp = path.join(cacheDir, 'battlechoc-shared.hash');
  const current = sharedHash();
  let previous;
  try {
    previous = fs.readFileSync(stamp, 'utf8');
  } catch {
    previous = undefined;
  }
  if (previous === current) {
    return false;
  }
  fs.mkdirSync(path.dirname(stamp), { recursive: true });
  fs.writeFileSync(stamp, current);
  return true;
};

const isSharedSource = (file) =>
  file.startsWith(sharedDir + path.sep) &&
  file.endsWith('.js') &&
  !path.relative(sharedDir, file).split(path.sep).some((part) => NOT_BUNDLED.has(part));

const restartOnSharedChange = () => ({
  name: 'battlechoc-shared-restart',
  apply: 'serve',
  configureServer(server) {
    server.watcher.add(sharedDir);
    server.watcher.on('change', (file) => {
      if (isSharedSource(file)) {
        server.config.logger.info('shared package changed: restarting to re-bundle it', { timestamp: true });
        server.restart();
      }
    });
  },
});

// The media the game needs offline. Workbox gives each file a revision of its content, so a
// changed picture or model reaches installed games with the next build; add new files here.
const PRECACHED_MEDIA = [
  'sound/attack_bunny.mp3',
  'sound/attack_explosion.mp3',
  'sound/bunny_caught.mp3',
  'sound/ui_accept.mp3',
  'sound/ui_build.mp3',
  'music/CacaoLiving.mp3',
  'models/cacaotree.glb',
  'models/cannon.glb',
  'models/chocolateFountain.glb',
  'models/cream.glb',
  'models/creamAroundBuilding.glb',
  'models/donut.glb',
  'models/donutFactory.glb',
  'models/factory.glb',
  'models/factoryExtension.glb',
  'models/field.glb',
  'models/fruitCannon.glb',
  'models/hotChocolateBallista.glb',
  'models/spyingEasterBunny.glb',
  'models/xmasFactory.glb',
  'textures/sky.env',
  'images/lab/badge-damage.svg',
  'images/lab/badge-hp.svg',
  'images/lab/badge-shield.svg',
  'images/lab/badge-speed.svg',
  'images/lab/badge-tag.svg',
  'images/lab/bowl.svg',
  'images/lab/recipe-book.svg',
  'images/lab/steam.svg',
  'images/ingredients/cocoa.svg',
  'images/ingredients/sugar.svg',
  'images/ingredients/milk.svg',
  'images/ingredients/hazelnuts.svg',
  'images/ingredients/rum.svg',
  'images/ingredients/cherries.svg',
  'images/ingredients/cream.svg',
  'images/ingredients/marzipan.svg',
  'images/ingredients/cinnamon.svg',
  'images/ingredients/sprinkles.svg',
  'images/ingredients/vanilla.svg',
  'images/ingredients/goldleaf.svg',
  'images/add-icon.svg',
  'images/dialog-border-left.svg',
  'images/info-icon.svg',
  'images/raindrop.png',
  'images/apple-share-icon.svg',
  'images/dialog-border-right.svg',
  'images/info.svg',
  'images/refresh.svg',
  'images/arrow-down.svg',
  'images/dialog-border-top.svg',
  'images/instagram.svg',
  'images/score.svg',
  'images/done.svg',
  'images/search.svg',
  'images/back.svg',
  'images/donut-factory-icon.svg',
  'images/lab.svg',
  'images/secondary-close.svg',
  'images/backward-accent.svg',
  'images/send.svg',
  'images/backward.svg',
  'images/level.svg',
  'images/settings.svg',
  'images/ballista-icon.svg',
  'images/donuts-enabled.svg',
  'images/lock.svg',
  'images/offline.svg',
  'images/share.svg',
  'images/battlechoc_notification_icon.png',
  'images/dropdown.svg',
  'images/logo.svg',
  'images/buildings-icon.svg',
  'images/easter-bunny-icon.svg',
  'images/lost.svg',
  'images/stop-donut-icon.svg',
  'images/error-icon.svg',
  'images/mute.svg',
  'images/stripes.svg',
  'images/facebook.svg',
  'images/pen.svg',
  'images/success-icon.svg',
  'images/cacao-icon.svg',
  'images/factory-extension-icon.svg',
  'images/phone-rotation.svg',
  'images/surprise-donut-icon.svg',
  'images/cacao-tree-icon.svg',
  'images/factory-icon.svg',
  'images/portal-donut-icon.svg',
  'images/cacao.svg',
  'images/fast-backward.svg',
  'images/primary-close.svg',
  'images/fast-forward.svg',
  'images/progress-10.svg',
  'images/trophy.svg',
  'images/progress-100.svg',
  'images/truffle-cannon-icon.svg',
  'images/choclab-decoration-left.svg',
  'images/forward.svg',
  'images/forward-accent.svg',
  'images/progress-20.svg',
  'images/user.svg',
  'images/choclab-decoration-right.svg',
  'images/fountain-icon.svg',
  'images/progress-30.svg',
  'images/volume.svg',
  'images/close.svg',
  'images/fruit-cannon-icon.svg',
  'images/progress-40.svg',
  'images/warning-close.svg',
  'images/coins.svg',
  'images/fullscreen.svg',
  'images/progress-50.svg',
  'images/warning-icon.svg',
  'images/cream-donut-icon.svg',
  'images/gears.svg',
  'images/progress-60.svg',
  'images/win.svg',
  'images/cream-icon.svg',
  'images/header.svg',
  'images/progress-70.svg',
  'images/xmas-factory-icon.svg',
  'images/cream.svg',
  'images/health-donut-icon.svg',
  'images/progress-80.svg',
  'images/decoration.svg',
  'images/highscore.svg',
  'images/progress-90.svg',
  'images/attacks-per-turn.svg',
  'images/buildings-per-turn.svg',
  'images/bunny-caught.svg',
  'images/cacao-per-turn.svg',
  'images/fruit-attacks-per-turn.svg',
  'images/spy-attacks-per-turn.svg',
];

export default defineConfig(({ command }) => ({
  cacheDir,
  plugins: [
    restartOnSharedChange(),
    react(),
    VitePWA({
      srcDir: 'src',
      filename: 'service-worker.js',
      strategies: 'injectManifest',
      injectRegister: false,
      manifest: false,
      injectManifest: {
        rollupFormat: 'iife',
        // the build, the fonts (public/fonts), the web app manifest and the media
        globPatterns: ['**/*.{js,css,html}', 'fonts/*.woff2', 'manifest.json', ...PRECACHED_MEDIA],
        maximumFileSizeToCacheInBytes: 20971520,
      },
    }),
  ],
  // the shared package is linked through the npm workspace and is CommonJS: the dev server
  // only converts it to ESM when it is pre-bundled like a dependency (see the top of this file)
  optimizeDeps: {
    include: ['@battlechoc/battlechoc-shared-functions'],
    force: command === 'serve' && sharedChanged(),
  },
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: 'build',
  },
}));
