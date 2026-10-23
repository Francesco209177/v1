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

function shorten(text, max = 300) {
  if (typeof text !== 'string') return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max) + '…' : clean;
}

/** Converte un errore OpenRouter ({code, message, metadata}) in UpstreamError. */
function mapOpenRouterError(status, error, retryAfter) {
  const detail = shorten(error && error.message);
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
    case 429:
      return new UpstreamError(
        'RATE_LIMITED',
        `Troppe richieste a OpenRouter${retryAfter ? `: riprova tra ${retryAfter} s` : ': riprova tra poco'}.`,
        { status: 429, retryAfter }
      );
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
 * @param {number} options.timeoutMs
 * @param {number} options.maxTokens
 * @param {number} [options.temperature]
 * @param {string} [options.appUrl]
 * @param {string} [options.appTitle]
 * @param {typeof fetch} [options.fetchImpl]
 */
function createOpenRouterClient(options) {
  const {
    apiKey,
    model,
    baseUrl = DEFAULT_BASE_URL,
    timeoutMs,
    maxTokens,
    temperature,
    appUrl,
    appTitle,
    fetchImpl = globalThis.fetch,
  } = options;
  const root = baseUrl.replace(/\/+$/, '');
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

  /**
   * @param {Array<object>} messages
   * @param {{signal?: AbortSignal}} [opts]
   * @returns {Promise<{content: string, finishReason: string|null, model: string, usage: object|null}>}
   */
  async function generate(messages, opts = {}) {
    const body = { model, messages, max_tokens: maxTokens };
    if (typeof temperature === 'number') body.temperature = temperature;

    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = opts.signal ? AbortSignal.any([timeoutSignal, opts.signal]) : timeoutSignal;

    let res;
    let text;
    try {
      res = await fetchImpl(`${root}/chat/completions`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body),
        signal,
      });
      text = await res.text();
    } catch (err) {
      if (opts.signal && opts.signal.aborted) {
        throw new UpstreamError('CLIENT_CLOSED', 'Richiesta annullata dal client.', { status: 499 });
      }
      if (isAbortError(err)) {
        throw new UpstreamError(
          'UPSTREAM_TIMEOUT',
          `OpenRouter non ha risposto entro ${Math.round(timeoutMs / 1000)} s. Riprova o scegli un modello più veloce.`,
          { status: 504 }
        );
      }
      throw new UpstreamError('UPSTREAM_UNREACHABLE', 'Impossibile contattare OpenRouter: verifica la connessione del server.');
    }

    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!res.ok) {
      const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
      throw mapOpenRouterError(res.status, json && json.error, retryAfter);
    }
    if (!json || typeof json !== 'object') {
      throw new UpstreamError('INVALID_RESPONSE', 'OpenRouter ha restituito una risposta non valida.');
    }
    // Errori emessi durante la generazione possono arrivare con HTTP 200.
    if (json.error) {
      const status = Number(json.error.code) || 502;
      throw mapOpenRouterError(status, json.error, parseRetryAfter(res.headers.get('retry-after')));
    }

    const choice = Array.isArray(json.choices) ? json.choices[0] : null;
    if (!choice || !choice.message) {
      throw new UpstreamError('INVALID_RESPONSE', 'La risposta di OpenRouter non contiene alcun messaggio.');
    }
    if (choice.error) {
      throw new UpstreamError('UPSTREAM_ERROR', `Errore durante la generazione: ${shorten(choice.error.message) || 'sconosciuto'}.`);
    }
    const finishReason = choice.finish_reason || choice.native_finish_reason || null;
    if (finishReason === 'error') {
      throw new UpstreamError('UPSTREAM_ERROR', 'Il modello ha interrotto la generazione con un errore. Riprova.');
    }
    const content = contentToText(choice.message.content);
    if (content === null || !content.trim()) {
      throw new UpstreamError(
        'EMPTY_RESPONSE',
        finishReason === 'length'
          ? 'Il modello ha esaurito i token prima di rispondere: aumenta OPENROUTER_MAX_TOKENS o scegli un altro modello.'
          : 'Il modello ha restituito una risposta vuota. Riprova.'
      );
    }

    const usage = json.usage
      ? {
          prompt_tokens: json.usage.prompt_tokens,
          completion_tokens: json.usage.completion_tokens,
          total_tokens: json.usage.total_tokens,
        }
      : null;

    return { content, finishReason, model: typeof json.model === 'string' ? json.model : model, usage };
  }

  return { getImageSupport, generate, model };
}

module.exports = { createOpenRouterClient, UpstreamError, mapOpenRouterError, parseRetryAfter, DEFAULT_BASE_URL };
