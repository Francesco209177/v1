/*
 * Accesso in sola lettura al DOM di Tinkercad Circuits (mondo isolato).
 *
 * Selettori verificati sulla vista pubblica del simulatore (www.tinkercad.com/embed/...):
 * sono classi "js-*" usate da Tinkercad come hook JavaScript, non classi generate.
 * L'editor autenticato (/things/.../editel) non è stato verificabile senza login:
 * se un selettore non esiste, le funzioni restituiscono null e l'interfaccia usa i fallback.
 */
(function (root) {
  'use strict';

  const SELECTORS = Object.freeze({
    editorRoot: '.js-editor--circuit',
    workspace: '.editor.js-root_container',
    topBar: '.js-sitemenu',
    codePanel: '.js-editor__sidebar',
    codeButton: '.js-toggle_code_panel',
    codeMode: '.js-code_panel__toolbar__mode .editor__dropdown__button__text--item',
    codeDevice: '.js-code_panel__toolbar__component .editor__dropdown__button__text--item',
    componentGraphics: '[class*="cgfx__"]',
  });

  // Classi grafiche "di servizio" (selezione, aree di click, terminali...) che non sono componenti.
  const SERVICE_GRAPHICS = /^(selected|hitarea.*|terminal.*|origin|direction|reference|debug|up|pressed|breakdown|warning|animate)$/;
  const CGFX_CLASS = /(?:^|\s)cgfx__([a-z0-9][a-z0-9-]*)/gi;
  const INSTANCE_ID = /^id_(.+)_(\d+)$/;
  const MAX_COMPONENT_TYPES = 100;

  function isEditorPage(doc = document) {
    return Boolean(doc.querySelector(SELECTORS.editorRoot));
  }

  /** Rettangolo visibile dell'elemento, ritagliato alla viewport. null se non visibile. */
  function visibleRect(el) {
    if (!el || !el.isConnected) return null;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return null;
    const r = el.getBoundingClientRect();
    const x0 = Math.max(0, r.left);
    const y0 = Math.max(0, r.top);
    const x1 = Math.min(window.innerWidth, r.right);
    const y1 = Math.min(window.innerHeight, r.bottom);
    if (x1 - x0 < 1 || y1 - y0 < 1) return null;
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }

  function getCodePanelRect() {
    const rect = visibleRect(document.querySelector(SELECTORS.codePanel));
    // Il pannello chiuso resta fuori schermo a destra: considerarlo aperto solo se ha una larghezza utile.
    return rect && rect.width >= 120 ? rect : null;
  }

  function getCodeButtonRect() {
    return visibleRect(document.querySelector(SELECTORS.codeButton));
  }

  /**
   * Area di lavoro del circuito: contenitore dell'editor sotto la barra superiore,
   * escludendo il pannello del codice quando è aperto (si sovrappone a destra).
   */
  function getCircuitRect() {
    let area = visibleRect(document.querySelector(SELECTORS.workspace));
    if (!area) {
      const editor = visibleRect(document.querySelector(SELECTORS.editorRoot));
      const bar = visibleRect(document.querySelector(SELECTORS.topBar));
      if (!editor) return null;
      const top = bar ? Math.max(editor.y, bar.y + bar.height) : editor.y;
      area = { x: editor.x, y: top, width: editor.width, height: editor.y + editor.height - top };
    }
    let right = area.x + area.width;
    const panel = getCodePanelRect();
    if (panel && panel.x > area.x && panel.x < right) right = panel.x;
    const rect = { x: area.x, y: area.y, width: right - area.x, height: area.height };
    return rect.width > 0 && rect.height > 0 ? rect : null;
  }

  function readText(selector, max) {
    const el = document.querySelector(selector);
    const text = el && el.textContent ? el.textContent.replace(/\s+/g, ' ').trim() : '';
    return text ? text.slice(0, max) : null;
  }

  function getEditorMode() {
    return readText(SELECTORS.codeMode, 40);
  }

  function getSelectedDevice() {
    return readText(SELECTORS.codeDevice, 80);
  }

  function componentType(el) {
    const className = el.getAttribute('class') || '';
    for (const match of className.matchAll(CGFX_CLASS)) {
      const candidate = match[1].toLowerCase();
      if (!SERVICE_GRAPHICS.test(candidate) && candidate.length <= 60) return candidate;
    }
    return null;
  }

  /**
   * Ogni componente è disegnato su più livelli SVG (grafica, interazione...): i gruppi antenati hanno
   * id della forma "id_<istanza>_<livello>". Restituisce l'istanza per contare ogni componente una volta.
   */
  function componentInstance(el, scope) {
    for (let node = el.parentElement; node && node !== scope; node = node.parentElement) {
      const match = node.id && INSTANCE_ID.exec(node.id);
      if (match) return { key: match[1], layer: Number(match[2]) };
    }
    return null;
  }

  /**
   * Inventario indicativo dei tipi di componente, ricavato dalle classi grafiche "cgfx__<tipo>"
   * dei gruppi SVG di primo livello. Non contiene collegamenti né valori: è solo un indizio.
   * @returns {{type: string, count: number}[]}
   */
  function getComponentInventory() {
    const scope = document.querySelector(SELECTORS.workspace) || document.querySelector(SELECTORS.editorRoot);
    if (!scope) return [];
    const instances = new Map(); // istanza -> { type, layer } (vince il livello più basso: la grafica)
    const anonymous = [];
    for (const el of scope.querySelectorAll(SELECTORS.componentGraphics)) {
      const parent = el.parentElement && el.parentElement.closest(SELECTORS.componentGraphics);
      if (parent && scope.contains(parent)) continue; // solo gruppi radice
      const type = componentType(el);
      if (!type) continue;
      const instance = componentInstance(el, scope);
      if (!instance) {
        anonymous.push(type);
        continue;
      }
      const previous = instances.get(instance.key);
      if (!previous || instance.layer < previous.layer) instances.set(instance.key, { type, layer: instance.layer });
    }
    const counts = new Map();
    for (const type of [...[...instances.values()].map((i) => i.type), ...anonymous]) {
      if (!counts.has(type) && counts.size >= MAX_COMPONENT_TYPES) continue;
      counts.set(type, Math.min(999, (counts.get(type) || 0) + 1));
    }
    return [...counts].map(([type, count]) => ({ type, count }));
  }

  root.TCAI = Object.assign(root.TCAI || {}, {
    TinkercadDom: {
      SELECTORS,
      isEditorPage,
      visibleRect,
      getCodePanelRect,
      getCodeButtonRect,
      getCircuitRect,
      getEditorMode,
      getSelectedDevice,
      getComponentInventory,
    },
  });
})(globalThis);
