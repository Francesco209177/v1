/*
 * Scorciatoie da tastiera nella pagina di Tinkercad:
 *   Ctrl+Shift+A  nasconde pulsante e pannello (senza azzerare nulla)
 *   Ctrl+Shift+Z  li mostra di nuovo, ma solo se sono nascosti: con l'assistente visibile
 *                 la combinazione resta a Tinkercad, dove significa "Ripeti" (redo).
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

  const HOTKEYS = Object.freeze({
    hide: Object.freeze({ letter: 'a', label: 'Ctrl+Shift+A' }),
    show: Object.freeze({ letter: 'z', label: 'Ctrl+Shift+Z' }),
  });

  /** Lettera premuta: da event.key (rispetta il layout), altrimenti dal tasto fisico (event.code). */
  function pressedLetter(event) {
    const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
    if (/^[a-z]$/.test(key)) return key;
    const match = /^Key([A-Z])$/.exec(event.code || '');
    return match ? match[1].toLowerCase() : '';
  }

  /**
   * @param {{key?: string, code?: string, ctrlKey?: boolean, shiftKey?: boolean, altKey?: boolean, metaKey?: boolean}} event
   * @param {{active: boolean, hidden: boolean}} state active = editor dei circuiti con l'assistente caricato
   * @returns {'hide'|'show'|null}
   */
  function resolveHotkey(event, state) {
    if (!event || !state || !state.active) return null;
    if (!event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey) return null;
    const letter = pressedLetter(event);
    // Anche se già nascosto: la combinazione resta all'assistente (altrimenti Chrome aprirebbe la Ricerca schede).
    if (letter === HOTKEYS.hide.letter) return 'hide';
    if (letter === HOTKEYS.show.letter && state.hidden) return 'show';
    return null;
  }

  return { HOTKEYS, resolveHotkey };
});
