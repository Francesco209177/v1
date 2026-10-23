'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateGenerateRequest } = require('../validate');
const { PNG_DATA_URL } = require('./helpers');

const opts = { maxImageChars: 1024 * 1024 };

test('accetta una richiesta minima e normalizza i campi', () => {
  const r = validateGenerateRequest({ prompt: '  Fai lampeggiare il LED  ' }, opts);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, {
    prompt: 'Fai lampeggiare il LED',
    image: null,
    currentCode: null,
    editorMode: null,
    device: null,
    components: [],
    cropped: false,
  });
});

test('accetta tutti i campi validi', () => {
  const r = validateGenerateRequest(
    {
      prompt: 'Blink',
      image: PNG_DATA_URL,
      currentCode: 'void setup() {}\nvoid loop() {}',
      editorMode: 'Text',
      device: '1 (Arduino Uno R3)',
      components: [{ type: 'Arduino-Uno-R3', count: 1 }],
      cropped: true,
    },
    opts
  );
  assert.equal(r.ok, true);
  assert.equal(r.value.image, PNG_DATA_URL);
  assert.deepEqual(r.value.components, [{ type: 'arduino-uno-r3', count: 1 }]);
  assert.equal(r.value.cropped, true);
});

test('rifiuta corpo non oggetto, prompt mancante o vuoto', () => {
  assert.equal(validateGenerateRequest(null, opts).ok, false);
  assert.equal(validateGenerateRequest([], opts).ok, false);
  assert.equal(validateGenerateRequest({}, opts).ok, false);
  assert.equal(validateGenerateRequest({ prompt: '   ' }, opts).ok, false);
  assert.equal(validateGenerateRequest({ prompt: 42 }, opts).ok, false);
});

test('rifiuta prompt troppo lungo e campi sconosciuti', () => {
  assert.equal(validateGenerateRequest({ prompt: 'x'.repeat(4001) }, opts).ok, false);
  const r = validateGenerateRequest({ prompt: 'ok', apiKey: 'x' }, opts);
  assert.equal(r.ok, false);
  assert.match(r.message, /apiKey/);
});

test('rifiuta immagini non valide', () => {
  const bad = [
    'https://example.com/a.png',
    'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
    'data:image/png;base64,not base64!',
    'data:image/jpeg;base64,' + PNG_DATA_URL.split(',')[1], // firma PNG dichiarata come JPEG
    123,
  ];
  for (const image of bad) {
    assert.equal(validateGenerateRequest({ prompt: 'ok', image }, opts).ok, false, String(image).slice(0, 40));
  }
  const tooBig = validateGenerateRequest({ prompt: 'ok', image: PNG_DATA_URL }, { maxImageChars: 10 });
  assert.equal(tooBig.ok, false);
});

test('rifiuta codice troppo lungo e componenti non validi', () => {
  assert.equal(validateGenerateRequest({ prompt: 'ok', currentCode: 'x'.repeat(20001) }, opts).ok, false);
  assert.equal(validateGenerateRequest({ prompt: 'ok', components: 'led' }, opts).ok, false);
  assert.equal(validateGenerateRequest({ prompt: 'ok', components: [{ type: '<script>', count: 1 }] }, opts).ok, false);
  assert.equal(validateGenerateRequest({ prompt: 'ok', components: [{ type: 'led', count: 0 }] }, opts).ok, false);
  assert.equal(validateGenerateRequest({ prompt: 'ok', components: [{ type: 'led', count: 1.5 }] }, opts).ok, false);
  const many = Array.from({ length: 101 }, () => ({ type: 'led', count: 1 }));
  assert.equal(validateGenerateRequest({ prompt: 'ok', components: many }, opts).ok, false);
  assert.equal(validateGenerateRequest({ prompt: 'ok', cropped: 'yes' }, opts).ok, false);
});
