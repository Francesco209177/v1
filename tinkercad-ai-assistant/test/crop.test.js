'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { computeCrop, fitWithin } = require('../extension/shared/crop');

const viewport = { width: 1400, height: 900 };

test('ritaglia l\'area del circuito considerando il devicePixelRatio', () => {
  // Screenshot a 2x; circuito sotto la barra (48px) e a sinistra del pannello codice (x=792).
  const crop = computeCrop(2800, 1800, { x: 0, y: 48, width: 792, height: 852 }, viewport);
  assert.deepEqual(crop, { sx: 0, sy: 96, sw: 1584, sh: 1704, cropped: true });
});

test('immagine intera se il rettangolo manca, è troppo piccolo o copre tutta la viewport', () => {
  const full = { sx: 0, sy: 0, sw: 1400, sh: 900, cropped: false };
  assert.deepEqual(computeCrop(1400, 900, null, viewport), full);
  assert.deepEqual(computeCrop(1400, 900, { x: 0, y: 0, width: 150, height: 900 }, viewport), full);
  assert.deepEqual(computeCrop(1400, 900, { x: 0, y: 0, width: 1400, height: 900 }, viewport), full);
  assert.deepEqual(computeCrop(1400, 900, { x: NaN, y: 0, width: 10, height: 10 }, viewport), full);
  assert.deepEqual(computeCrop(1400, 900, { x: 0, y: 0, width: 500, height: 500 }, null), full);
});

test('immagine intera se le proporzioni non corrispondono alla viewport', () => {
  const crop = computeCrop(1400, 1200, { x: 0, y: 48, width: 792, height: 852 }, viewport);
  assert.equal(crop.cropped, false);
});

test('rettangolo parzialmente fuori viewport viene limitato', () => {
  const crop = computeCrop(1400, 900, { x: -100, y: 48, width: 900, height: 2000 }, viewport);
  assert.deepEqual(crop, { sx: 0, sy: 48, sw: 800, sh: 852, cropped: true });
});

test('fitWithin rispetta il lato massimo', () => {
  assert.deepEqual(fitWithin(3200, 1600, 1600), { width: 1600, height: 800 });
  assert.deepEqual(fitWithin(800, 600, 1600), { width: 800, height: 600 });
});
