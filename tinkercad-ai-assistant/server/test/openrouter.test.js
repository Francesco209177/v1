'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createOpenRouterClient, UpstreamError, parseRetryAfter, parseRateLimitReset } = require('../openrouter');

function jsonResponse(status, body, headers = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function makeClient(fetchImpl, extra = {}) {
  return createOpenRouterClient({
    apiKey: 'secret-key-123',
    model: 'test/vision-model',
    baseUrl: 'https://openrouter.test/api/v1',
    timeoutMs: 5000,
    maxTokens: 1000,
    appTitle: 'Test',
    fetchImpl,
    ...extra,
  });
}

const okBody = {
  model: 'test/vision-model',
  choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '```cpp\nvoid setup(){}\nvoid loop(){}\n```' } }],
  usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3, extra: 'x' },
};

test('invia la richiesta nel formato chat completions con autorizzazione', async () => {
  let captured;
  const client = makeClient(async (url, init) => {
    captured = { url, init };
    return jsonResponse(200, okBody);
  });
  const out = await client.generate([{ role: 'user', content: 'ciao' }]);
  assert.equal(captured.url, 'https://openrouter.test/api/v1/chat/completions');
  assert.equal(captured.init.method, 'POST');
  assert.equal(captured.init.headers.Authorization, 'Bearer secret-key-123');
  assert.equal(captured.init.headers['X-OpenRouter-Title'], 'Test');
  const body = JSON.parse(captured.init.body);
  assert.equal(body.model, 'test/vision-model');
  assert.equal(body.max_tokens, 1000);
  assert.equal('temperature' in body, false);
  assert.equal(out.finishReason, 'stop');
  assert.deepEqual(out.usage, { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 });
});

test('unisce contenuti restituiti come array di parti', async () => {
  const client = makeClient(async () =>
    jsonResponse(200, { choices: [{ finish_reason: 'stop', message: { content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] } }] })
  );
  const out = await client.generate([]);
  assert.equal(out.content, 'ab');
});

async function expectError(client, code, check) {
  await assert.rejects(client.generate([]), (err) => {
    assert.ok(err instanceof UpstreamError);
    assert.equal(err.code, code);
    assert.doesNotMatch(err.message, /secret-key-123/);
    if (check) check(err);
    return true;
  });
}

test('mappa gli errori HTTP di OpenRouter', async () => {
  const cases = [
    [400, 'UPSTREAM_BAD_REQUEST'],
    [401, 'UPSTREAM_AUTH'],
    [402, 'INSUFFICIENT_CREDITS'],
    [403, 'UPSTREAM_FORBIDDEN'],
    [404, 'MODEL_NOT_AVAILABLE'],
    [408, 'UPSTREAM_TIMEOUT'],
    [502, 'MODEL_UNAVAILABLE'],
    [503, 'NO_PROVIDER'],
    [500, 'UPSTREAM_ERROR'],
  ];
  for (const [status, code] of cases) {
    const client = makeClient(async () => jsonResponse(status, { error: { code: status, message: 'dettaglio' } }));
    await expectError(client, code);
  }
});

test('429 propaga Retry-After', async () => {
  const client = makeClient(async () => jsonResponse(429, { error: { code: 429, message: 'slow down' } }, { 'Retry-After': '17' }));
  await expectError(client, 'RATE_LIMITED', (err) => {
    assert.equal(err.status, 429);
    assert.equal(err.retryAfter, 17);
  });
});

test('429: fornitore sovraccarico', async () => {
  const client = makeClient(async () =>
    jsonResponse(429, { error: { code: 429, message: 'google/gemma:free is temporarily rate-limited upstream', metadata: { provider_name: 'X' } } })
  );
  await expectError(client, 'RATE_LIMITED', (err) => assert.match(err.message, /sovraccarico/));
});

test('429: limite giornaliero dei modelli gratuiti con X-RateLimit-Reset in millisecondi', async () => {
  const reset = String(Date.now() + 5 * 3600 * 1000);
  const client = makeClient(async () =>
    jsonResponse(429, { error: { code: 429, message: 'Rate limit exceeded: free-models-per-day' } }, { 'X-RateLimit-Limit': '50', 'X-RateLimit-Reset': reset })
  );
  await expectError(client, 'RATE_LIMITED', (err) => {
    assert.match(err.message, /giornaliere/);
    assert.match(err.message, /50 al giorno/);
    assert.match(err.message, /tra 5 h/);
    assert.ok(err.retryAfter > 17000);
  });
});

test('429: limite al minuto', async () => {
  const reset = String(Date.now() + 30 * 1000);
  const client = makeClient(async () =>
    jsonResponse(429, { error: { code: 429, message: 'Rate limit exceeded' } }, { 'X-RateLimit-Limit': '20', 'X-RateLimit-Reset': reset })
  );
  await expectError(client, 'RATE_LIMITED', (err) => {
    assert.match(err.message, /\(20\)/);
    assert.match(err.message, /tra 30 s/);
  });
});

test('modelli di riserva inviati con il parametro models', async () => {
  let body;
  const client = makeClient(
    async (url, init) => {
      body = JSON.parse(init.body);
      return jsonResponse(200, okBody);
    },
    { fallbackModels: ['b/one:free', 'c/two:free'] }
  );
  await client.generate([]);
  assert.deepEqual(body.models, ['test/vision-model', 'b/one:free', 'c/two:free']);
  assert.equal('model' in body, false);
});

test('parseRateLimitReset: millisecondi, secondi epoch, intervallo', () => {
  const now = 1_800_000_000_000;
  assert.equal(parseRateLimitReset(String(now + 60000), now), 60);
  assert.equal(parseRateLimitReset(String(now / 1000 + 120), now), 120);
  assert.equal(parseRateLimitReset('45', now), 45);
  assert.equal(parseRateLimitReset(String(now - 1000), now), undefined);
  assert.equal(parseRateLimitReset(null, now), undefined);
});

test('errore restituito con HTTP 200', async () => {
  const client = makeClient(async () => jsonResponse(200, { error: { code: 502, message: 'provider down' } }));
  await expectError(client, 'MODEL_UNAVAILABLE');
});

test('risposte non valide o vuote', async () => {
  await expectError(makeClient(async () => jsonResponse(200, '<html>oops')), 'INVALID_RESPONSE');
  await expectError(makeClient(async () => jsonResponse(200, { choices: [] })), 'INVALID_RESPONSE');
  await expectError(
    makeClient(async () => jsonResponse(200, { choices: [{ finish_reason: 'length', message: { content: '' } }] })),
    'EMPTY_RESPONSE',
    (err) => assert.match(err.message, /OPENROUTER_MAX_TOKENS/)
  );
  await expectError(
    makeClient(async () => jsonResponse(200, { choices: [{ finish_reason: 'error', message: { content: 'x' } }] })),
    'UPSTREAM_ERROR'
  );
});

test('errore di rete e timeout', async () => {
  await expectError(
    makeClient(async () => {
      throw new TypeError('fetch failed');
    }),
    'UPSTREAM_UNREACHABLE'
  );
  const slow = makeClient(
    (url, init) =>
      new Promise((resolve, reject) => {
        // AbortSignal.timeout non tiene vivo l'event loop: un timer lo simula come farebbe un socket aperto.
        const keepAlive = setTimeout(() => {}, 5000);
        init.signal.addEventListener('abort', () => {
          clearTimeout(keepAlive);
          reject(init.signal.reason);
        });
      }),
    { timeoutMs: 50 }
  );
  await expectError(slow, 'UPSTREAM_TIMEOUT', (err) => assert.equal(err.status, 504));
});

test('annullamento dal client', async () => {
  const controller = new AbortController();
  const client = makeClient(
    (url, init) =>
      new Promise((resolve, reject) => {
        const keepAlive = setTimeout(() => {}, 5000);
        init.signal.addEventListener('abort', () => {
          clearTimeout(keepAlive);
          reject(init.signal.reason);
        });
      })
  );
  const p = client.generate([], { signal: controller.signal });
  controller.abort();
  await assert.rejects(p, (err) => err.code === 'CLIENT_CLOSED');
});

test('getImageSupport legge input_modalities e usa la cache', async () => {
  let calls = 0;
  const models = {
    data: [
      { id: 'test/vision-model', architecture: { input_modalities: ['text', 'image'] } },
      { id: 'test/text-model', architecture: { input_modalities: ['text'] } },
    ],
  };
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse(200, models);
  };
  const vision = makeClient(fetchImpl);
  assert.equal(await vision.getImageSupport(), 'yes');
  assert.equal(await vision.getImageSupport(), 'yes');
  assert.equal(calls, 1);
  assert.equal(await makeClient(fetchImpl, { model: 'test/text-model' }).getImageSupport(), 'no');
  assert.equal(await makeClient(fetchImpl, { model: 'altro/modello' }).getImageSupport(), 'unknown');
  const offline = makeClient(async () => {
    throw new TypeError('fetch failed');
  });
  assert.equal(await offline.getImageSupport(), 'unknown');
});

test('parseRetryAfter', () => {
  assert.equal(parseRetryAfter('5'), 5);
  assert.equal(parseRetryAfter('0'), undefined);
  assert.equal(parseRetryAfter(null), undefined);
  assert.equal(parseRetryAfter('abc'), undefined);
  const future = new Date(Date.now() + 10000).toUTCString();
  assert.ok(parseRetryAfter(future) >= 9);
});
