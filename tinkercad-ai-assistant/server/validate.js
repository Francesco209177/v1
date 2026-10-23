'use strict';

/*
 * Validazione del corpo di POST /api/generate.
 * Tutti i campi provengono dal browser e sono trattati come non attendibili.
 */

const LIMITS = Object.freeze({
  promptMax: 4000,
  codeMax: 20000,
  editorModeMax: 40,
  deviceMax: 80,
  componentsMax: 100,
  componentTypeMax: 60,
  componentCountMax: 999,
});

const ALLOWED_KEYS = new Set(['prompt', 'image', 'currentCode', 'editorMode', 'device', 'components', 'cropped']);
const DATA_URL_RE = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

function fail(message) {
  return { ok: false, message };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasImageSignature(mime, base64) {
  const head = Buffer.from(base64.slice(0, 24), 'base64');
  if (mime === 'png') return head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === 'jpeg') return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  if (mime === 'webp') return head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP';
  return false;
}

function optionalString(body, key, max) {
  const value = body[key];
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return fail(`Il campo "${key}" deve essere una stringa.`);
  if (value.length > max) return fail(`Il campo "${key}" supera ${max} caratteri.`);
  return { ok: true, value };
}

/**
 * @param {unknown} body
 * @param {{maxImageChars: number}} options
 */
function validateGenerateRequest(body, options) {
  if (!isPlainObject(body)) return fail('Il corpo della richiesta deve essere un oggetto JSON.');

  for (const key of Object.keys(body)) {
    if (!ALLOWED_KEYS.has(key)) return fail(`Campo non previsto: "${key}".`);
  }

  if (typeof body.prompt !== 'string') return fail('Il campo "prompt" è obbligatorio.');
  const prompt = body.prompt.trim();
  if (!prompt) return fail('Scrivi una richiesta prima di generare il codice.');
  if (prompt.length > LIMITS.promptMax) return fail(`La richiesta supera ${LIMITS.promptMax} caratteri.`);

  let image = null;
  if (body.image !== undefined && body.image !== null) {
    if (typeof body.image !== 'string') return fail('Il campo "image" deve essere un data URL.');
    if (body.image.length > options.maxImageChars) return fail('Lo screenshot è troppo grande.');
    const match = DATA_URL_RE.exec(body.image);
    if (!match) return fail('Lo screenshot deve essere un data URL PNG, JPEG o WebP in base64.');
    if (!hasImageSignature(match[1], match[2])) return fail('Il contenuto dello screenshot non corrisponde al formato dichiarato.');
    image = body.image;
  }

  const code = optionalString(body, 'currentCode', LIMITS.codeMax);
  if (!code.ok) return code;
  const editorMode = optionalString(body, 'editorMode', LIMITS.editorModeMax);
  if (!editorMode.ok) return editorMode;
  const device = optionalString(body, 'device', LIMITS.deviceMax);
  if (!device.ok) return device;

  let components = [];
  if (body.components !== undefined && body.components !== null) {
    if (!Array.isArray(body.components)) return fail('Il campo "components" deve essere un array.');
    if (body.components.length > LIMITS.componentsMax) return fail(`Troppi componenti (massimo ${LIMITS.componentsMax}).`);
    for (const item of body.components) {
      if (!isPlainObject(item)) return fail('Ogni componente deve essere un oggetto { type, count }.');
      const { type, count } = item;
      if (typeof type !== 'string' || !/^[a-z0-9][a-z0-9-]*$/i.test(type) || type.length > LIMITS.componentTypeMax) {
        return fail('Tipo di componente non valido.');
      }
      if (!Number.isInteger(count) || count < 1 || count > LIMITS.componentCountMax) {
        return fail('Quantità di componente non valida.');
      }
    }
    components = body.components.map(({ type, count }) => ({ type: type.toLowerCase(), count }));
  }

  if (body.cropped !== undefined && body.cropped !== null && typeof body.cropped !== 'boolean') {
    return fail('Il campo "cropped" deve essere booleano.');
  }

  return {
    ok: true,
    value: {
      prompt,
      image,
      currentCode: code.value && code.value.trim() ? code.value : null,
      editorMode: editorMode.value ? editorMode.value.trim() : null,
      device: device.value ? device.value.trim() : null,
      components,
      cropped: body.cropped === true,
    },
  };
}

module.exports = { validateGenerateRequest, LIMITS };
