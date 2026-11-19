import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works from any folder on any static host.
  base: './',
  // Build into public/ so a web server's document root can point there
  // (Laravel style) and src/, node_modules/ and .git/ stay outside it.
  // Vite's own "copy public/ as-is" feature is switched off: the project has
  // no static files, and the build output must not be fed back into itself.
  publicDir: false,
  build: {
    outDir: 'public',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
});
