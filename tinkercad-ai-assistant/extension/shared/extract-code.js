/*
 * Estrae il blocco di codice Arduino da una risposta Markdown del modello.
 * Il testo del modello è considerato non attendibile: qui viene solo analizzato
 * come stringa, mai interpretato come HTML o eseguito.
 *
 * Modulo UMD: caricato come content script (espone globalThis.TCAI.extractCode)
 * e importabile da Node per i test (module.exports).
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

  const CPP_LANGS = new Set(['cpp', 'c++', 'cxx', 'cc', 'c', 'arduino', 'ino', 'h', 'hpp']);

  const WARNING_MESSAGES = {
    MULTIPLE_BLOCKS: 'La risposta contiene più blocchi di codice: è stato usato il primo blocco C++.',
    TRUNCATED: 'La risposta del modello è stata troncata: controlla che il codice sia completo.',
    MISSING_SETUP_LOOP: 'Il codice non contiene sia setup() sia loop(): verificalo prima di usarlo.',
  };

  const NO_CODE_MESSAGES = {
    EMPTY: 'Il modello non ha restituito alcun contenuto.',
    NO_CODE_BLOCK: 'La risposta non contiene un blocco di codice.',
    UNCLOSED_BLOCK: 'Il blocco di codice non è chiuso (risposta probabilmente troncata).',
    WRONG_LANGUAGE: 'La risposta contiene codice, ma non in un blocco C++/Arduino.',
  };

  function warning(code) {
    return { code, message: WARNING_MESSAGES[code] };
  }

  /**
   * Divide il testo in blocchi fenced (``` o ~~~) e testo esterno.
   * Un blocco senza fence di chiusura viene marcato closed=false.
   */
  function parseFencedBlocks(text) {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const blocks = [];
    const outside = [];
    let i = 0;
    while (i < lines.length) {
      const open = /^ {0,3}(`{3,}|~{3,})[ \t]*([^\s`]*)[^`]*$/.exec(lines[i]);
      if (!open) {
        outside.push(lines[i]);
        i += 1;
        continue;
      }
      const fence = open[1];
      const lang = (open[2] || '').toLowerCase();
      const closeRe = new RegExp('^ {0,3}' + (fence[0] === '`' ? '`' : '~') + '{' + fence.length + ',}[ \\t]*$');
      const body = [];
      let j = i + 1;
      let closed = false;
      while (j < lines.length) {
        if (closeRe.test(lines[j])) {
          closed = true;
          break;
        }
        body.push(lines[j]);
        j += 1;
      }
      blocks.push({ lang, code: body.join('\n'), closed });
      i = closed ? j + 1 : lines.length;
    }
    return { blocks, outsideText: outside.join('\n').replace(/\n{3,}/g, '\n\n').trim() };
  }

  function normalizeCode(code) {
    return code.replace(/\s+$/, '') + '\n';
  }

  /**
   * @param {string} text risposta grezza del modello
   * @param {{finishReason?: string}} [options]
   * @returns {{hasCode: boolean, code: string, language: string, explanation: string,
   *           warnings: {code: string, message: string}[], reason?: string, reasonMessage?: string}}
   */
  function extractCode(text, options) {
    const finishReason = options && options.finishReason;
    const result = { hasCode: false, code: '', language: '', explanation: '', warnings: [] };

    if (typeof text !== 'string' || !text.trim()) {
      result.reason = 'EMPTY';
      result.reasonMessage = NO_CODE_MESSAGES.EMPTY;
      return result;
    }

    const { blocks, outsideText } = parseFencedBlocks(text);
    result.explanation = outsideText;

    const closed = blocks.filter((b) => b.closed && b.code.trim());
    if (!closed.length) {
      result.reason = blocks.some((b) => !b.closed) ? 'UNCLOSED_BLOCK' : 'NO_CODE_BLOCK';
      result.reasonMessage = NO_CODE_MESSAGES[result.reason];
      if (finishReason === 'length') result.warnings.push(warning('TRUNCATED'));
      return result;
    }

    const chosen = closed.find((b) => CPP_LANGS.has(b.lang)) || closed.find((b) => !b.lang);
    if (!chosen) {
      result.reason = 'WRONG_LANGUAGE';
      result.reasonMessage = NO_CODE_MESSAGES.WRONG_LANGUAGE;
      return result;
    }

    result.hasCode = true;
    result.code = normalizeCode(chosen.code);
    result.language = chosen.lang || 'cpp';
    if (closed.length > 1) result.warnings.push(warning('MULTIPLE_BLOCKS'));
    if (finishReason === 'length') result.warnings.push(warning('TRUNCATED'));
    if (!/\bvoid\s+setup\s*\(/.test(result.code) || !/\bvoid\s+loop\s*\(/.test(result.code)) {
      result.warnings.push(warning('MISSING_SETUP_LOOP'));
    }
    return result;
  }

  return { extractCode, parseFencedBlocks };
});
