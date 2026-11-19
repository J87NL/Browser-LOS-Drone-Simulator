import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works from any folder on any static host.
  base: './',
  // Build into public/ so a web server's document root can point there
  // (Laravel style) and src/, node_modules/ and .git/ stay outside it.
  // Static files (the optional photo-quality images) live in static/ and are
  // copied into the build; public/ is only the build output.
  publicDir: 'static',
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
