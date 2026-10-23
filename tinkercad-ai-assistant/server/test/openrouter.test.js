'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createOpenRouterClient, UpstreamError, parseRetryAfter, parseRateLimitReset, errorDetail } = require('../openrouter');

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

test('il dettaglio include l\'errore originale del fornitore (metadata.raw)', async () => {
  const raw = JSON.stringify({ error: { code: 400, message: 'Developer instruction is not enabled for models/gemma', status: 'INVALID_ARGUMENT' } });
  const client = makeClient(async () =>
    jsonResponse(502, { error: { code: 502, message: 'Provider returned error', metadata: { raw, provider_name: 'Google AI Studio' } } })
  );
  await expectError(client, 'MODEL_UNAVAILABLE', (err) => {
    assert.match(err.message, /Provider returned error — Developer instruction is not enabled/);
    assert.match(err.message, /fornitore: Google AI Studio/);
  });
  assert.equal(errorDetail({ message: 'x', metadata: { raw: 'testo semplice' } }), 'x — testo semplice');
  assert.equal(errorDetail({ message: 'x', metadata: { raw: { message: 'oggetto' } } }), 'x — oggetto');
  assert.equal(errorDetail(null), '');
});

test('quota condivisa del fornitore esaurita (risposta reale di OpenRouter), anche se arriva come 502', async () => {
  const error = {
    message: 'Provider returned error',
    code: 429,
    metadata: {
      raw: 'google/gemma-4-31b-it:free is temporarily rate-limited upstream. Please retry shortly, or add your own key',
      provider_name: 'Google AI Studio',
      is_byok: false,
      provider_error_code: '429',
      limit_source: 'upstream_provider_shared_pool',
    },
  };
  for (const status of [429, 502]) {
    const client = makeClient(async () => jsonResponse(status, { error }));
    await expectError(client, 'RATE_LIMITED', (err) => {
      assert.equal(err.status, 429);
      assert.match(err.message, /saturo/);
      assert.match(err.message, /Google AI Studio/);
      assert.match(err.message, /settings\/integrations/);
    });
  }
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

// --- Streaming (SSE) -----------------------------------------------------------

/** fetch finto che risponde in SSE seguendo uno script di passi { data } / { wait }; close:false = resta appeso. */
function sseFetch(steps, { close = true, onRequest } = {}) {
  return async (url, init) => {
    if (onRequest) onRequest(JSON.parse(init.body));
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        init.signal.addEventListener('abort', () => {
          try {
            controller.error(init.signal.reason);
          } catch {
            // già chiuso
          }
        });
        for (const step of steps) {
          if (init.signal.aborted) return;
          if (step.wait) await new Promise((r) => setTimeout(r, step.wait));
          else {
            try {
              controller.enqueue(encoder.encode(step.data));
            } catch {
              return;
            }
          }
        }
        if (close && !init.signal.aborted) controller.close();
      },
    });
    return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  };
}

const event = (obj) => `data: ${JSON.stringify(obj)}\n\n`;
const delta = (content, extra = {}) => event({ model: 'served/model', choices: [{ index: 0, delta: { content }, finish_reason: null, ...extra }] });

test('streaming: commenti, chunk spezzati, chunk usage duplicato e [DONE]', async () => {
  let sentBody;
  const full =
    ': OPENROUTER PROCESSING\n\n' +
    delta('```cpp\nvoid setup() {}\n') +
    delta('void loop() {}\n```') +
    event({ model: 'served/model', choices: [{ index: 0, delta: { content: '' }, finish_reason: 'stop' }] }) +
    event({ model: 'served/model', choices: [{ index: 0, delta: { content: '' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 } }) +
    'data: [DONE]\n\n';
  // spezza in pezzi da 7 byte per verificare il buffer tra una lettura e l'altra
  const steps = (full.match(/[\s\S]{1,7}/g) || []).map((data) => ({ data }));
  const progress = [];
  const client = makeClient(sseFetch(steps, { onRequest: (b) => (sentBody = b) }));
  const out = await client.generate([], { onProgress: (p) => progress.push(p.chars) });
  assert.equal(sentBody.stream, true);
  assert.equal(out.content, '```cpp\nvoid setup() {}\nvoid loop() {}\n```');
  assert.equal(out.finishReason, 'stop');
  assert.equal(out.model, 'served/model');
  assert.deepEqual(out.usage, { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 });
  assert.ok(progress.length >= 2 && progress[progress.length - 1] === out.content.length);
});

test('streaming: errore a metà generazione', async () => {
  const steps = [
    { data: delta('```cpp\nvoid setup') },
    { data: event({ error: { code: 502, message: 'Provider disconnected' }, choices: [{ index: 0, delta: { content: '' }, finish_reason: 'error' }] }) },
  ];
  await expectError(makeClient(sseFetch(steps)), 'MODEL_UNAVAILABLE', (err) => assert.match(err.message, /Provider disconnected/));
});

test('streaming: finish_reason "length" senza contenuto -> EMPTY_RESPONSE', async () => {
  const steps = [{ data: event({ choices: [{ index: 0, delta: { content: '' }, finish_reason: 'length' }] }) }, { data: 'data: [DONE]\n\n' }];
  await expectError(makeClient(sseFetch(steps)), 'EMPTY_RESPONSE');
});

test('timeout: nessun token entro il limite di inattività, anche con commenti di keep-alive', async () => {
  const steps = Array.from({ length: 20 }, () => [{ data: ': OPENROUTER PROCESSING\n\n' }, { wait: 15 }]).flat();
  const client = makeClient(sseFetch(steps, { close: false }), { idleTimeoutMs: 60, timeoutMs: 5000 });
  await expectError(client, 'UPSTREAM_TIMEOUT', (err) => {
    assert.match(err.message, /non ha iniziato a rispondere/);
    assert.equal(err.status, 504);
  });
});

test('timeout: il modello si ferma dopo aver iniziato', async () => {
  const client = makeClient(sseFetch([{ data: delta('void setup') }], { close: false }), { idleTimeoutMs: 60, timeoutMs: 5000 });
  await expectError(client, 'UPSTREAM_TIMEOUT', (err) => assert.match(err.message, /si è fermato/));
});

test('timeout totale anche se i token continuano ad arrivare', async () => {
  const steps = Array.from({ length: 50 }, () => [{ data: delta('x') }, { wait: 10 }]).flat();
  const client = makeClient(sseFetch(steps, { close: false }), { idleTimeoutMs: 1000, timeoutMs: 120 });
  await expectError(client, 'UPSTREAM_TIMEOUT', (err) => assert.match(err.message, /tempo massimo/));
});

test('il ragionamento del modello conta come avanzamento', async () => {
  const reasoning = (text) => event({ choices: [{ index: 0, delta: { content: '', reasoning: text }, finish_reason: null }] });
  const steps = [
    ...Array.from({ length: 6 }, () => [{ data: reasoning('penso...') }, { wait: 25 }]).flat(),
    { data: delta('```cpp\nvoid setup(){}\nvoid loop(){}\n```', { finish_reason: 'stop' }) },
    { data: 'data: [DONE]\n\n' },
  ];
  const client = makeClient(sseFetch(steps), { idleTimeoutMs: 80, timeoutMs: 5000 });
  const out = await client.generate([]);
  assert.match(out.content, /void loop/);
});
