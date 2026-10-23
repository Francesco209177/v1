/*
 * Service worker dell'estensione (Manifest V3).
 * - Screenshot della scheda attiva (chrome.tabs.captureVisibleTab) e ritaglio sull'area del circuito.
 * - Chiamata al backend locale, che custodisce la chiave OpenRouter.
 * Nessuna chiave API è presente o transita in questa estensione.
 */
'use strict';

importScripts('shared/crop.js');

const { computeCrop, fitWithin } = self.TCAI;

const DEFAULT_SETTINGS = Object.freeze({ backendUrl: 'http://localhost:3000', accessToken: '' });
// Sotto i 5 minuti oltre i quali Chrome può interrompere un evento del service worker; il server si ferma a 240 s.
const REQUEST_TIMEOUT_MS = 280000;
const BACKEND_IDLE_MS = 60000;
const KEEPALIVE_MS = 20000;
const MAX_IMAGE_SIDE = 1600;
const JPEG_QUALITY = 0.9;
const TINKERCAD_HOST = 'www.tinkercad.com';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

function failure(code, message, extra) {
  return { ok: false, error: { code, message, ...(extra || {}) } };
}

function isTinkercadUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === TINKERCAD_HOST;
  } catch {
    return false;
  }
}

function shorten(text, max = 200) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max) + '…' : clean;
}

async function getSettings() {
  const stored = await chrome.storage.local.get(['backendUrl', 'accessToken']);
  return {
    backendUrl: typeof stored.backendUrl === 'string' && stored.backendUrl ? stored.backendUrl : DEFAULT_SETTINGS.backendUrl,
    accessToken: typeof stored.accessToken === 'string' ? stored.accessToken : '',
  };
}

async function shortcutLabel() {
  try {
    const commands = await chrome.commands.getAll();
    const cmd = commands.find((c) => c.name === 'toggle-assistant');
    return cmd && cmd.shortcut ? cmd.shortcut : '';
  } catch {
    return '';
  }
}

// --- Screenshot ---------------------------------------------------------------

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Ritaglia sull'area del circuito (se affidabile), ridimensiona e converte in JPEG. */
async function cropAndEncode(dataUrl, rect, viewport) {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  try {
    const crop = computeCrop(bitmap.width, bitmap.height, rect, viewport);
    const size = fitWithin(crop.sw, crop.sh, MAX_IMAGE_SIDE);
    const canvas = new OffscreenCanvas(size.width, size.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.drawImage(bitmap, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, size.width, size.height);
    const out = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
    return {
      image: `data:image/jpeg;base64,${arrayBufferToBase64(await out.arrayBuffer())}`,
      cropped: crop.cropped,
      width: size.width,
      height: size.height,
    };
  } finally {
    bitmap.close();
  }
}

async function isActiveTab(tab) {
  const [active] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
  return Boolean(active && active.id === tab.id);
}

async function handleCapture(message, sender) {
  const tab = sender.tab;
  if (!tab || !isTinkercadUrl(sender.url)) return failure('CAPTURE_FAILED', 'Richiesta di screenshot non valida.');
  if (!(await isActiveTab(tab))) {
    return failure('TAB_NOT_ACTIVE', 'Porta la scheda di Tinkercad in primo piano e riprova: Chrome può acquisire solo la scheda visibile.');
  }

  let dataUrl;
  try {
    dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  } catch (err) {
    const msg = String((err && err.message) || err);
    if (/activeTab|all_urls|permission/i.test(msg)) {
      const shortcut = await shortcutLabel();
      return failure(
        'CAPTURE_NOT_AUTHORIZED',
        'Chrome non ha ancora autorizzato lo screenshot di questa scheda. Clicca l\'icona dell\'estensione nella barra degli strumenti' +
          (shortcut ? ` (oppure premi ${shortcut})` : '') +
          ' e poi premi di nuovo «Genera codice». Per evitarlo, attiva «Screenshot senza clic aggiuntivi» nel popup.'
      );
    }
    if (/MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND|quota/i.test(msg)) {
      return failure('CAPTURE_RATE_LIMITED', 'Troppi screenshot ravvicinati: attendi un secondo e riprova.');
    }
    return failure('CAPTURE_FAILED', `Impossibile acquisire lo screenshot: ${shorten(msg)}`);
  }

  // Se nel frattempo l'utente ha cambiato scheda, l'immagine non è quella del circuito.
  if (!(await isActiveTab(tab))) {
    return failure('TAB_NOT_ACTIVE', 'La scheda di Tinkercad non era più in primo piano durante lo screenshot. Riprova.');
  }

  try {
    return { ok: true, ...(await cropAndEncode(dataUrl, message.rect, message.viewport)) };
  } catch {
    // Ritaglio non riuscito: si invia l'immagine originale, il prompt chiede di concentrarsi sul circuito.
    return { ok: true, image: dataUrl, cropped: false };
  }
}

// --- Backend ------------------------------------------------------------------

async function hasOriginPermission(url) {
  if (LOCAL_HOSTS.has(url.hostname)) return true;
  return chrome.permissions.contains({ origins: [`${url.origin}/*`] });
}

function sanitizeSuccess(json) {
  if (typeof json.content !== 'string') return null;
  const warnings = Array.isArray(json.warnings)
    ? json.warnings
        .filter((w) => w && typeof w.message === 'string')
        .slice(0, 10)
        .map((w) => ({ code: String(w.code || ''), message: shorten(w.message, 300) }))
    : [];
  return {
    ok: true,
    content: json.content,
    finishReason: typeof json.finishReason === 'string' ? json.finishReason : null,
    model: typeof json.model === 'string' ? shorten(json.model, 120) : '',
    imageSent: json.imageSent === true,
    warnings,
  };
}

/** Converte la risposta del backend (JSON o riga finale "result" NDJSON) nel risultato per il content script. */
function interpretBackendResult(json, status) {
  if (!json || typeof json !== 'object') {
    return failure('BAD_BACKEND_RESPONSE', `Il backend ha risposto in modo non valido (HTTP ${status}).`);
  }
  if (json.ok !== true) {
    const err = json.error && typeof json.error === 'object' ? json.error : {};
    const retryAfter = Number(err.retryAfter) > 0 ? Number(err.retryAfter) : undefined;
    return failure(
      typeof err.code === 'string' ? err.code : 'BACKEND_ERROR',
      shorten(err.message || `Errore del backend (HTTP ${status}).`, 500),
      retryAfter ? { retryAfter } : undefined
    );
  }
  return sanitizeSuccess(json) || failure('BAD_BACKEND_RESPONSE', 'La risposta del backend non contiene testo.');
}

/** Legge le righe NDJSON del backend: inoltra l'avanzamento e restituisce la riga "result" (o null). */
async function readNdjson(res, onProgress, onActivity) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = null;
  const handle = (line) => {
    if (!line.trim()) return;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      return;
    }
    if (obj && obj.type === 'progress') {
      onProgress({ chars: Math.max(0, Number(obj.chars) || 0), elapsed: Math.max(0, Number(obj.elapsed) || 0) });
    } else if (obj && obj.type === 'result') {
      result = obj;
    }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    onActivity();
    buffer += decoder.decode(value, { stream: true });
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      handle(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
    }
  }
  handle(buffer + decoder.decode());
  return result;
}

async function callBackend(payload, signal, onProgress = () => {}) {
  const { backendUrl, accessToken } = await getSettings();
  let url;
  try {
    url = new URL('/api/generate', backendUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol');
  } catch {
    return failure('BAD_SETTINGS', 'URL del backend non valido: correggilo nel popup dell\'estensione.');
  }
  if (!(await hasOriginPermission(url))) {
    return failure('BACKEND_PERMISSION', `Autorizza l'URL del backend (${url.origin}) salvandolo di nuovo dal popup dell'estensione.`);
  }

  // Tetto totale e inattività: il backend invia una riga di avanzamento almeno ogni 10 s.
  const total = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const idle = new AbortController();
  let idleTimer = null;
  const armIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => idle.abort(), BACKEND_IDLE_MS);
  };
  const abortedResult = () => {
    if (signal.aborted) return failure('CANCELLED', 'Richiesta annullata.');
    if (idle.signal.aborted) {
      return failure('BACKEND_STALLED', `Il backend non invia dati da ${BACKEND_IDLE_MS / 1000} s: controlla il terminale del server e riprova.`);
    }
    if (total.aborted) {
      return failure('TIMEOUT', `Nessun risultato dopo ${REQUEST_TIMEOUT_MS / 1000} s: riprova o scegli un modello più veloce.`);
    }
    return null;
  };

  const headers = { 'Content-Type': 'application/json', Accept: 'application/x-ndjson, application/json' };
  if (accessToken) headers['X-Access-Token'] = accessToken;

  try {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.any([signal, total, idle.signal]),
      });
    } catch {
      return (
        abortedResult() ||
        failure(
          'BACKEND_UNREACHABLE',
          `Impossibile contattare il backend su ${url.origin}. Avvia il server (npm start nella cartella server) e verifica l'URL nel popup.`
        )
      );
    }

    if (res.ok && (res.headers.get('content-type') || '').includes('application/x-ndjson')) {
      armIdle();
      let line;
      try {
        line = await readNdjson(res, onProgress, armIdle);
      } catch {
        return abortedResult() || failure('CONNECTION_LOST', 'Connessione con il backend interrotta durante la generazione. Riprova.');
      }
      return line ? interpretBackendResult(line, res.status) : failure('BAD_BACKEND_RESPONSE', 'La risposta del backend si è interrotta prima del risultato.');
    }

    let json;
    try {
      json = await res.json();
    } catch {
      return abortedResult() || failure('BAD_BACKEND_RESPONSE', `Il backend ha risposto in modo non valido (HTTP ${res.status}).`);
    }
    return interpretBackendResult(json, res.status);
  } finally {
    clearTimeout(idleTimer);
  }
}

// --- Messaggi -----------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || sender.id !== chrome.runtime.id) return undefined;
  if (message.type === 'tcai:capture') {
    handleCapture(message, sender)
      .then(sendResponse)
      .catch((err) => sendResponse(failure('CAPTURE_FAILED', `Impossibile acquisire lo screenshot: ${shorten(err && err.message)}`)));
    return true; // risposta asincrona
  }
  return undefined;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'tcai-generate') return;
  if (!port.sender || !port.sender.tab || !isTinkercadUrl(port.sender.url)) {
    port.disconnect();
    return;
  }
  const controller = new AbortController();
  let keepAlive = null;
  port.onDisconnect.addListener(() => {
    controller.abort();
    clearInterval(keepAlive);
  });
  port.onMessage.addListener(async (message) => {
    // I "ping" del content script bastano a resettare il timer di inattività del service worker.
    if (!message || message.type !== 'generate') return;
    // Una fetch che impiega più di 30 s può far terminare il service worker:
    // una chiamata API periodica resetta il timer durante l'attesa.
    keepAlive = setInterval(() => chrome.runtime.getPlatformInfo().catch(() => {}), KEEPALIVE_MS);
    let result;
    try {
      result = await callBackend(message.payload, controller.signal, (progress) => {
        try {
          port.postMessage({ type: 'progress', ...progress });
        } catch {
          // Port già chiusa: la richiesta viene annullata da onDisconnect
        }
      });
    } catch (err) {
      result = failure('BACKEND_ERROR', `Errore imprevisto: ${shorten(err && err.message)}`);
    } finally {
      clearInterval(keepAlive);
    }
    try {
      port.postMessage({ type: 'result', result });
    } catch {
      // il content script si è disconnesso (pagina chiusa o ricaricata)
    }
  });
});

// La scorciatoia è un gesto dell'utente sull'estensione: concede anche activeTab per la scheda.
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'toggle-assistant' || !tab || !tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'tcai:toggle-panel' }).catch(() => {});
});
