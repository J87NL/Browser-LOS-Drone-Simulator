import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so dist/ works from any folder on any static host.
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
});
