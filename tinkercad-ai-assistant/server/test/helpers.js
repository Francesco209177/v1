'use strict';

// Dati condivisi dai test (questo file non contiene test: non termina con .test.js).

// PNG 1x1 valido.
const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const EXTENSION_ORIGIN = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';

function baseEnv(overrides = {}) {
  return {
    OPENROUTER_API_KEY: 'test-key-not-real',
    OPENROUTER_MODEL: 'test/vision-model',
    ...overrides,
  };
}

const silentLogger = { log() {}, warn() {}, error() {} };

module.exports = { PNG_DATA_URL, EXTENSION_ORIGIN, baseEnv, silentLogger };
