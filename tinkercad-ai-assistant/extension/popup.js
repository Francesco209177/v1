/*
 * Popup dell'estensione: stato del backend, impostazioni, permesso facoltativo
 * per lo screenshot e apertura dell'assistente nella scheda corrente.
 * Aprire il popup è un gesto dell'utente: concede anche "activeTab" alla scheda attiva.
 */
'use strict';

const DEFAULT_BACKEND = 'http://localhost:3000';
const ALL_URLS = { origins: ['<all_urls>'] };
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
const HEALTH_TIMEOUT_MS = 4000;

const $ = (id) => document.getElementById(id);

function isTinkercad(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'www.tinkercad.com';
  } catch {
    return false;
  }
}

function setStatus(kind, text) {
  const el = $('backend-status');
  el.dataset.kind = kind;
  el.textContent = text;
}

function setSettingsMessage(kind, text) {
  const el = $('settings-message');
  el.hidden = !text;
  el.dataset.kind = kind;
  el.textContent = text || '';
}

/** Valida l'URL del backend. Restituisce l'URL normalizzato (solo origine) o lancia un Error leggibile. */
function parseBackendUrl(value) {
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Inserisci un URL valido, ad esempio http://localhost:3000.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error("L'URL deve iniziare con http:// o https://.");
  if (url.protocol === 'http:' && !LOCAL_HOSTS.has(url.hostname)) {
    throw new Error('Per un server non locale usa https:// (http è consentito solo per localhost).');
  }
  return url;
}

async function getSettings() {
  const stored = await chrome.storage.local.get(['backendUrl', 'accessToken']);
  return {
    backendUrl: stored.backendUrl || DEFAULT_BACKEND,
    accessToken: stored.accessToken || '',
  };
}

async function checkBackend() {
  setStatus('pending', 'Verifica del backend in corso…');
  const { backendUrl, accessToken } = await getSettings();
  let url;
  try {
    url = new URL('/health', backendUrl);
  } catch {
    setStatus('error', 'URL del backend non valido.');
    return;
  }
  try {
    const res = await fetch(url, {
      headers: accessToken ? { 'X-Access-Token': accessToken } : {},
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error((json.error && json.error.message) || `HTTP ${res.status}`);
    const images = { yes: 'accetta immagini', no: 'NON accetta immagini', unknown: 'supporto immagini non verificato' }[json.imageSupport] || '';
    setStatus(json.imageSupport === 'no' ? 'warning' : 'ok', `Connesso · modello ${json.model} (${images})`);
  } catch (err) {
    const reason = err && err.name === 'TimeoutError' ? 'nessuna risposta' : 'non raggiungibile';
    setStatus('error', `Backend ${reason} su ${url.origin}. Avvia il server con «npm start» nella cartella server.`);
  }
}

async function saveSettings(event) {
  event.preventDefault();
  setSettingsMessage('', '');
  let url;
  try {
    url = parseBackendUrl($('backend-url').value);
  } catch (err) {
    setSettingsMessage('error', err.message);
    return;
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    // Server remoto: permesso host solo per quell'origine (gesto dell'utente richiesto).
    const granted = await chrome.permissions.request({ origins: [`${url.origin}/*`] });
    if (!granted) {
      setSettingsMessage('error', `Permesso negato: l'estensione non può contattare ${url.origin}.`);
      return;
    }
  }
  await chrome.storage.local.set({ backendUrl: url.origin, accessToken: $('access-token').value.trim() });
  $('backend-url').value = url.origin;
  setSettingsMessage('ok', 'Impostazioni salvate.');
  checkBackend();
}

async function refreshPermissionToggle() {
  $('all-urls-toggle').checked = await chrome.permissions.contains(ALL_URLS);
}

async function onToggleAllUrls(event) {
  const wanted = event.target.checked;
  try {
    if (wanted) await chrome.permissions.request(ALL_URLS);
    else await chrome.permissions.remove(ALL_URLS);
  } catch (err) {
    setStatus('error', `Permesso non modificato: ${err.message}`);
  }
  refreshPermissionToggle();
}

async function setupTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const openButton = $('open-assistant');
  if (!tab || !tab.url || !isTinkercad(tab.url)) {
    $('tab-status').textContent = 'Apri un progetto di Tinkercad Circuits per usare l\'assistente.';
    return;
  }
  $('tab-status').textContent = 'Tinkercad rilevato: aprendo questo popup hai autorizzato lo screenshot di questa scheda.';
  const { assistantHidden } = await chrome.storage.local.get('assistantHidden');
  if (assistantHidden === true) {
    $('tab-status').textContent += ' L\'assistente è nascosto: premi Ctrl+Shift+Z nella pagina o il pulsante qui sotto.';
    openButton.textContent = 'Mostra l\'assistente';
  }
  openButton.hidden = false;
  openButton.addEventListener('click', async () => {
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { type: 'tcai:open-panel' });
      if (res && res.ok) {
        window.close();
        return;
      }
      $('tab-status').textContent = "L'editor dei circuiti non è visibile in questa pagina: apri un circuito in Tinkercad.";
    } catch {
      $('tab-status').textContent = "L'assistente non è ancora attivo in questa scheda: ricarica la pagina di Tinkercad.";
    }
  });
}

async function showShortcut() {
  try {
    const commands = await chrome.commands.getAll();
    const cmd = commands.find((c) => c.name === 'toggle-assistant');
    if (cmd && cmd.shortcut) $('shortcut').textContent = cmd.shortcut;
    else $('shortcut-hint').textContent = 'o una scorciatoia da assegnare in chrome://extensions/shortcuts';
  } catch {
    // lascia il testo predefinito
  }
}

async function init() {
  const settings = await getSettings();
  $('backend-url').value = settings.backendUrl;
  $('access-token').value = settings.accessToken;

  $('settings-form').addEventListener('submit', saveSettings);
  $('check-backend').addEventListener('click', checkBackend);
  $('all-urls-toggle').addEventListener('change', onToggleAllUrls);
  $('reset-position').addEventListener('click', async () => {
    await chrome.storage.local.remove('buttonPosition');
    $('reset-position').textContent = 'Posizione ripristinata ✓';
  });

  await Promise.all([setupTab(), refreshPermissionToggle(), showShortcut()]);
  checkBackend();
}

init();
