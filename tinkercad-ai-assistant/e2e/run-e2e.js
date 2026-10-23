#!/usr/bin/env node
/*
 * Test end-to-end dell'estensione su una pagina REALE di Tinkercad Circuits (vista pubblica /embed/),
 * con backend locale e un finto OpenRouter (nessun credito consumato).
 *
 * Requisiti: Playwright con Chromium.
 *   npm i --no-save playwright && npx playwright install chromium
 *   npm run e2e
 * Variabili opzionali: TCAI_E2E_URL (circuito pubblico da aprire), PLAYWRIGHT_MODULE, HTTPS_PROXY.
 *
 * Limiti: Playwright non può cliccare l'icona dell'estensione, quindi activeTab non viene concesso.
 * Lo scenario 1 verifica il messaggio "screenshot non autorizzato" e il ripiego senza immagine;
 * lo scenario 2 usa una copia dell'estensione con <all_urls> (come dopo l'opt-in dal popup)
 * per verificare cattura e ritaglio reali.
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

// Playwright di norma forza anche il loopback attraverso il proxy: il backend locale va raggiunto direttamente.
process.env.PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK = '1';

let chromium;
try {
  ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'));
} catch {
  console.error('Playwright non trovato. Installa con: npm i --no-save playwright && npx playwright install chromium');
  process.exit(2);
}

const { createApp, loadConfig } = require('../server/server');
const { startMockOpenRouter } = require('../server/dev/mock-openrouter');

const ROOT = path.join(__dirname, '..');
const EXTENSION_DIR = path.join(ROOT, 'extension');
const OUTPUT_DIR = path.join(__dirname, 'output');
const TARGET_URL = process.env.TCAI_E2E_URL || 'https://www.tinkercad.com/embed/0UZTHJUvunR?editbtn=1';

const results = [];
function step(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function startBackend(mock) {
  const config = loadConfig({
    OPENROUTER_API_KEY: 'e2e-fake-key',
    OPENROUTER_MODEL: 'test/vision-model',
    OPENROUTER_BASE_URL: mock.baseUrl,
    RATE_LIMIT_PER_MIN: '100',
  });
  const app = createApp(config, { logger: { log() {}, warn() {}, error() {} } });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

function copyExtensionWithAllUrls() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tcai-ext-'));
  fs.cpSync(EXTENSION_DIR, dir, { recursive: true });
  const manifestPath = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.host_permissions = [...manifest.host_permissions, '<all_urls>'];
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return dir;
}

async function launch(extensionDir, { realWindow = false } = {}) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tcai-profile-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    // Con realWindow la viewport non è emulata: innerWidth/innerHeight coincidono con l'area catturata,
    // come in un browser reale (l'emulazione di Playwright altera solo la viewport della pagina).
    viewport: realWindow ? null : { width: 1400, height: 900 },
    // Il backend locale non deve passare dal proxy (Playwright altrimenti instrada anche il loopback).
    proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined,
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`, '--window-size=1400,900'],
  });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 30000 });
  const extensionId = new URL(worker.url()).host;
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://www.tinkercad.com' });
  return { context, worker, extensionId, userDataDir };
}

async function openTinkercad(context) {
  const page = await context.newPage();
  await page.goto(TARGET_URL, { waitUntil: 'load', timeout: 90000 });
  await page.waitForSelector('.js-editor--circuit', { timeout: 90000 });
  await page.waitForSelector('#tcai-root', { state: 'attached', timeout: 30000 });
  await page.waitForFunction(() => document.getElementById('tcai-root').style.visibility === 'visible', null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  return page;
}

const buttonState = (page) => page.locator('#tcai-root .ai-btn').getAttribute('data-state');

async function scenarioDefaultPermissions(mock, backend) {
  console.log('\n=== Scenario 1: permessi predefiniti (activeTab non concesso) ===');
  const { context, worker, extensionId, userDataDir } = await launch(EXTENSION_DIR);
  try {
    await worker.evaluate((url) => chrome.storage.local.set({ backendUrl: url }), backend.url);
    const page = await openTinkercad(context);

    const hosts = await page.locator('#tcai-root').count();
    step('un solo pulsante AI iniettato', hosts === 1, `host trovati: ${hosts}`);

    const box = await page.locator('#tcai-root .ai-btn').boundingBox();
    step('pulsante visibile vicino al pulsante "Code"', Boolean(box && box.width > 20), JSON.stringify(box));
    await page.screenshot({ path: path.join(OUTPUT_DIR, '01-button.png') });

    // Reinserimento se Tinkercad (o altro) rimuove il nodo.
    await page.evaluate(() => document.getElementById('tcai-root').remove());
    await page.waitForSelector('#tcai-root', { state: 'attached', timeout: 5000 });
    const afterRemoval = await page.locator('#tcai-root').count();
    step('pulsante reinserito dopo la rimozione, senza duplicati', afterRemoval === 1);

    // Pannello codice di Tinkercad aperto: il pulsante si sposta a sinistra del pannello.
    await page.click('.js-toggle_code_panel');
    await page.waitForTimeout(1500);
    const panelRect = await page.evaluate(() => {
      const r = document.querySelector('.js-editor__sidebar').getBoundingClientRect();
      return { x: r.x, width: r.width };
    });
    const box2 = await page.locator('#tcai-root .ai-btn').boundingBox();
    step(
      'con il pannello codice aperto il pulsante è accanto all\'editor',
      Boolean(box2 && box2.x + box2.width <= panelRect.x && panelRect.x - (box2.x + box2.width) < 40),
      `pulsante x=${box2 && Math.round(box2.x)}, pannello x=${Math.round(panelRect.x)}`
    );

    await page.locator('#tcai-root .ai-btn').click();
    const panelVisible = await page.locator('#tcai-root .panel').isVisible();
    step('il click apre il pannello', panelVisible);

    // Isolamento tastiera: i tasti digitati nel prompt non arrivano ai gestori della pagina.
    await page.evaluate(() => {
      window.__tcaiKeys = 0;
      document.addEventListener('keydown', () => {
        window.__tcaiKeys += 1;
      });
    });
    await page.locator('#tcai-root textarea.prompt').fill('');
    await page.locator('#tcai-root textarea.prompt').pressSequentially('Fai lampeggiare il LED sul pin 13 ogni secondo');
    await page.keyboard.press('Delete');
    const leakedKeys = await page.evaluate(() => window.__tcaiKeys);
    step('i tasti nel prompt non raggiungono Tinkercad', leakedKeys === 0, `eventi trapelati: ${leakedKeys}`);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '02-panel.png') });

    // Ctrl+Invio -> lo screenshot fallisce (activeTab non concesso): errore chiaro + ripiego.
    await page.locator('#tcai-root textarea.prompt').press('Control+Enter');
    await page.waitForFunction(() => {
      const b = document.getElementById('tcai-root').shadowRoot.querySelector('.ai-btn');
      return b.dataset.state === 'ERROR';
    }, null, { timeout: 15000 });
    const errorText = await page.locator('#tcai-root .message__text').textContent();
    step('Ctrl+Invio avvia la generazione; screenshot non autorizzato -> stato ERROR', /autorizzato lo screenshot/.test(errorText), errorText);
    step('nessuna richiesta inviata a OpenRouter senza conferma', mock.requests.length === 0);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '03-capture-not-authorized.png') });

    await page.locator('#tcai-root .message__action').click();
    await page.waitForFunction(
      (previous) => {
        const root = document.getElementById('tcai-root').shadowRoot;
        const s = root.querySelector('.ai-btn').dataset.state;
        return (s === 'SUCCESS' || s === 'ERROR') && root.querySelector('.message__text').textContent !== previous;
      },
      errorText,
      { timeout: 30000 }
    );
    const state = await buttonState(page);
    const shownCode = await page.locator('#tcai-root textarea.code').inputValue();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    const outcome = await page.locator('#tcai-root .message__text').textContent();
    step('"Genera senza screenshot" -> pulsante verde (SUCCESS)', state === 'SUCCESS', `stato: ${state}: ${outcome}`);
    step('codice estratto senza delimitatori Markdown', /void setup\(\)/.test(shownCode) && !shownCode.includes('```'));
    step('codice copiato negli appunti', clipboard === shownCode, `${clipboard.length} caratteri`);

    const sent = mock.requests[mock.requests.length - 1];
    if (!sent) throw new Error('Nessuna richiesta ricevuta dal finto OpenRouter');
    const userText = sent.body.messages[1].content[0].text;
    step('nessuna immagine inviata in modalità senza screenshot', sent.body.messages[1].content.length === 1);
    step('codice dell\'editor (CodeMirror via MAIN world) incluso nel contesto', /Codice attualmente presente nell'editor[^:]*:\n`{3,}cpp\n[\s\S]*void setup/.test(userText));
    step('modalità editor e componenti inclusi come indizi', /Modalità dell'editor/.test(userText) && /arduino-uno-r3 ×1/.test(userText), userText.split('\n').filter((l) => l.startsWith('- ')).join(' | '));
    step(
      'inventario senza doppioni dei livelli di interazione',
      /switch-pushbutton-dfrobotkit ×25/.test(userText) && !/(: |, )(pushbutton|resetbutton) ×/.test(userText)
    );
    step('la chiave API non transita nel browser', !JSON.stringify(sent.body).includes('e2e-fake-key') && sent.headers.authorization === 'Bearer e2e-fake-key');
    await page.screenshot({ path: path.join(OUTPUT_DIR, '04-success.png') });

    // Risposta senza blocco di codice: niente copia, niente verde.
    mock.nextReply = 'Non riesco a vedere a quale pin è collegato il LED. Puoi indicarlo?';
    await page.evaluate(() => navigator.clipboard.writeText('sentinella'));
    await page.locator('#tcai-root .message__action').isHidden();
    await page.locator('#tcai-root textarea.prompt').fill('Accendi il LED');
    await page.locator('#tcai-root .btn--primary').click();
    await page.waitForFunction(() => {
      const root = document.getElementById('tcai-root').shadowRoot;
      return root.querySelector('.ai-btn').dataset.state !== 'GENERATING' && !root.querySelector('.message').hidden;
    }, null, { timeout: 30000 });
    // Il secondo tentativo usa ancora la cattura: fallisce e propone il ripiego.
    if ((await buttonState(page)) === 'ERROR') {
      await page.locator('#tcai-root .message__action').click();
      await page.waitForFunction(() => {
        const root = document.getElementById('tcai-root').shadowRoot;
        return root.querySelector('.ai-btn').dataset.state !== 'GENERATING' && !root.querySelector('.response').hidden;
      }, null, { timeout: 30000 });
    }
    const noCodeState = await buttonState(page);
    const clipboardAfter = await page.evaluate(() => navigator.clipboard.readText());
    step('risposta senza codice: nessuna copia e pulsante non verde', noCodeState === 'IDLE' && clipboardAfter === 'sentinella', `stato: ${noCodeState}`);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '05-no-code.png') });
    mock.nextReply = null;

    // Backend non raggiungibile: errore comprensibile, stato rosso.
    await worker.evaluate(() => chrome.storage.local.set({ backendUrl: 'http://127.0.0.1:9' }));
    await page.locator('#tcai-root textarea.prompt').fill('Blink');
    await page.locator('#tcai-root .btn--primary').click();
    await page.waitForFunction(() => document.getElementById('tcai-root').shadowRoot.querySelector('.ai-btn').dataset.state === 'ERROR', null, { timeout: 15000 });
    await page.locator('#tcai-root .message__action').click();
    await page.waitForFunction(() => {
      const root = document.getElementById('tcai-root').shadowRoot;
      return root.querySelector('.ai-btn').dataset.state === 'ERROR' && /backend/i.test(root.querySelector('.message__text').textContent);
    }, null, { timeout: 30000 });
    step('backend spento: messaggio chiaro e stato ERROR', true, await page.locator('#tcai-root .message__text').textContent());
    await worker.evaluate((url) => chrome.storage.local.set({ backendUrl: url }), backend.url);

    // Popup: stato del backend e validazione dell'URL.
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.waitForFunction(() => document.getElementById('backend-status').dataset.kind !== 'pending', null, { timeout: 10000 });
    const status = await popup.locator('#backend-status').textContent();
    step('popup: backend connesso con modello e supporto immagini', /Connesso · modello test\/vision-model \(accetta immagini\)/.test(status), status);
    await popup.fill('#backend-url', 'http://example.com:3000');
    await popup.click('button[type="submit"]');
    const validation = await popup.locator('#settings-message').textContent();
    step('popup: rifiuta http verso server non locali', /https/.test(validation), validation);
    await popup.screenshot({ path: path.join(OUTPUT_DIR, '08-popup.png'), fullPage: true });
    await popup.close();
  } finally {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

async function scenarioAllUrls(mock) {
  console.log('\n=== Scenario 2: opt-in <all_urls> (screenshot senza clic aggiuntivi) ===');
  const extDir = copyExtensionWithAllUrls();
  const { context, worker, userDataDir } = await launch(extDir, { realWindow: true });
  try {
    await worker.evaluate((url) => chrome.storage.local.set({ backendUrl: url }), mock.backendUrl);
    const page = await openTinkercad(context);
    await page.locator('#tcai-root .ai-btn').click();
    await page.locator('#tcai-root textarea.prompt').fill('Fai suonare il buzzer quando premo un pulsante');
    const before = mock.requests.length;
    await page.locator('#tcai-root .btn--primary').click();
    await page.waitForFunction(() => {
      const s = document.getElementById('tcai-root').shadowRoot.querySelector('.ai-btn').dataset.state;
      return s === 'SUCCESS' || s === 'ERROR';
    }, null, { timeout: 45000 });
    const state = await buttonState(page);
    const message = await page.locator('#tcai-root .message__text').textContent();
    step('generazione con screenshot -> SUCCESS', state === 'SUCCESS', `${state}: ${message}`);

    const sent = mock.requests[before];
    const parts = sent ? sent.body.messages[1].content : [];
    const image = parts.find((p) => p.type === 'image_url');
    step('screenshot inviato come data URL JPEG', Boolean(image && image.image_url.url.startsWith('data:image/jpeg;base64,')));
    if (image) {
      const file = path.join(OUTPUT_DIR, '06-sent-screenshot.jpg');
      fs.writeFileSync(file, Buffer.from(image.image_url.url.split(',')[1], 'base64'));
      step('screenshot ritagliato sull\'area del circuito', /ritagliato/.test(parts[0].text), path.relative(ROOT, file));
    }
    const meta = await page.locator('#tcai-root .result__meta').textContent();
    step('metadati mostrano lo screenshot del circuito', /screenshot del circuito/.test(meta), meta);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '07-success-with-screenshot.png') });
  } finally {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
    fs.rmSync(extDir, { recursive: true, force: true });
  }
}

(async () => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const mock = await startMockOpenRouter({
    respond: (body) => ({
      json: {
        model: body.model,
        choices: [
          {
            finish_reason: 'stop',
            message: { role: 'assistant', content: mock.nextReply || require('../server/dev/mock-openrouter').DEFAULT_REPLY },
          },
        ],
      },
    }),
  });
  const backend = await startBackend(mock);
  mock.backendUrl = backend.url;
  let failed = false;
  try {
    await scenarioDefaultPermissions(mock, backend);
    await scenarioAllUrls(mock);
  } catch (err) {
    failed = true;
    console.error('\nErrore E2E:', err);
  } finally {
    await new Promise((r) => backend.server.close(r));
    await mock.close();
  }
  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} verifiche superate. Screenshot in ${path.relative(process.cwd(), OUTPUT_DIR)}/`);
  assert.ok(!failed && bad.length === 0, 'E2E fallito');
})().catch(() => {
  process.exitCode = 1;
});
