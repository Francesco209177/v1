'use strict';

const js = require('@eslint/js');

const browser = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  globalThis: 'readonly',
  console: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  requestAnimationFrame: 'readonly',
  getComputedStyle: 'readonly',
  CustomEvent: 'readonly',
  MutationObserver: 'readonly',
  ResizeObserver: 'readonly',
  URL: 'readonly',
  AbortSignal: 'readonly',
  AbortController: 'readonly',
  fetch: 'readonly',
  crypto: 'readonly',
  chrome: 'readonly',
};

const serviceWorker = {
  self: 'readonly',
  importScripts: 'readonly',
  createImageBitmap: 'readonly',
  OffscreenCanvas: 'readonly',
  btoa: 'readonly',
};

const node = {
  require: 'readonly',
  module: 'writable',
  process: 'readonly',
  Buffer: 'readonly',
  __dirname: 'readonly',
  console: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  URL: 'readonly',
  AbortSignal: 'readonly',
  AbortController: 'readonly',
  fetch: 'readonly',
  Response: 'readonly',
  globalThis: 'readonly',
};

module.exports = [
  { ignores: ['**/node_modules/**', 'e2e/.profile/**', 'e2e/output/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: node },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
  {
    files: ['extension/**/*.js'],
    languageOptions: { globals: { ...browser, module: 'readonly' } },
    rules: {
      // Il testo del modello e della pagina non deve mai diventare HTML.
      'no-restricted-properties': [
        'error',
        { property: 'innerHTML', message: 'Usa textContent: il contenuto è non attendibile.' },
        { property: 'outerHTML', message: 'Usa textContent: il contenuto è non attendibile.' },
        { property: 'insertAdjacentHTML', message: 'Usa textContent: il contenuto è non attendibile.' },
      ],
      'no-eval': 'error',
    },
  },
  {
    // Le callback passate a page.evaluate() girano nel browser.
    files: ['e2e/**/*.js'],
    languageOptions: { globals: { ...node, ...browser } },
  },
  {
    files: ['extension/background.js', 'extension/shared/crop.js'],
    languageOptions: { globals: { ...browser, ...serviceWorker, module: 'readonly' } },
  },
];
