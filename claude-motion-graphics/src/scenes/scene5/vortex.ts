import {clamp, Vec2} from '../../lib/math';
import {HEIGHT, WIDTH} from '../../timeline';
import {hubAt, smooth} from './motion';

/**
 * VORTICE — traiettoria in forma chiusa di tutto ciò che rientra nello spark.
 * Ogni elemento nasce fuori quadro (su un punto del perimetro) e percorre una spirale
 * attorno al mozzo: il raggio si chiude accelerando, l'angolo ruota in senso orario.
 */
export type Flight = {
	t0: number; // frame di ingresso (fuori quadro)
	t1: number; // frame di assorbimento (raggio 0)
	a0: number; // angolo iniziale rispetto al mozzo
	r0: number; // raggio iniziale (px)
	swirl: number; // rotazione totale lungo il volo (rad, orario)
};

export type FlightState = Vec2 & {
	u: number; // avanzamento 0..1
	r: number; // distanza dal mozzo (px)
	near: number; // 1 lontano dallo spark → 0 quando entra nel corpo del simbolo
};

/** Punto sul perimetro del quadro allargato di `margin` px; s in [0,1) percorre top → destra → fondo → sinistra. */
export const perimeterPoint = (s: number, margin: number): Vec2 => {
	const w = WIDTH + margin * 2;
	const h = HEIGHT + margin * 2;
	const p = (((s % 1) + 1) % 1) * 2 * (w + h);
	if (p < w) return {x: -margin + p, y: -margin};
	if (p < w + h) return {x: WIDTH + margin, y: -margin + (p - w)};
	if (p < 2 * w + h) return {x: WIDTH + margin - (p - w - h), y: HEIGHT + margin};
	return {x: -margin, y: HEIGHT + margin - (p - 2 * w - h)};
};

export const makeFlight = (s: number, margin: number, t0: number, t1: number, swirl: number): Flight => {
	const hub = hubAt(t0);
	const p = perimeterPoint(s, margin);
	const dx = p.x - hub.x;
	const dy = p.y - hub.y;
	return {t0, t1, a0: Math.atan2(dy, dx), r0: Math.hypot(dx, dy), swirl};
};

/** Frazione di raggio residua: parte con velocità non nulla, poi accelera (colpo di frusta finale). */
const radial = (u: number): number => 1 - (0.4 * u + 0.6 * u * u * u);
/** L'angolo ruota sempre più in fretta man mano che il raggio si chiude. */
const angular = (u: number): number => Math.pow(u, 1.5);

/** Stato dell'elemento al frame `f` (anche frazionario: serve al motion blur e alle scie). */
export const flightAt = (fl: Flight, f: number): FlightState => {
	const u = clamp((f - fl.t0) / (fl.t1 - fl.t0));
	const hub = hubAt(f);
	const r = fl.r0 * radial(u);
	const a = fl.a0 + fl.swirl * angular(u);
	return {
		x: hub.x + r * Math.cos(a),
		y: hub.y + r * Math.sin(a),
		u,
		r,
		near: smooth((r - hub.size * 0.1) / (hub.size * 0.42)),
	};
};
