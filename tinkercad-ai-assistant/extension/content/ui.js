/*
 * Interfaccia nella pagina: pulsante "AI" flottante e pannello del prompt.
 * Tutto vive in uno Shadow DOM agganciato a un unico host (#tcai-root):
 * - gli stili di Tinkercad e dell'estensione non si influenzano a vicenda;
 * - l'albero DOM di Tinkercad non viene modificato;
 * - il testo del modello viene inserito solo con textContent (mai innerHTML).
 */
(function (root) {
  'use strict';

  const { STATES } = root.TCAI;

  const HOST_ID = 'tcai-root';
  const BUTTON = { width: 44, height: 30 };
  const GAP = 12;
  const EDGE = 16;
  const PANEL_MAX_WIDTH = 380;
  const DRAG_THRESHOLD = 4;

  const TOOLTIPS = {
    [STATES.IDLE]: 'AI Code Assistant: genera codice Arduino dal circuito',
    [STATES.GENERATING]: 'Generazione del codice in corso…',
    [STATES.SUCCESS]: 'Codice pronto e copiato negli appunti',
    [STATES.ERROR]: 'Si è verificato un problema: apri il pannello per i dettagli',
  };

  // Eventi che non devono raggiungere i gestori di Tinkercad (scorciatoie, copia/incolla di componenti, pan...).
  const ISOLATED_EVENTS = [
    'keydown', 'keyup', 'keypress', 'input', 'copy', 'cut', 'paste',
    'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'wheel', 'touchstart',
  ];

  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'text') el.textContent = value;
      else if (key === 'className') el.className = value;
      else el.setAttribute(key, value === true ? '' : String(value));
    }
    for (const child of children) if (child) el.append(child);
    return el;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }

  /**
   * @param {object} handlers
   * @param {() => void} handlers.onGenerate
   * @param {() => void} handlers.onCopy
   * @param {(pos: {xFrac: number, yFrac: number}) => void} [handlers.onDragEnd]
   */
  function createUI(handlers) {
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

    const host = h('div', { id: HOST_ID, 'data-tcai': '' });
    host.style.cssText =
      'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483000; visibility: hidden;';
    const shadow = host.attachShadow({ mode: 'open' });

    const flags = { styled: false, active: false, capturing: false };
    let manualPosition = null;
    let buttonPos = { left: 0, top: 0 };
    let lastAnchors = {};

    const stylesheet = h('link', { rel: 'stylesheet', href: chrome.runtime.getURL('content/panel.css') });
    stylesheet.addEventListener('load', () => {
      flags.styled = true;
      applyVisibility();
    });
    stylesheet.addEventListener('error', () => {
      flags.styled = true; // meglio un'interfaccia senza stile che nessuna interfaccia
      applyVisibility();
    });

    // --- Pulsante ---------------------------------------------------------
    const button = h(
      'button',
      {
        className: 'ai-btn',
        type: 'button',
        'data-state': STATES.IDLE,
        'aria-haspopup': 'dialog',
        'aria-expanded': 'false',
        'aria-label': TOOLTIPS[STATES.IDLE],
      },
      h('span', { className: 'ai-btn__label', text: 'AI' }),
      h('span', { className: 'ai-btn__spinner', 'aria-hidden': 'true' })
    );
    const tooltip = h('div', { className: 'tooltip', role: 'tooltip', text: TOOLTIPS[STATES.IDLE] });

    // --- Pannello ---------------------------------------------------------
    const closeButton = h('button', { className: 'icon-btn', type: 'button', 'aria-label': 'Chiudi', title: 'Chiudi (Esc)', text: '×' });
    const prompt = h('textarea', {
      id: 'tcai-prompt',
      className: 'prompt',
      rows: 3,
      maxlength: 4000,
      spellcheck: 'true',
      placeholder: 'Es. Fai lampeggiare il LED collegato al pin 13 ogni secondo.',
    });
    const generateButton = h('button', { className: 'btn btn--primary', type: 'button', text: 'Genera codice' });
    const shortcutHint = h('span', { className: 'hint', text: `${isMac ? '⌘' : 'Ctrl'}+Invio per generare` });

    const statusText = h('span', { className: 'status__text' });
    const status = h('div', { className: 'status', hidden: true, 'aria-live': 'polite' }, h('span', { className: 'loader', 'aria-hidden': 'true' }), statusText);

    const messageText = h('p', { className: 'message__text' });
    const messageAction = h('button', { className: 'btn btn--small message__action', type: 'button', hidden: true });
    const message = h('div', { className: 'message', role: 'alert', hidden: true }, messageText, messageAction);

    const explanation = h('p', { className: 'result__explanation' });
    const warningsList = h('ul', { className: 'result__warnings' });
    // textarea in sola lettura: mostra il codice come testo semplice e permette select() per la copia manuale.
    const codeBlock = h('textarea', {
      className: 'code',
      readonly: true,
      wrap: 'off',
      spellcheck: 'false',
      'aria-label': 'Codice generato',
    });
    const meta = h('span', { className: 'result__meta' });
    const copyButton = h('button', { className: 'btn', type: 'button', text: 'Copia codice' });
    const result = h(
      'div',
      { className: 'result', hidden: true },
      explanation,
      warningsList,
      codeBlock,
      h('div', { className: 'row' }, meta, copyButton)
    );

    const responseText = h('pre', { className: 'response__text' });
    const response = h(
      'div',
      { className: 'response', hidden: true },
      h('p', { className: 'response__label', text: 'Risposta del modello (non copiata negli appunti):' }),
      responseText
    );

    const panel = h(
      'section',
      { className: 'panel', role: 'dialog', 'aria-labelledby': 'tcai-title', hidden: true },
      h(
        'header',
        { className: 'panel__header' },
        h('h2', { id: 'tcai-title', className: 'panel__title' }, h('span', { className: 'panel__badge', text: 'AI' }), document.createTextNode('AI Code Assistant')),
        closeButton
      ),
      h(
        'div',
        { className: 'panel__body' },
        h('label', { className: 'sr-only', for: 'tcai-prompt', text: 'Descrivi il comportamento desiderato' }),
        prompt,
        h('div', { className: 'row' }, shortcutHint, generateButton),
        status,
        message,
        result,
        response
      )
    );

    shadow.append(stylesheet, button, tooltip, panel);

    for (const type of ISOLATED_EVENTS) {
      shadow.addEventListener(type, (event) => event.stopPropagation());
    }

    // --- Comportamento ----------------------------------------------------
    function applyVisibility() {
      host.style.visibility = flags.styled && flags.active && !flags.capturing ? 'visible' : 'hidden';
    }

    function isOpen() {
      return !panel.hidden;
    }

    function openPanel() {
      if (!isOpen()) {
        panel.hidden = false;
        button.setAttribute('aria-expanded', 'true');
        hideTooltip();
        positionPanel();
      }
      prompt.focus({ preventScroll: true });
    }

    function closePanel() {
      if (!isOpen()) return;
      panel.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      button.focus({ preventScroll: true });
    }

    function togglePanel() {
      if (isOpen()) closePanel();
      else openPanel();
    }

    function showTooltip() {
      if (isOpen() || drag.active) return;
      tooltip.classList.add('tooltip--visible');
      positionTooltip();
    }

    function hideTooltip() {
      tooltip.classList.remove('tooltip--visible');
    }

    button.addEventListener('mouseenter', showTooltip);
    button.addEventListener('mouseleave', hideTooltip);
    button.addEventListener('focus', () => {
      if (button.matches(':focus-visible')) showTooltip();
    });
    button.addEventListener('blur', hideTooltip);
    closeButton.addEventListener('click', closePanel);
    generateButton.addEventListener('click', () => handlers.onGenerate());
    copyButton.addEventListener('click', () => handlers.onCopy());

    prompt.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        handlers.onGenerate();
      }
    });
    panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePanel();
      }
    });

    // Trascinamento del pulsante (per spostarlo se copre qualcosa); un click semplice apre il pannello.
    const drag = { pointerId: null, startX: 0, startY: 0, originLeft: 0, originTop: 0, active: false, suppressClick: false };
    button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      drag.pointerId = event.pointerId;
      drag.startX = event.clientX;
      drag.startY = event.clientY;
      drag.originLeft = buttonPos.left;
      drag.originTop = buttonPos.top;
      drag.active = false;
      button.setPointerCapture(event.pointerId);
    });
    button.addEventListener('pointermove', (event) => {
      if (drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.active && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      drag.active = true;
      hideTooltip();
      button.classList.add('ai-btn--dragging');
      setButtonPosition(drag.originLeft + dx, drag.originTop + dy);
    });
    const endDrag = (event) => {
      if (drag.pointerId !== event.pointerId) return;
      drag.pointerId = null;
      button.classList.remove('ai-btn--dragging');
      if (drag.active) {
        drag.active = false;
        drag.suppressClick = true;
        manualPosition = {
          xFrac: buttonPos.left / Math.max(1, window.innerWidth),
          yFrac: buttonPos.top / Math.max(1, window.innerHeight),
        };
        if (handlers.onDragEnd) handlers.onDragEnd(manualPosition);
      }
    };
    button.addEventListener('pointerup', endDrag);
    button.addEventListener('pointercancel', endDrag);
    button.addEventListener('click', (event) => {
      if (drag.suppressClick) {
        drag.suppressClick = false;
        event.preventDefault();
        return;
      }
      togglePanel();
    });

    // --- Posizionamento ---------------------------------------------------
    function setButtonPosition(left, top) {
      buttonPos = {
        left: Math.round(clamp(left, 4, window.innerWidth - BUTTON.width - 4)),
        top: Math.round(clamp(top, 4, window.innerHeight - BUTTON.height - 4)),
      };
      button.style.left = buttonPos.left + 'px';
      button.style.top = buttonPos.top + 'px';
      if (isOpen()) positionPanel();
      if (tooltip.classList.contains('tooltip--visible')) positionTooltip();
    }

    /** Calcola la posizione del pulsante: vicino al pannello del codice o al pulsante "Code". */
    function computeButtonPosition(anchors) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (manualPosition) return { left: manualPosition.xFrac * vw, top: manualPosition.yFrac * vh };
      if (anchors.codePanel) {
        return { left: anchors.codePanel.x - BUTTON.width - GAP, top: anchors.codePanel.y + GAP };
      }
      if (anchors.codeButton) {
        const b = anchors.codeButton;
        return { left: b.x + b.width - BUTTON.width, top: b.y + b.height + GAP };
      }
      if (anchors.workspace) {
        const w = anchors.workspace;
        return { left: w.x + w.width - BUTTON.width - 20, top: w.y + w.height - BUTTON.height - 20 };
      }
      return { left: vw - BUTTON.width - 20, top: vh - BUTTON.height - 20 };
    }

    function updatePosition(anchors) {
      lastAnchors = anchors || {};
      const pos = computeButtonPosition(lastAnchors);
      setButtonPosition(pos.left, pos.top);
    }

    function positionPanel() {
      if (!isOpen()) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const width = Math.min(PANEL_MAX_WIDTH, vw - 2 * EDGE);
      panel.style.width = width + 'px';
      panel.style.maxHeight = Math.max(160, vh - 2 * EDGE) + 'px';
      const height = panel.offsetHeight;

      let left = buttonPos.left + BUTTON.width - width;
      if (left < EDGE) left = buttonPos.left;
      left = clamp(left, EDGE, vw - width - EDGE);

      let top = buttonPos.top + BUTTON.height + 8;
      if (top + height > vh - EDGE) {
        const above = buttonPos.top - 8 - height;
        top = above >= EDGE ? above : Math.max(EDGE, vh - EDGE - height);
      }
      panel.style.left = Math.round(left) + 'px';
      panel.style.top = Math.round(top) + 'px';
    }

    function positionTooltip() {
      const vw = window.innerWidth;
      const width = tooltip.offsetWidth;
      const left = clamp(buttonPos.left + BUTTON.width - width, 8, vw - width - 8);
      let top = buttonPos.top + BUTTON.height + 6;
      if (top + tooltip.offsetHeight > window.innerHeight - 8) top = buttonPos.top - tooltip.offsetHeight - 6;
      tooltip.style.left = Math.round(left) + 'px';
      tooltip.style.top = Math.round(top) + 'px';
    }

    new ResizeObserver(() => positionPanel()).observe(panel);

    // --- API pubblica -----------------------------------------------------
    return {
      host,
      mount() {
        if (!host.isConnected) (document.body || document.documentElement).append(host);
      },
      setActive(active) {
        flags.active = Boolean(active);
        if (!active && isOpen()) {
          panel.hidden = true;
          button.setAttribute('aria-expanded', 'false');
        }
        applyVisibility();
      },
      setCapturing(capturing) {
        flags.capturing = Boolean(capturing);
        applyVisibility();
      },
      updatePosition,
      setManualPosition(pos) {
        manualPosition =
          pos && Number.isFinite(pos.xFrac) && Number.isFinite(pos.yFrac)
            ? { xFrac: clamp(pos.xFrac, 0, 1), yFrac: clamp(pos.yFrac, 0, 1) }
            : null;
        updatePosition(lastAnchors);
      },
      openPanel,
      closePanel,
      togglePanel,
      isOpen,
      getPrompt: () => prompt.value,
      setState(state) {
        button.dataset.state = state;
        button.setAttribute('aria-label', TOOLTIPS[state]);
        button.setAttribute('aria-busy', state === STATES.GENERATING ? 'true' : 'false');
        tooltip.textContent = TOOLTIPS[state];
        generateButton.disabled = state === STATES.GENERATING;
        generateButton.textContent = state === STATES.GENERATING ? 'Generazione…' : 'Genera codice';
      },
      setStatus(text) {
        status.hidden = !text;
        statusText.textContent = text || '';
      },
      /** @param {'error'|'warning'|'success'|'info'} kind */
      showMessage(kind, text, action) {
        message.hidden = false;
        message.dataset.kind = kind;
        message.setAttribute('role', kind === 'error' ? 'alert' : 'status');
        messageText.textContent = text;
        messageAction.hidden = !action;
        messageAction.onclick = null;
        if (action) {
          messageAction.textContent = action.label;
          messageAction.onclick = action.onClick;
        }
      },
      hideMessage() {
        message.hidden = true;
        messageAction.onclick = null;
      },
      showResult({ code, explanation: text, warnings, metaText }) {
        response.hidden = true;
        result.hidden = false;
        explanation.textContent = text || '';
        explanation.hidden = !text;
        warningsList.replaceChildren(...(warnings || []).map((w) => h('li', { text: w })));
        warningsList.hidden = !(warnings && warnings.length);
        codeBlock.value = code;
        codeBlock.rows = Math.min(18, Math.max(4, code.split('\n').length));
        codeBlock.scrollTop = 0;
        meta.textContent = metaText || '';
        copyButton.textContent = 'Copia codice';
      },
      showResponseText(text) {
        result.hidden = true;
        response.hidden = false;
        responseText.textContent = text;
      },
      clearResult() {
        result.hidden = true;
        response.hidden = true;
        codeBlock.value = '';
        responseText.textContent = '';
      },
      markCopied() {
        copyButton.textContent = 'Copiato ✓';
        clearTimeout(copyButton._timer);
        copyButton._timer = setTimeout(() => {
          copyButton.textContent = 'Copia codice';
        }, 2500);
      },
      /** Seleziona il codice (per execCommand('copy') o per la copia manuale con Ctrl/Cmd+C). */
      selectCode() {
        codeBlock.focus({ preventScroll: true });
        codeBlock.select();
      },
      isMac,
    };
  }

  root.TCAI = Object.assign(root.TCAI || {}, { createUI, UI_HOST_ID: HOST_ID });
})(globalThis);
