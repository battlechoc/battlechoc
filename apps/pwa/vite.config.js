import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// The shared package is linked through the npm workspace and is CommonJS, so the dev server
// pre-bundles it like a dependency (optimizeDeps below). Vite rebuilds that bundle only when
// the lockfile or this config changes, never when the shared sources change: a stale bundle
// misses new exports and crashes the app. So the dev server re-bundles whenever the sources
// differ from the last bundle, and restarts itself when they change while it runs.
const here = path.dirname(fileURLToPath(import.meta.url));
// the build's version (src/build.js, the Info dialog, the API headers): package.json's, which
// release-please raises; also for a build that does not run through npm
const { version } = JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8'));
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

// The page opens its connection to the API (DNS and TLS: several round trips on a phone) while
// the game's script still loads. The API is the build's own (VITE_API_URL, else the game's
// default as in src/account.js): a build for a local stack or for the e2e tests does not reach
// out to the live server.
const DEFAULT_API_URL = 'https://api.battlechoc.com';
const preconnectApi = (mode) => ({
  name: 'battlechoc-preconnect-api',
  transformIndexHtml() {
    const { VITE_API_URL } = loadEnv(mode, here, 'VITE_');
    return [
      {
        tag: 'link',
        attrs: { rel: 'preconnect', href: new URL(VITE_API_URL || DEFAULT_API_URL).origin, crossorigin: true },
        injectTo: 'head',
      },
    ];
  },
});

// Vite writes the stylesheet behind the script and the chunks it preloads. Over HTTP/1.1 (the
// Docker image, vite preview) a browser opens six connections at a time: once the entry had four
// chunks, the stylesheet waited behind the fonts, the logo and the scripts for a free one, and
// the page stayed blank meanwhile (first paint 0.24 s -> 0.93 s at 4 Mbit/s). The stylesheet goes
// in front of the first preload.
const stylesheetFirst = () => ({
  name: 'battlechoc-stylesheet-first',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler(html) {
      const stylesheet = /[ \t]*<link rel="stylesheet"[^>]*>\r?\n?/g;
      const links = html.match(stylesheet);
      const firstPreload = html.search(/[ \t]*<link rel="preload"/);
      if (!links || firstPreload === -1) {
        return html;
      }
      const head = html.slice(0, firstPreload);
      const rest = html.slice(firstPreload).replace(stylesheet, '');
      return head + links.map((link) => link.trimEnd() + '\n').join('') + rest;
    },
  },
});

// The media the game needs offline: all of these folders of public/. Workbox gives each file a
// revision of its content, so a changed picture or model reaches installed games with the next
// build, and a new file is precached without being listed anywhere. (The list was kept by hand,
// one path per file, and three pictures the game shows were missing from it.)
const PRECACHED_MEDIA = ['images/**', 'models/**', 'sound/**', 'music/**', 'textures/**'];
const NOT_PRECACHED = [
  // the picture of link previews (Open Graph, index.html): chats fetch it, the game never does
  'images/challenge-preview.jpg',
];

// Babylon ships every shader twice, GLSL for WebGL and WGSL for WebGPU, and imports the set of
// the engine in use on demand. The game only creates the WebGL `Engine` (src/3d/Scene.jsx,
// MeshPreview.jsx), so the 42 WGSL chunks (0.5 MB) were built and precached and never loaded.
// They are named like their GLSL twins, no glob can tell them apart: the build resolves every
// WGSL shader to one empty module instead, and refuses the WebGPU engine, which would need them.
const WGSL_SHADER = /[\\/]@babylonjs[\\/]core[\\/]ShadersWGSL[\\/]/;
const WEBGPU_ENGINE = /[\\/]@babylonjs[\\/]core[\\/]Engines[\\/]webgpuEngine/;
const NO_WGSL = '\0battlechoc:no-wgsl-shaders';
const withoutWgslShaders = () => ({
  name: 'battlechoc-no-wgsl-shaders',
  apply: 'build',
  enforce: 'pre',
  async resolveId(source, importer, options) {
    if (!/ShadersWGSL|webgpuEngine/.test(source)) {
      return null;
    }
    const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
    if (resolved && WEBGPU_ENGINE.test(resolved.id)) {
      this.error('the build leaves out the WGSL shaders (vite.config.js): bundle them again before using the WebGPU engine');
    }
    return resolved && WGSL_SHADER.test(resolved.id) ? NO_WGSL : resolved;
  },
  load(id) {
    return id === NO_WGSL ? 'export {};' : null;
  },
});

// Chunks only a road the game never takes leads to. Babylon imports a texture loader by file
// extension and the OpenPBR material by glTF extension; the game's textures are sky.env and what
// its GLBs embed (PNG, JPEG, WebP), and its GLBs use the standard PBR material (src/3d/gltf.js
// registers no OpenPBR extension). The build still writes these chunks, so they would load
// online, but the service worker does not precache them (0.35 MB). Found by walking the chunk
// graph, not by name: what anything else imports as well stays in the precache.
const NEVER_IMPORTED = [
  /[\\/]@babylonjs[\\/]core[\\/]Materials[\\/]Textures[\\/]Loaders[\\/](basis|dds|exr|hdr|ies|ktx|tga)TextureLoader\.js$/,
  /[\\/]@babylonjs[\\/]core[\\/]Materials[\\/]PBR[\\/]openpbrMaterial(\.pure)?\.js$/,
  /[\\/]@babylonjs[\\/]loaders[\\/]glTF[\\/]2\.0[\\/]openpbrMaterialLoadingAdapter\.js$/,
];
const unreachableChunks = new Set();
const findUnreachableChunks = () => ({
  name: 'battlechoc-unreachable-chunks',
  apply: 'build',
  generateBundle(options, bundle) {
    const chunks = Object.values(bundle).filter((file) => file.type === 'chunk');
    const neverImported = (chunk) =>
      chunk.isDynamicEntry && NEVER_IMPORTED.some((pattern) => pattern.test(chunk.facadeModuleId || ''));
    const reached = new Set();
    const visit = (fileName) => {
      const chunk = bundle[fileName];
      if (!chunk || reached.has(fileName)) {
        return;
      }
      reached.add(fileName);
      chunk.imports.forEach(visit);
      chunk.dynamicImports.filter((name) => bundle[name] && !neverImported(bundle[name])).forEach(visit);
    };
    chunks.filter((chunk) => chunk.isEntry).forEach((chunk) => visit(chunk.fileName));
    unreachableChunks.clear();
    chunks.filter((chunk) => !reached.has(chunk.fileName)).forEach((chunk) => unreachableChunks.add(chunk.fileName));
    // Babylon moves its files now and then: a pattern that names no chunk any more saves nothing
    for (const pattern of NEVER_IMPORTED) {
      if (!chunks.some((chunk) => chunk.isDynamicEntry && pattern.test(chunk.facadeModuleId || ''))) {
        this.warn(`no chunk matches ${pattern} any more (NEVER_IMPORTED in vite.config.js)`);
      }
    }
  },
});

export default defineConfig(({ command, mode }) => ({
  cacheDir,
  define: {
    'import.meta.env.VITE_VERSION': JSON.stringify(version),
  },
  plugins: [
    restartOnSharedChange(),
    preconnectApi(mode),
    stylesheetFirst(),
    withoutWgslShaders(),
    findUnreachableChunks(),
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
        globIgnores: NOT_PRECACHED,
        manifestTransforms: [
          (entries) => ({
            manifest: entries.filter((entry) => !unreachableChunks.has(entry.url)),
            warnings: [],
          }),
        ],
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
  },
  build: {
    outDir: 'build',
    rolldownOptions: {
      output: {
        // What the entry imports statically is one chunk, "app" (a group takes its module's
        // static dependencies along). Left alone, Rolldown cut it into five: whatever the entry
        // shares with a lazily loaded chunk became a request of its own before the first render
        // (3 kB gzip more, and over HTTP/1.1 the logo arrived 0.3 s later behind them).
        codeSplitting: {
          groups: [{ name: 'app', test: /[\\/]src[\\/]index\.jsx$/ }],
        },
      },
    },
  },
}));
