import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  // Use relative base so assets load correctly on GitHub Pages and custom domains
  base: './',
  server: {
    allowedHosts: true,
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {}
  },
  preview: {
    allowedHosts: true
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
        login: resolve(__dirname, 'admin-login.html')
      }
    }
  }
});
