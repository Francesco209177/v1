'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveHotkey } = require('../extension/shared/hotkeys');

const visible = { active: true, hidden: false };
const hidden = { active: true, hidden: true };
const ctrlShift = (key, extra = {}) => ({ key, code: `Key${key.toUpperCase()}`, ctrlKey: true, shiftKey: true, ...extra });

test('Ctrl+Shift+A nasconde, anche se già nascosto', () => {
  assert.equal(resolveHotkey(ctrlShift('A'), visible), 'hide');
  assert.equal(resolveHotkey(ctrlShift('a'), visible), 'hide');
  assert.equal(resolveHotkey(ctrlShift('A'), hidden), 'hide');
});

test('Ctrl+Shift+Z mostra solo se nascosto (altrimenti resta il redo di Tinkercad)', () => {
  assert.equal(resolveHotkey(ctrlShift('Z'), hidden), 'show');
  assert.equal(resolveHotkey(ctrlShift('Z'), visible), null);
});

test('altri modificatori o combinazioni non vengono intercettati', () => {
  assert.equal(resolveHotkey({ key: 'A', code: 'KeyA', ctrlKey: true }, visible), null);
  assert.equal(resolveHotkey({ key: 'A', code: 'KeyA', shiftKey: true }, visible), null);
  assert.equal(resolveHotkey(ctrlShift('A', { altKey: true }), visible), null);
  assert.equal(resolveHotkey(ctrlShift('A', { metaKey: true }), visible), null);
  assert.equal(resolveHotkey(ctrlShift('Y'), hidden), null);
  assert.equal(resolveHotkey({ key: 'z', code: 'KeyZ', ctrlKey: true }, hidden), null); // Ctrl+Z = annulla
});

test('nessuna intercettazione fuori dall\'editor dei circuiti', () => {
  assert.equal(resolveHotkey(ctrlShift('A'), { active: false, hidden: false }), null);
  assert.equal(resolveHotkey(ctrlShift('Z'), { active: false, hidden: true }), null);
  assert.equal(resolveHotkey(null, visible), null);
});

test('layout non latini: si usa il tasto fisico', () => {
  assert.equal(resolveHotkey({ key: 'Ф', code: 'KeyA', ctrlKey: true, shiftKey: true }, visible), 'hide');
  assert.equal(resolveHotkey({ key: 'Я', code: 'KeyZ', ctrlKey: true, shiftKey: true }, hidden), 'show');
  // Con un layout latino vale la lettera: su AZERTY il tasto fisico "KeyQ" produce "a".
  assert.equal(resolveHotkey({ key: 'A', code: 'KeyQ', ctrlKey: true, shiftKey: true }, visible), 'hide');
});
