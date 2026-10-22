import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sharedAlias, isAndroidBuild } from './alias.config.js';

export default defineConfig(({ mode }) => {
  const android = isAndroidBuild(mode);

  return {
    plugins: [react()],

    resolve: {
      alias: sharedAlias
    },

    // The Android WebView loads the bundle from a local origin, so assets
    // must be referenced RELATIVELY. The web build keeps absolute paths so
    // deep links such as /transactions continue to work.
    base: android ? './' : '/',

    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true
        }
      },
      // The dev server must be allowed to read the repository-level
      // `shared/` folder, which lives outside `client/`.
      fs: {
        allow: ['..']
      }
    },

    build: {
      outDir: 'dist',
      // The Android WebView on older devices is slow with modern JS.
      target: android ? 'es2019' : 'es2020',
      sourcemap: !android
    }
  };
});
