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
 * @param {{models?: object[], respond?: (body: object, req: http.IncomingMessage) => {status?: number, headers?: object, json?: object, raw?: string, delayMs?: number}}} [options]
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
        model: body.model,
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
