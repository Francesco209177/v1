'use strict';

/*
 * Finto OpenRouter per test automatici ed E2E (nessun credito consumato).
 * Espone GET /api/v1/models e POST /api/v1/chat/completions.
 *
 * Uso da riga di comando:
 *   node dev/mock-openrouter.js 4010
 * poi avvia il server con OPENROUTER_BASE_URL=http://127.0.0.1:4010/api/v1
 */

const http = require('node:http');

const DEFAULT_REPLY = [
  'Il LED integrato è collegato al pin 13: lo faccio lampeggiare ogni secondo.',
  '',
  '```cpp',
  '// Lampeggio del LED sul pin 13',
  'const int LED_PIN = 13;',
  '',
  'void setup() {',
  '  pinMode(LED_PIN, OUTPUT);',
  '}',
  '',
  'void loop() {',
  '  digitalWrite(LED_PIN, HIGH);',
  '  delay(1000);',
  '  digitalWrite(LED_PIN, LOW);',
  '  delay(1000);',
  '}',
  '```',
].join('\n');

/**
 * Invia una risposta di successo come SSE, come fa OpenRouter con "stream: true":
 * commenti di keep-alive, delta di contenuto, chunk finale con usage e "[DONE]".
 * Opzioni nella risposta: firstTokenDelayMs, chunkDelayMs, sseErrorAfter (n. di chunk prima di un errore a metà).
 */
function streamCompletion(res, out, body) {
  const json = out.json;
  const servedModel = json.model || body.model || (Array.isArray(body.models) ? body.models[0] : undefined);
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', ...(out.headers || {}) });
  const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  res.write(': OPENROUTER PROCESSING\n\n');
  const keepAlive = setInterval(() => res.write(': OPENROUTER PROCESSING\n\n'), 200);

  const events = [];
  if (json.error) {
    events.push({ error: json.error, choices: [{ index: 0, delta: { content: '' }, finish_reason: 'error' }] });
  } else {
    const choice = json.choices[0];
    const content = typeof choice.message.content === 'string' ? choice.message.content : '';
    for (const piece of content.match(/[\s\S]{1,40}/g) || []) {
      events.push({ model: servedModel, choices: [{ index: 0, delta: { role: 'assistant', content: piece }, finish_reason: null }] });
    }
    const finish = choice.finish_reason || 'stop';
    events.push({ model: servedModel, choices: [{ index: 0, delta: { content: '' }, finish_reason: finish }] });
    events.push({ model: servedModel, choices: [{ index: 0, delta: { content: '' }, finish_reason: finish }], usage: json.usage });
    if (out.sseErrorAfter !== undefined) {
      events.splice(out.sseErrorAfter, events.length, {
        error: { code: 502, message: 'Provider disconnected' },
        choices: [{ index: 0, delta: { content: '' }, finish_reason: 'error' }],
      });
    }
  }

  let i = 0;
  const next = () => {
    clearInterval(keepAlive);
    if (res.destroyed) return;
    if (i < events.length) {
      send(events[i]);
      i += 1;
      setTimeout(next, out.chunkDelayMs || 0);
    } else {
      res.end(json.error || out.sseErrorAfter !== undefined ? '' : 'data: [DONE]\n\n');
    }
  };
  res.on('close', () => clearInterval(keepAlive));
  setTimeout(next, out.firstTokenDelayMs || 0);
}

/**
 * @param {{models?: object[], respond?: (body: object, req: http.IncomingMessage) => {status?: number, headers?: object, json?: object, raw?: string, delayMs?: number, stream?: boolean}}} [options]
 */
function startMockOpenRouter(options = {}) {
  const requests = [];
  const models = options.models || [
    { id: 'test/vision-model', architecture: { input_modalities: ['text', 'image'] } },
    { id: 'test/text-model', architecture: { input_modalities: ['text'] } },
  ];
  const respond =
    options.respond ||
    ((body) => ({
      json: {
        id: 'gen-test',
        model: body.model || (Array.isArray(body.models) ? body.models[0] : undefined),
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: DEFAULT_REPLY } }],
        usage: { prompt_tokens: 100, completion_tokens: 80, total_tokens: 180 },
      },
    }));

  const server = http.createServer((req, res) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      if (req.method === 'GET' && req.url === '/api/v1/models') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: models }));
        return;
      }
      if (req.method === 'POST' && req.url === '/api/v1/chat/completions') {
        let body;
        try {
          body = JSON.parse(data);
        } catch {
          body = {};
        }
        requests.push({ headers: req.headers, body });
        const out = respond(body, req) || {};
        const status = out.status || 200;
        if (body.stream === true && status === 200 && out.raw === undefined && out.stream !== false && out.json) {
          if (out.delayMs) setTimeout(() => streamCompletion(res, out, body), out.delayMs);
          else streamCompletion(res, out, body);
          return;
        }
        const send = () => {
          res.writeHead(out.status || 200, { 'Content-Type': 'application/json', ...(out.headers || {}) });
          res.end(out.raw !== undefined ? out.raw : JSON.stringify(out.json || {}));
        };
        if (out.delayMs) setTimeout(send, out.delayMs);
        else send();
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 404, message: 'not found' } }));
    });
  });

  return new Promise((resolve) => {
    server.listen(options.port || 0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        server,
        port,
        baseUrl: `http://127.0.0.1:${port}/api/v1`,
        requests,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

if (require.main === module) {
  const port = Number(process.argv[2]) || 4010;
  startMockOpenRouter({ port }).then(({ baseUrl }) => {
    console.log(`Mock OpenRouter in ascolto: ${baseUrl}`);
  });
}

module.exports = { startMockOpenRouter, DEFAULT_REPLY };
