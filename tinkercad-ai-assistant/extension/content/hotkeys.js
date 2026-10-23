/*
 * Listener delle scorciatoie (mondo isolato, run_at: document_start).
 * Viene registrato prima degli script di Tinkercad, in fase di cattura su window:
 * le combinazioni gestite dall'assistente non raggiungono la pagina né il browser
 * (Ctrl+Shift+A in Chrome aprirebbe la Ricerca schede). Tutti gli altri tasti passano invariati.
 * Finché content.js non registra i gestori, non intercetta nulla.
 */
(function (root) {
  'use strict';

  const { resolveHotkey } = root.TCAI;
  let handlers = null;
  let swallowKeyUpCode = null;

  window.addEventListener(
    'keydown',
    (event) => {
      if (!handlers) return;
      let action;
      try {
        action = resolveHotkey(event, { active: handlers.isActive(), hidden: handlers.isHidden() });
      } catch {
        return;
      }
      if (!action) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      swallowKeyUpCode = event.code;
      if (!event.repeat) handlers[action]();
    },
    true
  );

  window.addEventListener(
    'keyup',
    (event) => {
      if (swallowKeyUpCode && event.code === swallowKeyUpCode) {
        swallowKeyUpCode = null;
        event.stopImmediatePropagation();
      }
    },
    true
  );

  root.TCAI = Object.assign(root.TCAI || {}, {
    hotkeys: {
      /** @param {{isActive: () => boolean, isHidden: () => boolean, hide: () => void, show: () => void}|null} next */
      register(next) {
        handlers = next;
      },
    },
  });
})(globalThis);
