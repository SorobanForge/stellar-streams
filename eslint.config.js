const sharedConfig = require('@stellar-starter-kit/eslint-config');

/**
 * Flat ESLint configuration (ESLint 9).
 *
 * This file replaces the legacy `.eslintrc.json` and `.eslintignore`; ignore
 * patterns now live inside the config itself (see the shared config below).
 *
 * The ruleset is owned by `@stellar-starter-kit/eslint-config`, so every
 * workspace package is linted identically, and the web app picks up the
 * Next.js-specific rules from the same source.
 */
module.exports = [...sharedConfig];
