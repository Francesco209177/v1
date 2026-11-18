/**
 * Scena 4 — palco condiviso della sequenza di esempi.
 * Ogni shot disegna in coordinate assolute 1080x1920, centrato sul palco:
 * fascia verticale y 430..1190 a tutta larghezza. Sopra vive lo spark (y≈330), sotto la caption (y≈1350).
 */
export const STAGE = {x: 0, y: 430, w: 1080, h: 760, cx: 540, cy: 810} as const;

/** Shot della scena 4 (frame relativi alla scena; assoluti = 480 + start). Tagli sui beat: 3+3+3+3+4. */
export const SHOTS = [
	{id: 'Shot1', start: 0, len: 45, label: 'TESTI CINETICI'},
	{id: 'Shot2', start: 45, len: 45, label: 'TRANSIZIONI DINAMICHE'},
	{id: 'Shot3', start: 90, len: 45, label: 'OGGETTI 3D'},
	{id: 'Shot4', start: 135, len: 45, label: 'EFFETTI LUMINOSI'},
	{id: 'Shot5', start: 180, len: 60, label: 'ANIMAZIONI COMPLESSE'},
] as const;
