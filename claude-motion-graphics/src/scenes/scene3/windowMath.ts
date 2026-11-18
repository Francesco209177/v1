import {ease, invLerp, Vec2} from '../../lib/math';
import {WINDOW_RECT} from '../../timeline';
import {T} from './timing';

/** Distanza prospettica usata per inclinare la finestra (px). */
export const PERSPECTIVE = 1700;

export type WindowState = {r: number; scale: number; tilt: number; ty: number; opacity: number; blur: number};

/** La finestra arretra: rimpicciolisce, si inclina all'indietro, scende e va fuori fuoco. */
export const windowState = (f: number): WindowState => {
	const r = ease.outQuad(invLerp(T.recedeStart, T.recedeEnd, f));
	return {r, scale: 1 - 0.17 * r, tilt: 24 * r, ty: 44 * r, opacity: 1 - 0.56 * r, blur: 3 * r};
};

/** transform CSS equivalente a windowState (origine = centro della finestra). */
export const windowTransform = (s: WindowState): string =>
	`perspective(${PERSPECTIVE}px) translateY(${s.ty}px) scale(${s.scale}) rotateX(${s.tilt}deg)`;

/**
 * Proietta un punto locale della finestra (px dall'angolo alto-sinistra) sullo schermo,
 * replicando la stessa catena di trasformazioni CSS: serve per staccare i token esattamente
 * da dove si trovano. `k` = scala locale risultante, `squash` = compressione verticale da tilt.
 */
export const projectWindow = (f: number, lx: number, ly: number): Vec2 & {k: number; squash: number} => {
	const s = windowState(f);
	const cx = WINDOW_RECT.x + WINDOW_RECT.w / 2;
	const cy = WINDOW_RECT.y + WINDOW_RECT.h / 2;
	const dx = lx - WINDOW_RECT.w / 2;
	const dy = ly - WINDOW_RECT.h / 2;
	const th = (s.tilt * Math.PI) / 180;
	const z = dy * Math.sin(th); // rotateX: il bordo alto si allontana (z < 0)
	const p = PERSPECTIVE / (PERSPECTIVE - z);
	return {
		x: cx + s.scale * dx * p,
		y: cy + (s.scale * dy * Math.cos(th) + s.ty) * p,
		k: s.scale * p,
		squash: Math.cos(th),
	};
};

/** X (schermo) del fronte della spazzata di luce che cancella la finestra. */
export const sweepX = (f: number): number => -340 + 1760 * ease.inOutSine(invLerp(T.sweepStart, T.sweepEnd, f));
