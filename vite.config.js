import { defineConfig } from 'vite';

export default defineConfig({
  // Use relative base so assets load correctly on GitHub Pages (/Little-big-help-/) and custom domains
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
});
