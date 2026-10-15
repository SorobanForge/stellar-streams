const js = require('@eslint/js');
const nextVitals = require('eslint-config-next/core-web-vitals');
const nextTs = require('eslint-config-next/typescript');
const prettier = require('eslint-config-prettier/flat');

/**
 * Shared flat ESLint config for the Stellar Streams monorepo.
 *
 * Composes, in order:
 *  - `eslint:recommended`
 *  - Next.js `core-web-vitals` (react, react-hooks, jsx-a11y, import, @next/next)
 *  - `eslint-config-next/typescript` (typescript-eslint recommended)
 *  - `eslint-config-prettier` (turns off rules that conflict with Prettier)
 *  - a few project-specific overrides
 *
 * The root `eslint.config.js` spreads this array so every workspace package
 * lints against the same ruleset.
 */
module.exports = [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/out/**',
      '**/build/**',
      '**/generated/**',
      '**/*.d.ts',
    ],
  },
  js.configs.recommended,
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      '@next/next/no-html-link-for-pages': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // eslint-config-next 16 ships eslint-plugin-react-hooks 7, which turns on
      // the React Compiler rules. They flag pre-existing, intentional patterns
      // (localStorage rehydration on mount, initial data fetch, render-time
      // clock reads). Keep them off so this config migration does not change the
      // lint result; re-enabling them is a separate cleanup.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
    },
  },
  {
    // This repository is CommonJS (the root package is not ESM), so its ESLint
    // config files are written with `require`.
    files: ['**/eslint.config.{js,cjs}', '**/eslint-config/**/*.{js,cjs}'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];
