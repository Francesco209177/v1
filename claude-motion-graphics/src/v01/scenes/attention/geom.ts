import {clamp, lerp, Vec2} from '../../../lib/math';
import {COLORS} from '../../../theme';
import {ROW_OF} from './data';
import {CH, CHIP_W, slot} from './layout';

export type Cubic = [Vec2, Vec2, Vec2, Vec2];

/** Punto su una Bézier cubica. */
export const cubicAt = (c: Cubic, t: number): Vec2 => {
	const u = 1 - t;
	const a = u * u * u;
	const b = 3 * u * u * t;
	const d = 3 * u * t * t;
	const e = t * t * t;
	return {x: a * c[0].x + b * c[1].x + d * c[2].x + e * c[3].x, y: a * c[0].y + b * c[1].y + d * c[2].y + e * c[3].y};
};

/** Bordo superiore / inferiore (sotto la striscia del vettore) del chip. */
export const chipTop = (y: number): number => y - CH / 2 - 3;
export const chipBottom = (y: number): number => y + CH / 2 + 15;

/**
 * Arco di attenzione dal token q (che "guarda") al token k.
 * Stessa riga: arco sopra la riga, più alto quanto più i token sono lontani.
 * Riga diversa (q sotto, k sopra): curva a S nello spazio tra le due righe.
 */
export const arcGeom = (f: number, q: number, k: number): Cubic => {
	const Q = slot(f, q);
	const K = slot(f, k);
	const spread = clamp((K.x - Q.x) * 0.07, -CHIP_W[q] * 0.3, CHIP_W[q] * 0.3);
	const p0 = {x: Q.x + spread, y: chipTop(Q.y)};
	if (ROW_OF[q] === ROW_OF[k]) {
		const p3 = {x: K.x, y: chipTop(K.y)};
		const H = 30 + 0.35 * Math.abs(K.x - Q.x);
		return [p0, {x: lerp(p0.x, p3.x, 0.05), y: p0.y - H}, {x: lerp(p3.x, p0.x, 0.05), y: p3.y - H}, p3];
	}
	const p3 = {x: K.x, y: chipBottom(K.y)};
	const dy = p0.y - p3.y;
	return [p0, {x: p0.x, y: p0.y - 0.55 * dy}, {x: p3.x, y: p3.y + 0.55 * dy}, p3];
};

/** Colore "di calore" per un valore in [-1, 1]: arancione profondo → arancione → nucleo chiaro. */
const hex = (h: string): number[] => {
	const n = parseInt(h.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const DEEP = hex(COLORS.orangeDeep);
const MID = hex(COLORS.orange);
const HOT = hex(COLORS.orangeHot);
export const heatColor = (v: number, a = 1): string => {
	const t = clamp((v + 1) / 2);
	const [A, B, u] = t < 0.5 ? [DEEP, MID, t / 0.5] : [MID, HOT, (t - 0.5) / 0.5];
	const c = A.map((x, i) => Math.round(lerp(x, B[i], u)));
	return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
};
