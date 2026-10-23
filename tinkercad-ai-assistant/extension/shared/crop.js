/*
 * Calcolo del ritaglio dello screenshot: converte il rettangolo del circuito
 * (in pixel CSS della viewport) in pixel dell'immagine catturata.
 * La scala viene ricavata dal rapporto immagine/viewport, quindi gestisce
 * devicePixelRatio e zoom del browser senza ipotesi.
 *
 * Modulo UMD: service worker (importScripts) e Node (test).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.TCAI = Object.assign(root.TCAI || {}, api);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MIN_CROP = Object.freeze({ width: 200, height: 150 });
  const MAX_SCALE_MISMATCH = 0.03;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function isFiniteRect(rect) {
    return (
      rect &&
      ['x', 'y', 'width', 'height'].every((k) => typeof rect[k] === 'number' && Number.isFinite(rect[k])) &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  /**
   * @param {number} imageWidth larghezza dell'immagine catturata (pixel dispositivo)
   * @param {number} imageHeight
   * @param {{x:number,y:number,width:number,height:number}|null} rect area del circuito in pixel CSS
   * @param {{width:number,height:number}|null} viewport dimensioni della viewport in pixel CSS
   * @returns {{sx:number, sy:number, sw:number, sh:number, cropped:boolean}}
   */
  function computeCrop(imageWidth, imageHeight, rect, viewport) {
    const full = { sx: 0, sy: 0, sw: imageWidth, sh: imageHeight, cropped: false };
    if (!isFiniteRect(rect) || !viewport || !(viewport.width > 0) || !(viewport.height > 0)) return full;

    const scaleX = imageWidth / viewport.width;
    const scaleY = imageHeight / viewport.height;
    // Se i rapporti non coincidono la viewport misurata non corrisponde all'immagine: niente ritaglio.
    if (Math.abs(scaleX - scaleY) / Math.max(scaleX, scaleY) > MAX_SCALE_MISMATCH) return full;

    const x0 = clamp(rect.x, 0, viewport.width);
    const y0 = clamp(rect.y, 0, viewport.height);
    const x1 = clamp(rect.x + rect.width, 0, viewport.width);
    const y1 = clamp(rect.y + rect.height, 0, viewport.height);
    if (x1 - x0 < MIN_CROP.width || y1 - y0 < MIN_CROP.height) return full;
    if (x0 === 0 && y0 === 0 && x1 === viewport.width && y1 === viewport.height) return full;

    const sx = Math.round(x0 * scaleX);
    const sy = Math.round(y0 * scaleY);
    const sw = Math.min(imageWidth - sx, Math.round((x1 - x0) * scaleX));
    const sh = Math.min(imageHeight - sy, Math.round((y1 - y0) * scaleY));
    return { sx, sy, sw, sh, cropped: true };
  }

  /** Dimensioni finali rispettando il lato massimo indicato. */
  function fitWithin(width, height, maxSide) {
    const scale = Math.min(1, maxSide / Math.max(width, height));
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
  }

  return { computeCrop, fitWithin, MIN_CROP };
});
