'use strict';

/*
 * Backend locale per Tinkercad AI Code Assistant.
 * - Legge OPENROUTER_API_KEY / OPENROUTER_MODEL dall'ambiente (file .env).
 * - Accetta richieste solo da estensioni Chrome/Edge (origine chrome-extension://) o client locali senza Origin.
 * - Non salva prompt né screenshot e non li scrive nei log.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const { createOpenRouterClient, UpstreamError, DEFAULT_BASE_URL } = require('./openrouter');
const { buildMessages } = require('./prompt');
const { validateGenerateRequest } = require('./validate');

const EXTENSION_ORIGIN_RE = /^chrome-extension:\/\/([a-p]{32})$/;
const MODEL_SLUG_RE = /^~?[a-z0-9][\w.-]*\/[\w.:-]+$/i;
const MAX_FALLBACK_MODELS = 5;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function intFromEnv(env, name, fallback, { min, max }) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} deve essere un intero tra ${min} e ${max}.`);
  }
  return value;
}

/** Legge e valida la configurazione. Lancia un Error con tutti i problemi trovati. */
function loadConfig(env = process.env) {
  const problems = [];
  const apiKey = (env.OPENROUTER_API_KEY || '').trim();
  const model = (env.OPENROUTER_MODEL || '').trim();
  if (!apiKey) problems.push('OPENROUTER_API_KEY mancante: copia .env.example in .env e inserisci la tua chiave.');
  if (!model) problems.push('OPENROUTER_MODEL mancante: indica lo slug di un modello OpenRouter che accetti immagini.');

  const read = (name, fallback, range) => {
    try {
      return intFromEnv(env, name, fallback, range);
    } catch (err) {
      problems.push(err.message);
      return fallback;
    }
  };

  const config = {
    apiKey,
    model,
    host: (env.HOST || '127.0.0.1').trim(),
    port: read('PORT', 3000, { min: 1, max: 65535 }),
    timeoutMs: read('OPENROUTER_TIMEOUT_MS', 90000, { min: 5000, max: 600000 }),
    maxTokens: read('OPENROUTER_MAX_TOKENS', 8000, { min: 256, max: 200000 }),
    maxBodyMb: read('MAX_BODY_MB', 8, { min: 1, max: 32 }),
    rateLimitPerMin: read('RATE_LIMIT_PER_MIN', 10, { min: 1, max: 1000 }),
    temperature: undefined,
    baseUrl: (env.OPENROUTER_BASE_URL || DEFAULT_BASE_URL).trim(),
    allowedExtensionIds: (env.ALLOWED_EXTENSION_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    accessToken: (env.ACCESS_TOKEN || '').trim(),
    fallbackModels: (env.OPENROUTER_FALLBACK_MODELS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    appUrl: (env.APP_URL || '').trim(),
    appTitle: (env.APP_TITLE || 'Tinkercad AI Code Assistant').trim(),
  };

  if (env.OPENROUTER_TEMPERATURE !== undefined && env.OPENROUTER_TEMPERATURE !== '') {
    const t = Number(env.OPENROUTER_TEMPERATURE);
    if (!Number.isFinite(t) || t < 0 || t > 2) problems.push('OPENROUTER_TEMPERATURE deve essere un numero tra 0 e 2.');
    else config.temperature = t;
  }
  for (const slug of config.fallbackModels) {
    if (!MODEL_SLUG_RE.test(slug)) problems.push(`OPENROUTER_FALLBACK_MODELS contiene un modello non valido: "${slug}".`);
  }
  if (config.fallbackModels.length > MAX_FALLBACK_MODELS) {
    problems.push(`OPENROUTER_FALLBACK_MODELS: al massimo ${MAX_FALLBACK_MODELS} modelli di riserva.`);
  }
  for (const id of config.allowedExtensionIds) {
    if (!/^[a-p]{32}$/.test(id)) problems.push(`ALLOWED_EXTENSION_IDS contiene un ID non valido: "${id}".`);
  }
  try {
    const url = new URL(config.baseUrl);
    if (url.protocol !== 'https:' && !LOOPBACK_HOSTS.has(url.hostname)) {
      problems.push('OPENROUTER_BASE_URL deve usare https (http è ammesso solo verso localhost per i test).');
    }
  } catch {
    problems.push('OPENROUTER_BASE_URL non è un URL valido.');
  }

  if (problems.length) {
    const err = new Error(problems.join('\n'));
    err.problems = problems;
    throw err;
  }
  return config;
}

function sendError(res, status, code, message, extra = {}) {
  if (extra.retryAfter) res.set('Retry-After', String(extra.retryAfter));
  res.status(status).json({ ok: false, error: { code, message, ...extra } });
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function createRateLimiter(limit, windowMs = 60000, now = () => Date.now()) {
  let hits = [];
  return function take() {
    const t = now();
    hits = hits.filter((h) => t - h < windowMs);
    if (hits.length >= limit) {
      return { ok: false, retryAfter: Math.max(1, Math.ceil((windowMs - (t - hits[0])) / 1000)) };
    }
    hits.push(t);
    return { ok: true };
  };
}

/**
 * @param {ReturnType<typeof loadConfig>} config
 * @param {{client?: object, logger?: Pick<Console, 'log'|'warn'|'error'>, now?: () => number}} [deps]
 */
function createApp(config, deps = {}) {
  const logger = deps.logger || console;
  const client =
    deps.client ||
    createOpenRouterClient({
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      appUrl: config.appUrl,
      appTitle: config.appTitle,
      fallbackModels: config.fallbackModels,
    });
  const takeRateLimit = createRateLimiter(config.rateLimitPerMin, 60000, deps.now);
  const maxBodyBytes = config.maxBodyMb * 1024 * 1024;
  const maxImageChars = maxBodyBytes - 64 * 1024;
  let inFlight = 0;
  const MAX_IN_FLIGHT = 2;

  const app = express();
  app.disable('x-powered-by');

  // Log minimale: metodo, percorso, stato, durata. Mai corpo, header o chiavi.
  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
      logger.log(`${new Date().toISOString()} ${req.method} ${req.path} ${res.statusCode} ${Date.now() - started}ms`);
    });
    next();
  });

  // CORS: solo estensioni (eventualmente solo gli ID autorizzati). Le pagine web vengono rifiutate,
  // quindi non possono usare il server (e il credito OpenRouter) dal browser dell'utente.
  app.use((req, res, next) => {
    const origin = req.get('origin');
    if (!origin) return next(); // client locali (curl, test) non inviano Origin
    const match = EXTENSION_ORIGIN_RE.exec(origin);
    const allowed = match && (!config.allowedExtensionIds.length || config.allowedExtensionIds.includes(match[1]));
    if (!allowed) return sendError(res, 403, 'ORIGIN_NOT_ALLOWED', 'Origine non autorizzata.');
    res.set({
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Access-Token',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    });
    if (req.method === 'OPTIONS') return res.status(204).end();
    return next();
  });

  app.get('/health', async (req, res) => {
    const imageSupport = await client.getImageSupport();
    res.json({
      ok: true,
      model: config.model,
      fallbackModels: config.fallbackModels,
      imageSupport,
      auth: config.accessToken ? 'token' : 'none',
    });
  });

  app.use('/api', (req, res, next) => {
    if (config.accessToken && !safeEqual(req.get('x-access-token') || '', config.accessToken)) {
      return sendError(res, 401, 'UNAUTHORIZED', 'Token di accesso mancante o errato: controlla le impostazioni dell\'estensione.');
    }
    return next();
  });

  app.post(
    '/api/generate',
    (req, res, next) => {
      if (!req.is('application/json')) {
        return sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Il corpo deve essere JSON (Content-Type: application/json).');
      }
      const limit = takeRateLimit();
      if (!limit.ok) {
        return sendError(res, 429, 'LOCAL_RATE_LIMITED', `Troppe richieste: riprova tra ${limit.retryAfter} s.`, {
          retryAfter: limit.retryAfter,
        });
      }
      if (inFlight >= MAX_IN_FLIGHT) {
        return sendError(res, 429, 'BUSY', 'Il server sta già elaborando altre richieste: riprova tra qualche secondo.', {
          retryAfter: 5,
        });
      }
      return next();
    },
    express.json({ limit: maxBodyBytes, strict: true }),
    async (req, res) => {
      const validation = validateGenerateRequest(req.body, { maxImageChars });
      if (!validation.ok) return sendError(res, 400, 'INVALID_REQUEST', validation.message);
      const input = validation.value;

      inFlight += 1;
      const abort = new AbortController();
      res.on('close', () => {
        if (!res.writableFinished) abort.abort();
      });
      try {
        const warnings = [];
        let image = input.image;
        if (image) {
          const support = await client.getImageSupport();
          if (support === 'no') {
            image = null;
            warnings.push({
              code: 'MODEL_NO_IMAGE',
              message: `Il modello configurato (${config.model}) non accetta immagini: lo screenshot non è stato inviato.`,
            });
          } else if (support === 'unknown') {
            warnings.push({
              code: 'IMAGE_SUPPORT_UNKNOWN',
              message: 'Non è stato possibile verificare se il modello accetta immagini: lo screenshot è stato inviato comunque.',
            });
          }
        }

        const messages = buildMessages({ ...input, image });
        const result = await client.generate(messages, { signal: abort.signal });
        return res.json({
          ok: true,
          content: result.content,
          finishReason: result.finishReason,
          model: result.model,
          imageSent: Boolean(image),
          warnings,
          usage: result.usage,
        });
      } catch (err) {
        if (err instanceof UpstreamError) {
          if (err.code === 'CLIENT_CLOSED') return undefined;
          // Il messaggio non contiene né la chiave né il prompt: aiuta a capire la causa dal terminale.
          logger.warn(`OpenRouter: ${err.code} (HTTP ${err.status}) — ${err.message}`);
          return sendError(res, err.status, err.code, err.message, err.retryAfter ? { retryAfter: err.retryAfter } : {});
        }
        logger.error(`Errore interno: ${err && err.name}`);
        return sendError(res, 500, 'INTERNAL', 'Errore interno del server.');
      } finally {
        inFlight -= 1;
      }
    }
  );

  app.use((req, res) => sendError(res, 404, 'NOT_FOUND', 'Risorsa non trovata.'));

  // Errori di express.json (corpo troppo grande, JSON malformato) e altri errori imprevisti.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.too.large') {
      return sendError(res, 413, 'PAYLOAD_TOO_LARGE', `Richiesta troppo grande (massimo ${config.maxBodyMb} MB).`);
    }
    if (err && err.type === 'entity.parse.failed') {
      return sendError(res, 400, 'INVALID_JSON', 'JSON non valido.');
    }
    logger.error(`Errore interno: ${err && err.name}`);
    return sendError(res, 500, 'INTERNAL', 'Errore interno del server.');
  });

  return app;
}

function loadDotEnv() {
  const file = path.join(__dirname, '.env');
  if (fs.existsSync(file)) process.loadEnvFile(file);
}

if (require.main === module) {
  loadDotEnv();
  let config;
  try {
    config = loadConfig(process.env);
  } catch (err) {
    console.error('Configurazione non valida:\n' + err.message);
    process.exit(1);
  }
  if (!LOOPBACK_HOSTS.has(config.host)) {
    console.warn(`Attenzione: HOST=${config.host} espone il server oltre questo computer. Imposta ACCESS_TOKEN.`);
  }
  if (!config.allowedExtensionIds.length) {
    console.warn('Suggerimento: imposta ALLOWED_EXTENSION_IDS con l\'ID della tua estensione per limitare le origini accettate.');
  }
  const app = createApp(config);
  app.listen(config.port, config.host, () => {
    const fallbacks = config.fallbackModels.length ? `, riserva: ${config.fallbackModels.join(', ')}` : '';
    console.log(`Tinkercad AI backend in ascolto su http://${config.host}:${config.port} (modello: ${config.model}${fallbacks})`);
  });
}

module.exports = { createApp, loadConfig, createRateLimiter };
