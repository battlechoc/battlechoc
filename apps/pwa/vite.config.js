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
  const stamp = path.join(here, 'node_modules', '.vite', 'battlechoc-shared.hash');
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

export default defineConfig(({ command }) => ({
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
