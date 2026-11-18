import {Vec2} from '../../lib/math';
import {HOME} from './timing';

/** Grafico "spring()": box locale centrato sull'origine dell'elemento. */
export const CURVE_BOX = {w: 264, h: 176} as const;
const PAD = 16;
const RISE = 98; // px corrispondenti al valore 1 (linea di assestamento)

/** Risposta di una molla smorzata: parte da 0, supera 1 (overshoot) e si assesta. */
export const springValue = (u: number): number => 1 - Math.exp(-5 * u) * Math.cos(11 * u);

/** Punto della curva in coordinate locali dell'elemento (u = 0..1 lungo l'asse del tempo). */
export const curveLocal = (u: number): Vec2 => ({
	x: -CURVE_BOX.w / 2 + PAD + u * (CURVE_BOX.w - PAD * 2),
	y: CURVE_BOX.h / 2 - PAD - springValue(u) * RISE,
});

/** Y locale della linea "valore finale" e dell'asse X. */
export const CURVE_TARGET_Y = CURVE_BOX.h / 2 - PAD - RISE;
export const CURVE_AXIS = {
	x0: -CURVE_BOX.w / 2 + PAD,
	x1: CURVE_BOX.w / 2 - PAD,
	y0: CURVE_BOX.h / 2 - PAD,
	y1: -CURVE_BOX.h / 2 + 4,
} as const;

/** Stesso punto in coordinate schermo quando l'elemento è a casa (fase B, scala 1). */
export const curveWorld = (u: number): Vec2 => {
	const p = curveLocal(u);
	return {x: HOME.C.x + p.x, y: HOME.C.y + p.y};
};

/** Path SVG della curva campionata. */
export const curvePath = (samples = 72): string => {
	let d = '';
	for (let i = 0; i <= samples; i++) {
		const p = curveLocal(i / samples);
		d += `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
	}
	return d;
};
