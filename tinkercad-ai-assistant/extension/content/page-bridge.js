/*
 * Eseguito nel MAIN world della pagina Tinkercad (manifest: "world": "MAIN").
 *
 * L'editor di testo di Tinkercad Circuits è CodeMirror 5: l'istanza è esposta come
 * proprietà `CodeMirror` dell'elemento `.CodeMirror`, visibile solo dal contesto
 * JavaScript della pagina e non dal mondo isolato del content script.
 * Questo script fa una sola cosa: su richiesta legge il testo con getValue()
 * e lo restituisce come stringa JSON. Non modifica l'editor né la pagina.
 */
(function () {
  'use strict';

  const REQUEST_EVENT = 'tcai:code-request';
  const RESPONSE_EVENT = 'tcai:code-response';
  const MAX_CODE_CHARS = 20000;
  const EDITOR_SELECTORS = ['.js-code_panel__texteditor .CodeMirror', '.code_panel .CodeMirror'];

  function readCode() {
    for (const selector of EDITOR_SELECTORS) {
      const el = document.querySelector(selector);
      const cm = el && el.CodeMirror;
      if (cm && typeof cm.getValue === 'function') {
        const value = String(cm.getValue());
        return {
          code: value.slice(0, MAX_CODE_CHARS),
          truncated: value.length > MAX_CODE_CHARS,
          source: 'codemirror',
        };
      }
    }
    return { code: null, truncated: false, source: 'unavailable' };
  }

  document.addEventListener(REQUEST_EVENT, (event) => {
    // I dati tra mondi diversi viaggiano come stringhe: gli oggetti non sono condivisi.
    let id;
    try {
      id = JSON.parse(event.detail).id;
    } catch {
      return;
    }
    if (typeof id !== 'string') return;
    let payload;
    try {
      payload = readCode();
    } catch {
      payload = { code: null, truncated: false, source: 'error' };
    }
    document.dispatchEvent(new CustomEvent(RESPONSE_EVENT, { detail: JSON.stringify({ id, ...payload }) }));
  });
})();
