/*
 * Macchina a stati del pulsante AI.
 *   IDLE        pulsante neutro
 *   GENERATING  richiesta in corso
 *   SUCCESS     codice ricevuto, estratto e copiato negli appunti (verde)
 *   ERROR       generazione o copia fallita (rosso)
 *
 * Modulo UMD: content script (globalThis.TCAI) e Node (test).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.TCAI = Object.assign(root.TCAI || {}, api);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STATES = Object.freeze({
    IDLE: 'IDLE',
    GENERATING: 'GENERATING',
    SUCCESS: 'SUCCESS',
    ERROR: 'ERROR',
  });

  // GENERATING -> IDLE: risposta senza codice (es. richiesta di chiarimenti).
  // ERROR -> SUCCESS: copia manuale riuscita dopo una copia automatica fallita.
  // SUCCESS -> ERROR: nuova copia manuale fallita.
  const TRANSITIONS = Object.freeze({
    IDLE: ['GENERATING'],
    GENERATING: ['SUCCESS', 'ERROR', 'IDLE'],
    SUCCESS: ['GENERATING', 'ERROR', 'IDLE'],
    ERROR: ['GENERATING', 'SUCCESS', 'IDLE'],
  });

  function createStateMachine(onChange) {
    let state = STATES.IDLE;
    return {
      get state() {
        return state;
      },
      can(next) {
        return TRANSITIONS[state].includes(next);
      },
      transition(next, detail) {
        if (!Object.prototype.hasOwnProperty.call(STATES, next)) {
          throw new Error('Stato sconosciuto: ' + next);
        }
        if (!TRANSITIONS[state].includes(next)) return false;
        const prev = state;
        state = next;
        if (typeof onChange === 'function') onChange(next, prev, detail);
        return true;
      },
    };
  }

  return { STATES, TRANSITIONS, createStateMachine };
});
