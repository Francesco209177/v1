'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp, loadConfig, createRateLimiter } = require('../server');
const { startMockOpenRouter } = require('../dev/mock-openrouter');
const { PNG_DATA_URL, EXTENSION_ORIGIN, baseEnv, silentLogger } = require('./helpers');

async function startApp(envOverrides = {}, mockOptions = {}) {
  const mock = await startMockOpenRouter(mockOptions);
  const config = loadConfig(baseEnv({ OPENROUTER_BASE_URL: mock.baseUrl, ...envOverrides }));
  const app = createApp(config, { logger: silentLogger });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    url,
    mock,
    close: async () => {
      await new Promise((r) => server.close(r));
      await mock.close();
    },
  };
}

function post(url, body, headers = {}) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: EXTENSION_ORIGIN, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('loadConfig richiede chiave e modello e non stampa la chiave', () => {
  assert.throws(() => loadConfig({}), (err) => /OPENROUTER_API_KEY/.test(err.message) && /OPENROUTER_MODEL/.test(err.message));
  assert.throws(() => loadConfig(baseEnv({ PORT: 'abc' })), /PORT/);
  assert.throws(() => loadConfig(baseEnv({ ALLOWED_EXTENSION_IDS: 'xyz' })), /ALLOWED_EXTENSION_IDS/);
  assert.throws(() => loadConfig(baseEnv({ OPENROUTER_BASE_URL: 'http://evil.example/api' })), /https/);
  try {
    loadConfig(baseEnv({ PORT: 'abc' }));
  } catch (err) {
    assert.doesNotMatch(err.message, /test-key-not-real/);
  }
  const cfg = loadConfig(baseEnv());
  assert.equal(cfg.host, '127.0.0.1');
  assert.equal(cfg.port, 3000);
});

test('POST /api/generate restituisce un risultato strutturato', async (t) => {
  const ctx = await startApp();
  t.after(ctx.close);
  const res = await post(`${ctx.url}/api/generate`, { prompt: 'Blink pin 13', image: PNG_DATA_URL, cropped: true });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), EXTENSION_ORIGIN);
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.equal(json.imageSent, true);
  assert.match(json.content, /```cpp/);
  assert.equal(json.finishReason, 'stop');
  assert.deepEqual(json.warnings, []);
  // La richiesta a OpenRouter contiene testo e immagine, e la chiave solo nell'header.
  const sent = ctx.mock.requests[0];
  assert.equal(sent.headers.authorization, 'Bearer test-key-not-real');
  assert.equal(sent.body.messages[1].content[1].type, 'image_url');
  assert.equal(JSON.stringify(json).includes('test-key-not-real'), false);
});

test('modello solo testo: lo screenshot non viene inviato', async (t) => {
  const ctx = await startApp({ OPENROUTER_MODEL: 'test/text-model' });
  t.after(ctx.close);
  const json = await (await post(`${ctx.url}/api/generate`, { prompt: 'Blink', image: PNG_DATA_URL })).json();
  assert.equal(json.ok, true);
  assert.equal(json.imageSent, false);
  assert.equal(json.warnings[0].code, 'MODEL_NO_IMAGE');
  assert.equal(ctx.mock.requests[0].body.messages[1].content.length, 1);
});

test('GET /health non espone segreti', async (t) => {
  const ctx = await startApp();
  t.after(ctx.close);
  const res = await fetch(`${ctx.url}/health`, { headers: { Origin: EXTENSION_ORIGIN } });
  const json = await res.json();
  assert.deepEqual(json, { ok: true, model: 'test/vision-model', imageSupport: 'yes', auth: 'none' });
});

test('CORS: origini web rifiutate, preflight estensione accettato', async (t) => {
  const ctx = await startApp({ ALLOWED_EXTENSION_IDS: 'abcdefghijklmnopabcdefghijklmnop' });
  t.after(ctx.close);
  const web = await post(`${ctx.url}/api/generate`, { prompt: 'x' }, { Origin: 'https://www.tinkercad.com' });
  assert.equal(web.status, 403);
  assert.equal(web.headers.get('access-control-allow-origin'), null);
  const otherExt = await post(`${ctx.url}/api/generate`, { prompt: 'x' }, { Origin: 'chrome-extension://pppppppppppppppppppppppppppppppp' });
  assert.equal(otherExt.status, 403);
  const preflight = await fetch(`${ctx.url}/api/generate`, {
    method: 'OPTIONS',
    headers: { Origin: EXTENSION_ORIGIN, 'Access-Control-Request-Method': 'POST' },
  });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers'), /X-Access-Token/);
  assert.equal(ctx.mock.requests.length, 0);
});

test('ACCESS_TOKEN obbligatorio se configurato', async (t) => {
  const ctx = await startApp({ ACCESS_TOKEN: 'tok-123' });
  t.after(ctx.close);
  assert.equal((await post(`${ctx.url}/api/generate`, { prompt: 'x' })).status, 401);
  assert.equal((await post(`${ctx.url}/api/generate`, { prompt: 'x' }, { 'X-Access-Token': 'wrong' })).status, 401);
  assert.equal((await post(`${ctx.url}/api/generate`, { prompt: 'x' }, { 'X-Access-Token': 'tok-123' })).status, 200);
});

test('validazione, JSON malformato, content-type e dimensione', async (t) => {
  const ctx = await startApp({ MAX_BODY_MB: '1' });
  t.after(ctx.close);
  const invalid = await post(`${ctx.url}/api/generate`, { prompt: '' });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, 'INVALID_REQUEST');
  const malformed = await post(`${ctx.url}/api/generate`, '{"prompt":');
  assert.equal((await malformed.json()).error.code, 'INVALID_JSON');
  const text = await fetch(`${ctx.url}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'x' });
  assert.equal(text.status, 415);
  const big = await post(`${ctx.url}/api/generate`, { prompt: 'x', currentCode: 'a'.repeat(1.2 * 1024 * 1024) });
  assert.equal(big.status, 413);
  assert.equal(ctx.mock.requests.length, 0);
});

test('errori upstream strutturati con Retry-After', async (t) => {
  const ctx = await startApp(
    {},
    { respond: () => ({ status: 429, headers: { 'Retry-After': '12' }, json: { error: { code: 429, message: 'rate' } } }) }
  );
  t.after(ctx.close);
  const res = await post(`${ctx.url}/api/generate`, { prompt: 'x' });
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('retry-after'), '12');
  const json = await res.json();
  assert.equal(json.ok, false);
  assert.equal(json.error.code, 'RATE_LIMITED');
  assert.equal(json.error.retryAfter, 12);
});

test('rate limit locale', async (t) => {
  const ctx = await startApp({ RATE_LIMIT_PER_MIN: '2' });
  t.after(ctx.close);
  assert.equal((await post(`${ctx.url}/api/generate`, { prompt: 'x' })).status, 200);
  assert.equal((await post(`${ctx.url}/api/generate`, { prompt: 'x' })).status, 200);
  const limited = await post(`${ctx.url}/api/generate`, { prompt: 'x' });
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).error.code, 'LOCAL_RATE_LIMITED');
});

test('createRateLimiter libera la finestra', () => {
  let now = 0;
  const take = createRateLimiter(1, 1000, () => now);
  assert.equal(take().ok, true);
  const second = take();
  assert.equal(second.ok, false);
  assert.equal(second.retryAfter, 1);
  now = 1001;
  assert.equal(take().ok, true);
});
