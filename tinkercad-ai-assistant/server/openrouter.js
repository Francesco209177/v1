'use strict';

/*
 * Client minimale per OpenRouter chat completions.
 * Documentazione: https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion
 * La chiave API resta in questo processo: non viene mai inclusa in errori, log o risposte.
 */

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const MODELS_TTL_MS = 60 * 60 * 1000;
const MODELS_FAILURE_TTL_MS = 5 * 60 * 1000;
const MODELS_TIMEOUT_MS = 10000;

class UpstreamError extends Error {
  /**
   * @param {string} code codice stabile per il frontend
   * @param {string} message messaggio leggibile, senza dati sensibili
   * @param {{status?: number, retryAfter?: number}} [extra]
   */
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'UpstreamError';
    this.code = code;
    this.status = extra.status || 502;
    if (extra.retryAfter) this.retryAfter = extra.retryAfter;
  }
}

function parseRetryAfter(value) {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds);
  const date = Date.parse(value);
  if (Number.isFinite(date)) {
    const diff = Math.ceil((date - Date.now()) / 1000);
    return diff > 0 ? diff : undefined;
  }
  return undefined;
}

/**
 * Secondi mancanti al reset indicato da X-RateLimit-Reset.
 * Accetta un timestamp in millisecondi o in secondi, oppure un intervallo già in secondi.
 */
function parseRateLimitReset(value, now = Date.now()) {
  const n = Number(value);
  if (!value || !Number.isFinite(n) || n <= 0) return undefined;
  if (n < 1e9) return Math.ceil(n);
  const resetMs = n > 1e12 ? n : n * 1000;
  const diff = Math.ceil((resetMs - now) / 1000);
  return diff > 0 ? diff : undefined;
}

function readRateLimit(headers) {
  const limit = Number(headers.get('x-ratelimit-limit'));
  return {
    limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
    resetIn: parseRateLimitReset(headers.get('x-ratelimit-reset')),
  };
}

function formatWait(seconds) {
  if (seconds < 90) return `${seconds} s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min`;
  return `${Math.round(seconds / 3600)} h`;
}

function shorten(text, max = 300) {
  if (typeof text !== 'string') return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max) + '…' : clean;
}

/**
 * Messaggio per i 429: OpenRouter distingue il limite dei modelli gratuiti (al minuto o al giorno,
 * con header X-RateLimit-*) dal fornitore del modello sovraccarico (metadata.provider_*).
 */
function rateLimitMessage(error, rate, wait) {
  const metadata = (error && error.metadata) || {};
  const detail = shorten(error && error.message);
  const when = wait ? `tra ${formatWait(wait)}` : 'tra poco';
  if (metadata.limit_source === 'upstream_provider_shared_pool') {
    return (
      `Il modello gratuito è saturo: la quota del fornitore${metadata.provider_name ? ` (${metadata.provider_name})` : ''} ` +
      `è condivisa da tutti gli utenti OpenRouter ed è esaurita in questo momento. Riprova ${when}, usa la versione ` +
      `a pagamento del modello (senza «:free») oppure collega la tua chiave del fornitore su openrouter.ai/settings/integrations.`
    );
  }
  const upstream =
    metadata.provider_code !== undefined ||
    metadata.provider_error_code !== undefined ||
    metadata.provider_name !== undefined ||
    /upstream|provider/i.test(detail);
  if (upstream) {
    return (
      `Il fornitore del modello è sovraccarico (capita spesso con i modelli gratuiti «:free»). ` +
      `Riprova ${when}, scegli un altro modello oppure imposta OPENROUTER_FALLBACK_MODELS nel file .env.`
    );
  }
  if (rate.limit && rate.resetIn > 120) {
    return (
      `Hai esaurito le richieste giornaliere ai modelli gratuiti di OpenRouter (${rate.limit} al giorno). ` +
      `Riprova ${when}, usa un modello a pagamento oppure acquista almeno 10 crediti (limite 1000 al giorno).`
    );
  }
  if (rate.limit) return `Limite di richieste dei modelli gratuiti raggiunto (${rate.limit}): riprova ${when}.`;
  return `Troppe richieste a OpenRouter: riprova ${when}.${detail ? ` Dettaglio: ${detail}` : ''}`;
}

/**
 * Dettaglio leggibile di un errore: messaggio di OpenRouter più, se presente, l'errore originale del
 * fornitore (metadata.raw) e il suo nome. "Provider returned error" da solo non spiega nulla.
 */
function errorDetail(error) {
  if (!error) return '';
  const parts = [];
  if (typeof error.message === 'string') parts.push(error.message);
  const metadata = error.metadata || {};
  let raw = metadata.raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      raw = (parsed && parsed.error && parsed.error.message) || (parsed && parsed.message) || raw;
    } catch {
      // raw non è JSON: si usa così com'è
    }
  } else if (raw && typeof raw === 'object') {
    raw = (raw.error && raw.error.message) || raw.message || JSON.stringify(raw);
  }
  if (typeof raw === 'string' && raw.trim() && !parts.includes(raw)) parts.push(raw);
  if (typeof metadata.provider_name === 'string') parts.push(`fornitore: ${metadata.provider_name}`);
  return shorten(parts.join(' — '));
}

/** Converte un errore OpenRouter ({code, message, metadata}) in UpstreamError. */
function mapOpenRouterError(status, error, retryAfter, rate = {}) {
  const metadata = (error && error.metadata) || {};
  // Con i modelli di riserva OpenRouter può rispondere 502 anche quando la causa è un limite del fornitore.
  if (status !== 429 && (metadata.limit_source === 'upstream_provider_shared_pool' || String(metadata.provider_error_code) === '429')) {
    status = 429;
  }
  const detail = errorDetail(error);
  const suffix = detail ? ` Dettaglio: ${detail}` : '';
  switch (status) {
    case 400:
      return new UpstreamError('UPSTREAM_BAD_REQUEST', `OpenRouter ha rifiutato la richiesta.${suffix}`);
    case 401:
      return new UpstreamError(
        'UPSTREAM_AUTH',
        'Chiave OpenRouter non valida o disabilitata: verifica OPENROUTER_API_KEY nel file .env del server.'
      );
    case 402:
      return new UpstreamError('INSUFFICIENT_CREDITS', `Credito OpenRouter insufficiente per questa richiesta.${suffix}`, {
        status: 402,
        retryAfter,
      });
    case 403: {
      const reasons = error && error.metadata && Array.isArray(error.metadata.reasons) ? error.metadata.reasons.join(', ') : '';
      return new UpstreamError(
        'UPSTREAM_FORBIDDEN',
        `Richiesta bloccata da OpenRouter (moderazione o permessi).${reasons ? ' Motivi: ' + shorten(reasons) : suffix}`
      );
    }
    case 404:
      return new UpstreamError(
        'MODEL_NOT_AVAILABLE',
        `Modello non trovato o senza provider compatibili con questa richiesta (es. input immagine). Controlla OPENROUTER_MODEL.${suffix}`
      );
    case 408:
      return new UpstreamError('UPSTREAM_TIMEOUT', 'OpenRouter ha segnalato un timeout. Riprova.', { status: 504 });
    case 429: {
      const wait = retryAfter || rate.resetIn;
      return new UpstreamError('RATE_LIMITED', rateLimitMessage(error, rate, wait), { status: 429, retryAfter: wait });
    }
    case 502:
      return new UpstreamError('MODEL_UNAVAILABLE', `Il modello scelto non è disponibile o ha risposto in modo non valido.${suffix}`);
    case 503:
      return new UpstreamError('NO_PROVIDER', `Nessun provider disponibile per il modello configurato.${suffix}`, {
        status: 503,
        retryAfter,
      });
    default:
      return new UpstreamError('UPSTREAM_ERROR', `Errore da OpenRouter (HTTP ${status}).${suffix}`);
  }
}

function contentToText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part.text === 'string' ? part.text : ''))
      .join('');
  }
  return null;
}

function isAbortError(err) {
  return err && (err.name === 'AbortError' || err.name === 'TimeoutError');
}

/**
 * @param {object} options
 * @param {string} options.apiKey
 * @param {string} options.model
 * @param {string} [options.baseUrl]
 * @param {number} options.timeoutMs tempo massimo totale della generazione
 * @param {number} [options.idleTimeoutMs] tempo massimo senza ricevere token (default: timeoutMs)
 * @param {number} options.maxTokens
 * @param {number} [options.temperature]
 * @param {string} [options.appUrl]
 * @param {string} [options.appTitle]
 * @param {string[]} [options.fallbackModels] modelli provati in ordine se il principale fallisce
 * @param {typeof fetch} [options.fetchImpl]
 */
function createOpenRouterClient(options) {
  const {
    apiKey,
    model,
    baseUrl = DEFAULT_BASE_URL,
    timeoutMs,
    idleTimeoutMs,
    maxTokens,
    temperature,
    appUrl,
    appTitle,
    fallbackModels = [],
    fetchImpl = globalThis.fetch,
  } = options;
  const root = baseUrl.replace(/\/+$/, '');
  const idleMs = idleTimeoutMs || timeoutMs;
  let modalityCache = null; // { value: 'yes'|'no'|'unknown', expires: number }

  function headers() {
    const h = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
    if (appUrl) h['HTTP-Referer'] = appUrl;
    if (appTitle) h['X-OpenRouter-Title'] = appTitle;
    return h;
  }

  /**
   * Verifica tramite GET /models se il modello configurato accetta immagini.
   * @returns {Promise<'yes'|'no'|'unknown'>}
   */
  async function getImageSupport() {
    if (modalityCache && modalityCache.expires > Date.now()) return modalityCache.value;
    let value = 'unknown';
    let ttl = MODELS_FAILURE_TTL_MS;
    try {
      const res = await fetchImpl(`${root}/models`, { signal: AbortSignal.timeout(MODELS_TIMEOUT_MS) });
      if (res.ok) {
        const json = await res.json();
        const list = json && Array.isArray(json.data) ? json.data : [];
        const entry = list.find((m) => m && (m.id === model || m.canonical_slug === model));
        const modalities = entry && entry.architecture && entry.architecture.input_modalities;
        if (Array.isArray(modalities)) value = modalities.includes('image') ? 'yes' : 'no';
        ttl = MODELS_TTL_MS;
      }
    } catch {
      // Rete non disponibile: il supporto resta "unknown" e l'immagine viene comunque inviata.
    }
    modalityCache = { value, expires: Date.now() + ttl };
    return value;
  }

  /** Risposta non in streaming (JSON): stessa validazione di prima. */
  function parseCompletionJson(json, res) {
    if (!json || typeof json !== 'object') {
      throw new UpstreamError('INVALID_RESPONSE', 'OpenRouter ha restituito una risposta non valida.');
    }
    // Errori emessi durante la generazione possono arrivare con HTTP 200.
    if (json.error) {
      const status = Number(json.error.code) || 502;
      throw mapOpenRouterError(status, json.error, parseRetryAfter(res.headers.get('retry-after')), readRateLimit(res.headers));
    }
    const choice = Array.isArray(json.choices) ? json.choices[0] : null;
    if (!choice || !choice.message) {
      throw new UpstreamError('INVALID_RESPONSE', 'La risposta di OpenRouter non contiene alcun messaggio.');
    }
    if (choice.error) {
      throw new UpstreamError('UPSTREAM_ERROR', `Errore durante la generazione: ${shorten(choice.error.message) || 'sconosciuto'}.`);
    }
    return finalize({
      content: contentToText(choice.message.content),
      finishReason: choice.finish_reason || choice.native_finish_reason || null,
      model: json.model,
      usage: json.usage,
    });
  }

  function finalize({ content, finishReason, model: servedModel, usage }) {
    if (finishReason === 'error') {
      throw new UpstreamError('UPSTREAM_ERROR', 'Il modello ha interrotto la generazione con un errore. Riprova.');
    }
    if (content === null || !content.trim()) {
      throw new UpstreamError(
        'EMPTY_RESPONSE',
        finishReason === 'length'
          ? 'Il modello ha esaurito i token prima di rispondere: aumenta OPENROUTER_MAX_TOKENS o scegli un altro modello.'
          : 'Il modello ha restituito una risposta vuota. Riprova.'
      );
    }
    return {
      content,
      finishReason,
      model: typeof servedModel === 'string' ? servedModel : model,
      usage: usage
        ? { prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens, total_tokens: usage.total_tokens }
        : null,
    };
  }

  /**
   * Legge la risposta SSE di OpenRouter (stream: true). Ignora i commenti di keep-alive
   * (": OPENROUTER PROCESSING"), accumula delta.content e segnala l'avanzamento.
   */
  async function readEventStream(res, onDelta) {
    const state = { content: '', finishReason: null, model: null, usage: null };
    const decoder = new TextDecoder();
    let buffer = '';
    let data = [];
    let done = false;

    const dispatch = () => {
      if (!data.length) return;
      const payload = data.join('\n');
      data = [];
      if (payload === '[DONE]') {
        done = true;
        return;
      }
      let chunk;
      try {
        chunk = JSON.parse(payload);
      } catch {
        return; // evento non JSON: ignorato
      }
      if (chunk.error) {
        throw mapOpenRouterError(Number(chunk.error.code) || 502, chunk.error, undefined, {});
      }
      if (typeof chunk.model === 'string') state.model = chunk.model;
      if (chunk.usage) state.usage = chunk.usage;
      const choice = Array.isArray(chunk.choices) ? chunk.choices[0] : null;
      if (!choice) return;
      if (choice.error) {
        throw new UpstreamError('UPSTREAM_ERROR', `Errore durante la generazione: ${shorten(choice.error.message) || 'sconosciuto'}.`);
      }
      const delta = choice.delta || {};
      const text = contentToText(delta.content) || '';
      const reasoning = typeof delta.reasoning === 'string' ? delta.reasoning.length : 0;
      if (text) state.content += text;
      if (text || reasoning) onDelta(text.length + reasoning);
      const finish = choice.finish_reason || choice.native_finish_reason;
      if (finish) state.finishReason = finish;
    };

    const handleLine = (line) => {
      if (line === '') return dispatch();
      if (line.startsWith(':')) return undefined; // commento SSE
      if (line.startsWith('data:')) data.push(line.slice(line.startsWith('data: ') ? 6 : 5));
      return undefined;
    };

    const reader = res.body.getReader();
    try {
      while (!done) {
        const { value, done: ended } = await reader.read();
        if (ended) break;
        buffer += decoder.decode(value, { stream: true });
        let newline;
        while (!done && (newline = buffer.indexOf('\n')) >= 0) {
          handleLine(buffer.slice(0, newline).replace(/\r$/, ''));
          buffer = buffer.slice(newline + 1);
        }
      }
      if (!done) {
        buffer += decoder.decode();
        if (buffer) handleLine(buffer.replace(/\r$/, ''));
        dispatch();
      }
    } finally {
      reader.cancel().catch(() => {});
    }
    return finalize(state);
  }

  /**
   * @param {Array<object>} messages
   * @param {{signal?: AbortSignal, onProgress?: (p: {chars: number}) => void}} [opts]
   * @returns {Promise<{content: string, finishReason: string|null, model: string, usage: object|null}>}
   */
  async function generate(messages, opts = {}) {
    // Con modelli di riserva si usa il parametro "models" di OpenRouter (fallback automatico, in ordine).
    const body = fallbackModels.length
      ? { models: [model, ...fallbackModels], messages, max_tokens: maxTokens, stream: true }
      : { model, messages, max_tokens: maxTokens, stream: true };
    if (typeof temperature === 'number') body.temperature = temperature;

    // Due limiti: tempo totale e inattività (nessun token per idleMs). I commenti di keep-alive non contano.
    const controller = new AbortController();
    let timeoutKind = null;
    let receivedChars = 0;
    let idleTimer = null;
    const totalTimer = setTimeout(() => {
      timeoutKind = 'total';
      controller.abort();
    }, timeoutMs);
    const armIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        timeoutKind = receivedChars ? 'idle' : 'start';
        controller.abort();
      }, idleMs);
    };
    const onClientAbort = () => controller.abort();
    if (opts.signal) {
      if (opts.signal.aborted) controller.abort();
      else opts.signal.addEventListener('abort', onClientAbort, { once: true });
    }
    armIdle();

    try {
      const res = await fetchImpl(`${root}/chat/completions`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const type = res.headers.get('content-type') || '';
      if (res.ok && type.includes('text/event-stream')) {
        return await readEventStream(res, (chars) => {
          receivedChars += chars;
          armIdle();
          if (typeof opts.onProgress === 'function') opts.onProgress({ chars: receivedChars });
        });
      }
      const text = await res.text();
      let json;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (!res.ok) {
        const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
        throw mapOpenRouterError(res.status, json && json.error, retryAfter, readRateLimit(res.headers));
      }
      return parseCompletionJson(json, res);
    } catch (err) {
      if (err instanceof UpstreamError) throw err;
      if (opts.signal && opts.signal.aborted) {
        throw new UpstreamError('CLIENT_CLOSED', 'Richiesta annullata dal client.', { status: 499 });
      }
      if (timeoutKind || isAbortError(err)) throw timeoutError(timeoutKind);
      throw new UpstreamError('UPSTREAM_UNREACHABLE', 'Impossibile contattare OpenRouter: verifica la connessione del server.');
    } finally {
      clearTimeout(totalTimer);
      clearTimeout(idleTimer);
      if (opts.signal) opts.signal.removeEventListener('abort', onClientAbort);
    }
  }

  function timeoutError(kind) {
    const idleS = Math.round(idleMs / 1000);
    const totalS = Math.round(timeoutMs / 1000);
    const messages = {
      start: `Il modello non ha iniziato a rispondere entro ${idleS} s (fornitore in coda o lento). Riprova o scegli un modello più veloce.`,
      idle: `Il modello si è fermato per ${idleS} s durante la risposta. Riprova.`,
      total: `La risposta ha superato il tempo massimo di ${totalS} s. Riprova o scegli un modello più veloce.`,
    };
    return new UpstreamError('UPSTREAM_TIMEOUT', messages[kind] || messages.total, { status: 504 });
  }

  return { getImageSupport, generate, model };
}

module.exports = {
  createOpenRouterClient,
  UpstreamError,
  mapOpenRouterError,
  errorDetail,
  parseRetryAfter,
  parseRateLimitReset,
  DEFAULT_BASE_URL,
};
