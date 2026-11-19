import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sharedAlias, isAndroidBuild } from './alias.config.js';

/** Large third-party libraries split into their own chunks so the Android
 *  WebView parses less JavaScript up front on every route change. */
const VENDOR_GROUPS = {
  react: ['react', 'react-dom', 'scheduler'],
  router: ['react-router-dom'],
  http: ['axios'],
  dates: ['date-fns'],
  charts: ['recharts', 'd3-', 'react-is'],
  capacitor: ['@capacitor', '@capawesome'],
};

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
      sourcemap: !android,
      // Warn when any single chunk exceeds 400 kB after minification.
      chunkSizeWarningLimit: 400,
      rollupOptions: {
        output: {
          // Split vendor code into its own chunks so the app's own code can be
          // cached independently and the initial parse on a slow WebView is
          // smaller.
          manualChunks: (id) => {
            if (!id.includes('node_modules')) return null;

            for (const [group, patterns] of Object.entries(VENDOR_GROUPS)) {
              if (patterns.some((p) => id.includes(p))) return `vendor-${group}`;
            }
            // Everything else that doesn't match a named group goes here.
            return 'vendor-base';
          },
          // Deterministic chunk names so browser caching works across builds.
          entryFileNames: `assets/[name]-[hash].js`,
          chunkFileNames: `assets/[name]-[hash].js`,
          assetFileNames: `assets/[name]-[hash].[ext]`
        }
      }
    }
  };
});
