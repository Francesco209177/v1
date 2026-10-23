'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { STATES, createStateMachine } = require('../extension/shared/state-machine');

test('flusso completo IDLE -> GENERATING -> SUCCESS -> GENERATING -> ERROR', () => {
  const seen = [];
  const m = createStateMachine((next, prev) => seen.push(`${prev}>${next}`));
  assert.equal(m.state, STATES.IDLE);
  assert.equal(m.transition(STATES.GENERATING), true);
  assert.equal(m.transition(STATES.SUCCESS), true);
  assert.equal(m.transition(STATES.GENERATING), true);
  assert.equal(m.transition(STATES.ERROR), true);
  assert.deepEqual(seen, ['IDLE>GENERATING', 'GENERATING>SUCCESS', 'SUCCESS>GENERATING', 'GENERATING>ERROR']);
});

test('il verde non è raggiungibile senza passare dalla generazione', () => {
  const m = createStateMachine();
  assert.equal(m.can(STATES.SUCCESS), false);
  assert.equal(m.transition(STATES.SUCCESS), false);
  assert.equal(m.state, STATES.IDLE);
});

test('risposta senza codice torna a IDLE; copia manuale riuscita da ERROR a SUCCESS', () => {
  const m = createStateMachine();
  m.transition(STATES.GENERATING);
  assert.equal(m.transition(STATES.IDLE), true);
  m.transition(STATES.GENERATING);
  m.transition(STATES.ERROR);
  assert.equal(m.transition(STATES.SUCCESS), true);
});

test('stato sconosciuto: errore', () => {
  const m = createStateMachine();
  assert.throws(() => m.transition('GREEN'), /Stato sconosciuto/);
});

test('GENERATING non si ripete', () => {
  const m = createStateMachine();
  m.transition(STATES.GENERATING);
  assert.equal(m.transition(STATES.GENERATING), false);
});
