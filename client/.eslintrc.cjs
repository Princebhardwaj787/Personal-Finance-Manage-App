module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended'
  ],
  ignorePatterns: [
    'dist',
    '.eslintrc.cjs',
    // The Android project holds a COPY of the built web bundle in
    // `android/app/src/main/assets/public`. It is generated output and must
    // never be linted.
    'android/'
  ],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18.2' } },
  plugins: ['react-refresh'],
  rules: {
    'react/prop-types': 'off',
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }]
  },
  overrides: [
    {
      // Build-time configuration files run in Node, not in the browser.
      files: ['alias.config.js', 'vite.config.js', 'vitest.config.js'],
      env: { node: true, browser: false }
    }
  ]
};
