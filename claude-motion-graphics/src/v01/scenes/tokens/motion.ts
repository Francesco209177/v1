import {clamp, ease, hash, invLerp, lerp} from '../../../lib/math';
import {CENTER, CW, ROW_Y, ROW_YP, SLOTS, T} from './layout';

/**
 * Trasformazione dello strato dei token (attorno a CENTER): la frase arriva dalla profondità (prosecuzione
 * del tuffo), poi galleggia con una deriva lenta; piccola anticipazione prima del volo nella rete.
 */
export const layerXf = (abs: number): {s: number; dx: number; dy: number} => {
	const arrive = ease.outCubic(invLerp(T.start, T.settle + 2, abs));
	const push = 0.035 * ease.inOutSine(invLerp(T.settle, 216, abs));
	const ant = -0.03 * ease.inOutSine(invLerp(214, T.intoNet, abs));
	const tt = abs - T.start;
	return {
		s: lerp(0.56, 1, arrive) + push + ant,
		dx: 4 * Math.sin(tt / 53),
		dy: 7 * Math.sin(tt / 37) - 26 * (1 - arrive) - 14 * Math.sin(Math.PI * invLerp(212, 230, abs)),
	};
};

export type Pt = {x: number; y: number};
export const toScreen = (abs: number, p: Pt): Pt => {
	const L = layerXf(abs);
	return {x: CENTER.x + (p.x - CENTER.x) * L.s + L.dx, y: CENTER.y + (p.y - CENTER.y) * L.s + L.dy};
};
export const toLayer = (abs: number, p: Pt): Pt => {
	const L = layerXf(abs);
	return {x: CENTER.x + (p.x - L.dx - CENTER.x) / L.s, y: CENTER.y + (p.y - L.dy - CENTER.y) / L.s};
};

/** Ordine di lettura = indice del token. */
export const popAt = (i: number): number => T.split + Math.round(i * 1.4);

/** Separazione dei pezzi (0 = frase intera, 1 = blocchi distanziati): scatto netto sul cue 180. */
export const splitP = (abs: number): number => ease.outExpo(clamp((abs - (T.split - 1)) / 10));

/** Posizione (strato) del token i prima del volo nella rete. */
export const slotPos = (i: number, abs: number): Pt & {rot: number} => {
	const s = SLOTS[i];
	const p = splitP(abs);
	const kick = Math.sin(Math.PI * clamp(p * 1.15));
	return {
		x: lerp(s.px, s.sx, p),
		y: lerp(s.py, s.y, ease.outCubic(clamp((abs - (T.split - 1)) / 12))) + (hash(i, 31) - 0.5) * 18 * kick,
		rot: (hash(i, 32) - 0.5) * 6 * kick,
	};
};

/** Centro (strato) del carattere j del token i quando la frase è intera. */
export const charX = (i: number, j: number): number => {
	const s = SLOTS[i];
	return s.px - (s.text.length * CW) / 2 + (j + 0.5) * CW;
};

/** Istante di comparsa (ricomposizione) di ogni carattere: sparso, come pixel che tornano al loro posto. */
export const charAt = (i: number, j: number): number => T.start + 2 + hash(i * 17 + j, 53) * 14;

/** y della riga r con la frase che si apre in verticale allo split. */
export const rowY = (r: number, abs: number): number => lerp(ROW_YP[r], ROW_Y[r], ease.outCubic(clamp((abs - (T.split - 1)) / 12)));

/** Posizione del raggio di scansione (x) e sua intensità. */
export const scanBeam = (abs: number): {x: number; a: number} => {
	const t = invLerp(T.scan, T.split - 1, abs);
	return {x: lerp(40, 1040, ease.inOutSine(t)), a: Math.sin(Math.PI * clamp(t)) * (abs < T.split ? 1 : 0)};
};

/** Partenza del volo verso la rete per il token i (in fila, in ordine di lettura). */
export const departAt = (i: number): number => T.intoNet + i * 0.9;
export const FLIGHT = 10;
