import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
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
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: 'build',
  },
});
