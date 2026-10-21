module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  extends: 'eslint:recommended',
  ignorePatterns: ['node_modules/', 'dist/', 'coverage/', 'prisma/'],
  rules: {
    // Unused variables are usually a real bug in server code.
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'eqeqeq': ['error', 'smart'],
    'no-var': 'error',
    'prefer-const': 'error',
    'no-console': 'off'
  },
  overrides: [
    {
      // Tests may use console output.
      files: ['tests/**/*.js'],
      env: { node: true },
      rules: {
        'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
      }
    }
  ]
};
