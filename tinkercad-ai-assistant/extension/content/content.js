/*
 * Content script principale (mondo isolato).
 * - Attende l'editor di Tinkercad Circuits e mostra un solo pulsante "AI".
 * - Coordina: contesto della pagina -> screenshot (background) -> backend (background) -> estrazione -> appunti.
 * Non modifica né salva il progetto Tinkercad e non inserisce codice nell'editor.
 */
(function (root) {
  'use strict';

  if (root.__tcaiContentLoaded) return;
  root.__tcaiContentLoaded = true;

  const { STATES, createStateMachine, createUI, extractCode, TinkercadDom: dom, UI_HOST_ID } = root.TCAI;

  const CODE_REQUEST_EVENT = 'tcai:code-request';
  const CODE_RESPONSE_EVENT = 'tcai:code-response';
  const BRIDGE_TIMEOUT_MS = 1500;
  const POSITION_INTERVAL_MS = 300;
  const PING_INTERVAL_MS = 15000;

  let ui = null;
  let machine = null;
  let lastCode = '';
  let positionKey = '';
  let observer = null;
  let positionTimer = null;
  let mutationTimer = null;
  let tornDown = false;
  // Preferenze lette prima di creare l'interfaccia, così un assistente nascosto non "lampeggia" al ricaricamento.
  let prefs = { assistantHidden: false, buttonPosition: null };

  // --- Utilità --------------------------------------------------------------

  function extensionAlive() {
    try {
      return Boolean(chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

  function failure(code, message, extra) {
    return { ok: false, error: { code, message, ...(extra || {}) } };
  }

  function contextLost() {
    return failure('EXTENSION_RELOADED', "L'estensione è stata aggiornata o ricaricata: ricarica la pagina di Tinkercad.");
  }

  function sendMessage(message) {
    return new Promise((resolve) => {
      if (!extensionAlive()) {
        resolve(contextLost());
        return;
      }
      try {
        chrome.runtime.sendMessage(message, (response) => {
          const err = chrome.runtime.lastError;
          if (err) resolve(failure('EXTENSION_ERROR', `Comunicazione con l'estensione non riuscita: ${err.message}`));
          else resolve(response || failure('EXTENSION_ERROR', "Nessuna risposta dall'estensione."));
        });
      } catch {
        resolve(contextLost());
      }
    });
  }

  // --- Contesto della pagina ------------------------------------------------

  /** Chiede a page-bridge.js (MAIN world) il testo di CodeMirror. */
  function requestEditorCode() {
    return new Promise((resolve) => {
      const id = crypto.randomUUID();
      const timer = setTimeout(() => {
        document.removeEventListener(CODE_RESPONSE_EVENT, onResponse);
        resolve({ code: null, truncated: false, source: 'timeout' });
      }, BRIDGE_TIMEOUT_MS);
      function onResponse(event) {
        let data;
        try {
          data = JSON.parse(event.detail);
        } catch {
          return;
        }
        if (!data || data.id !== id) return;
        clearTimeout(timer);
        document.removeEventListener(CODE_RESPONSE_EVENT, onResponse);
        resolve({
          code: typeof data.code === 'string' ? data.code : null,
          truncated: data.truncated === true,
          source: String(data.source || ''),
        });
      }
      document.addEventListener(CODE_RESPONSE_EVENT, onResponse);
      document.dispatchEvent(new CustomEvent(CODE_REQUEST_EVENT, { detail: JSON.stringify({ id }) }));
    });
  }

  async function collectContext() {
    const code = await requestEditorCode();
    let components;
    try {
      components = dom.getComponentInventory();
    } catch {
      components = [];
    }
    return {
      currentCode: code.code && code.code.trim() ? code.code : null,
      codeTruncated: code.truncated,
      editorMode: dom.getEditorMode(),
      device: dom.getSelectedDevice(),
      components,
    };
  }

  /** Nasconde l'interfaccia, chiede lo screenshot al background e la ripristina sempre. */
  async function captureCircuit() {
    ui.setCapturing(true);
    try {
      await nextFrame();
      await nextFrame();
      await delay(60);
      return await sendMessage({
        type: 'tcai:capture',
        rect: dom.getCircuitRect(),
        viewport: { width: window.innerWidth, height: window.innerHeight },
      });
    } finally {
      ui.setCapturing(false);
    }
  }

  /**
   * Richiesta al backend tramite una Port: tiene attivo il service worker durante l'attesa
   * e riceve gli aggiornamenti di avanzamento ({chars, elapsed}).
   */
  function requestGeneration(payload, onProgress) {
    return new Promise((resolve) => {
      let port;
      try {
        port = chrome.runtime.connect({ name: 'tcai-generate' });
      } catch {
        resolve(contextLost());
        return;
      }
      let done = false;
      const ping = setInterval(() => {
        try {
          port.postMessage({ type: 'ping' });
        } catch {
          // la disconnessione viene gestita da onDisconnect
        }
      }, PING_INTERVAL_MS);
      const finish = (result) => {
        if (done) return;
        done = true;
        clearInterval(ping);
        try {
          port.disconnect();
        } catch {
          // già disconnessa
        }
        resolve(result);
      };
      port.onMessage.addListener((msg) => {
        if (msg && msg.type === 'result') finish(msg.result);
        else if (msg && msg.type === 'progress' && !done && onProgress) onProgress(msg);
      });
      port.onDisconnect.addListener(() => {
        finish(failure('CONNECTION_LOST', "Connessione con l'estensione interrotta durante la generazione. Riprova."));
      });
      port.postMessage({ type: 'generate', payload });
    });
  }

  // --- Appunti --------------------------------------------------------------

  function describeClipboardError(err) {
    const msg = String((err && err.message) || '');
    if (/focus/i.test(msg)) return 'la pagina non era in primo piano';
    if (err && err.name === 'NotAllowedError') return 'permesso negato dal browser';
    return msg || 'errore sconosciuto';
  }

  async function writeClipboard(text) {
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
      return { ok: false, reason: 'API Clipboard non disponibile in questa pagina' };
    }
    try {
      await navigator.clipboard.writeText(text);
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: describeClipboardError(err) };
    }
  }

  async function manualCopy() {
    if (!lastCode) return;
    let res = await writeClipboard(lastCode);
    if (!res.ok) {
      // Ripiego durante il gesto dell'utente: copia della selezione nella textarea del codice.
      ui.selectCode();
      let copied;
      try {
        copied = document.execCommand('copy');
      } catch {
        copied = false;
      }
      if (copied) res = { ok: true };
    }
    if (res.ok) {
      ui.markCopied();
      if (machine.state !== STATES.SUCCESS) machine.transition(STATES.SUCCESS);
      ui.showMessage('success', 'Codice copiato negli appunti. Incollalo nell\'editor di Tinkercad quando vuoi.');
    } else {
      if (machine.state === STATES.SUCCESS) machine.transition(STATES.ERROR);
      ui.selectCode();
      ui.showMessage('error', `Copia non riuscita (${res.reason}). Il codice è selezionato: premi ${ui.isMac ? '⌘' : 'Ctrl'}+C.`);
    }
  }

  // --- Flusso di generazione ------------------------------------------------

  function describeImage(imageSent, cropped) {
    if (!imageSent) return 'senza screenshot';
    return cropped ? 'screenshot del circuito' : 'screenshot dell\'intera scheda';
  }

  async function generate(options = {}) {
    if (!ui || machine.state === STATES.GENERATING) return;
    const prompt = ui.getPrompt().trim();
    if (!prompt) {
      ui.showMessage('error', 'Scrivi una richiesta, ad esempio: «Fai lampeggiare il LED collegato al pin 13 ogni secondo».');
      ui.openPanel();
      return;
    }

    machine.transition(STATES.GENERATING);
    ui.hideMessage();
    ui.clearResult();
    lastCode = '';

    try {
      ui.setStatus('Lettura del codice e dei componenti…');
      const context = await collectContext();

      let image = null;
      let cropped = false;
      if (!options.skipScreenshot) {
        ui.setStatus('Acquisizione dello screenshot del circuito…');
        const shot = await captureCircuit();
        if (!shot.ok) {
          machine.transition(STATES.ERROR);
          ui.setStatus(null);
          const canRetryWithoutImage = shot.error.code !== 'EXTENSION_RELOADED';
          ui.showMessage(
            'error',
            shot.error.message,
            canRetryWithoutImage ? { label: 'Genera senza screenshot', onClick: () => generate({ skipScreenshot: true }) } : null
          );
          return;
        }
        image = shot.image;
        cropped = shot.cropped === true;
      }

      ui.setStatus('Generazione del codice con OpenRouter…');
      const payload = {
        prompt,
        image,
        cropped,
        currentCode: context.currentCode,
        editorMode: context.editorMode,
        device: context.device,
        components: context.components,
      };
      const response = await requestGeneration(payload, ({ chars, elapsed }) => {
        const seconds = Math.round(Number(elapsed) || 0);
        ui.setStatus(
          chars > 0
            ? `Generazione del codice… ${Number(chars).toLocaleString('it-IT')} caratteri ricevuti (${seconds} s)`
            : `In attesa del modello… ${seconds} s`
        );
      });
      ui.setStatus(null);

      if (!response || !response.ok) {
        const error = (response && response.error) || { message: 'Errore sconosciuto.' };
        machine.transition(STATES.ERROR);
        ui.showMessage('error', error.message);
        return;
      }

      const extracted = extractCode(response.content, { finishReason: response.finishReason });
      const warnings = [
        ...(response.warnings || []).map((w) => w.message),
        ...extracted.warnings.map((w) => w.message),
      ];
      if (context.codeTruncated) warnings.push('Il codice nell\'editor era molto lungo ed è stato inviato solo in parte.');

      if (!extracted.hasCode) {
        // Nessun codice affidabile (es. il modello chiede chiarimenti): niente copia, niente verde.
        machine.transition(STATES.IDLE);
        ui.showResponseText(response.content);
        ui.showMessage('warning', `${extracted.reasonMessage} Leggi la risposta qui sotto e, se serve, precisa la richiesta.`);
        return;
      }

      lastCode = extracted.code;
      ui.showResult({
        code: extracted.code,
        explanation: extracted.explanation,
        warnings,
        metaText: `${response.model || 'modello'} · ${describeImage(response.imageSent, cropped)}`,
      });

      const copy = await writeClipboard(lastCode);
      if (copy.ok) {
        machine.transition(STATES.SUCCESS);
        ui.markCopied();
        ui.showMessage('success', 'Codice generato e copiato negli appunti. Incollalo nell\'editor di Tinkercad quando vuoi.');
      } else {
        machine.transition(STATES.ERROR);
        ui.showMessage('error', `Codice generato, ma la copia automatica non è riuscita (${copy.reason}). Usa «Copia codice».`);
      }
    } catch (err) {
      ui.setStatus(null);
      if (machine.state === STATES.GENERATING) machine.transition(STATES.ERROR);
      ui.showMessage('error', extensionAlive() ? `Errore imprevisto: ${(err && err.message) || err}` : contextLost().error.message);
    }
  }

  // --- Montaggio e posizionamento -------------------------------------------

  function createInterface() {
    // Un solo host per pagina, anche se lo script venisse iniettato di nuovo.
    const stale = document.getElementById(UI_HOST_ID);
    if (stale) stale.remove();

    ui = createUI({
      onGenerate: () => generate(),
      onCopy: () => manualCopy(),
      onDragEnd: (pos) => {
        if (extensionAlive()) chrome.storage.local.set({ buttonPosition: pos }).catch(() => {});
      },
    });
    machine = createStateMachine((state) => ui.setState(state));
    ui.setState(machine.state);
    if (prefs.buttonPosition) ui.setManualPosition(prefs.buttonPosition);
    ui.setUserHidden(prefs.assistantHidden === true);
    ui.mount();

    if (root.TCAI.hotkeys) {
      root.TCAI.hotkeys.register({
        isActive: () => Boolean(ui) && !tornDown && dom.isEditorPage(),
        isHidden: () => ui.isUserHidden(),
        hide: () => setHidden(true),
        show: () => setHidden(false),
      });
    }
  }

  /**
   * Nasconde o mostra pulsante e pannello (Ctrl+Shift+A / Ctrl+Shift+Z) senza toccare prompt,
   * risultato, stato o appunti. La scelta è ricordata anche dopo il ricaricamento della pagina.
   */
  function setHidden(hidden) {
    if (!ui) return;
    ui.setUserHidden(hidden);
    if (!hidden) {
      positionKey = '';
      refresh();
    }
    if (extensionAlive()) chrome.storage.local.set({ assistantHidden: hidden }).catch(() => {});
  }

  function currentAnchors() {
    return {
      codePanel: dom.getCodePanelRect(),
      codeButton: dom.getCodeButtonRect(),
      workspace: dom.getCircuitRect(),
    };
  }

  /** Verifica editor/host e aggiorna la posizione solo se le ancore sono cambiate. */
  function refresh() {
    if (tornDown) return;
    if (!extensionAlive()) {
      teardown();
      return;
    }
    const active = dom.isEditorPage();
    if (active && !ui) createInterface();
    if (!ui) return;
    ui.mount();
    ui.setActive(active);
    if (!active) return;
    const anchors = currentAnchors();
    const key = JSON.stringify(anchors) + `|${window.innerWidth}x${window.innerHeight}`;
    if (key !== positionKey) {
      positionKey = key;
      ui.updatePosition(anchors);
    }
  }

  function teardown() {
    tornDown = true;
    if (observer) observer.disconnect();
    clearInterval(positionTimer);
    clearTimeout(mutationTimer);
    if (root.TCAI.hotkeys) root.TCAI.hotkeys.register(null);
    if (ui) ui.host.remove();
  }

  function begin() {
    // MutationObserver solo su childList (non sugli attributi: la simulazione anima l'SVG di continuo)
    // e con throttling, per rilevare l'editor e reinserire il pulsante se Tinkercad ricostruisce la pagina.
    observer = new MutationObserver(() => {
      if (mutationTimer) return;
      mutationTimer = setTimeout(() => {
        mutationTimer = null;
        refresh();
      }, 200);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // Le ancore (pannello codice che scorre, ridimensionamenti) vengono ricontrollate periodicamente.
    positionTimer = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, POSITION_INTERVAL_MS);
    window.addEventListener('resize', () => requestAnimationFrame(refresh));

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg || sender.id !== chrome.runtime.id) return undefined;
      if (msg.type === 'tcai:open-panel' || msg.type === 'tcai:toggle-panel') {
        refresh();
        if (!ui || !dom.isEditorPage()) {
          sendResponse({ ok: false, reason: 'not-editor' });
          return undefined;
        }
        if (ui.isUserHidden()) {
          setHidden(false);
          ui.openPanel();
        } else if (msg.type === 'tcai:toggle-panel') {
          ui.togglePanel();
        } else {
          ui.openPanel();
        }
        sendResponse({ ok: true });
      }
      return undefined;
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !ui) return;
      if (changes.buttonPosition) {
        ui.setManualPosition(changes.buttonPosition.newValue || null);
        positionKey = '';
        refresh();
      }
      // Sincronizza le altre schede di Tinkercad aperte.
      if (changes.assistantHidden && ui.isUserHidden() !== (changes.assistantHidden.newValue === true)) {
        ui.setUserHidden(changes.assistantHidden.newValue === true);
        positionKey = '';
        refresh();
      }
    });

    refresh();
  }

  function start() {
    chrome.storage.local
      .get(['assistantHidden', 'buttonPosition'])
      .then((stored) => {
        prefs = { assistantHidden: stored.assistantHidden === true, buttonPosition: stored.buttonPosition || null };
      })
      .catch(() => {})
      .finally(begin);
  }

  start();
})(globalThis);
