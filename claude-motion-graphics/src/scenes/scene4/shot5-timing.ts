import {clamp, ease, hit, invLerp} from '../../lib/math';

/**
 * SHOT 5 — tempi (frame locali 0..59; assoluti = 660 + locale).
 * Quattro beat (0, 15, 30, 45): su ognuno una nuova forma ARRIVA esattamente sul colpo.
 *   0  eruzione → ORBITE      15  → RETICOLO ESAGONALE      30  → ONDA      45  → SPARK
 *   50 → 59  esplosione verso l'esterno (la scena 5 richiama tutto dai bordi).
 */
export const T = {
	eruptDur: 5, //   l'eruzione iniziale si chiude in ~4 frame
	morph: 9, //      durata complessiva di ogni morph: finisce ESATTAMENTE sul beat
	stagger: 3.5, //  sfasamento massimo tra particelle (onda di trasformazione)
	toHex: 15,
	toWave: 30,
	toSpark: 45,
	squeeze: 46.5, // anticipazione: lo spark si contrae prima di esplodere
	burst: 50,
	end: 59,
} as const;

export const BEATS = [0, 15, 30, 45] as const;

/** smoothstep con clamp. */
export const smooth = (t: number): number => {
	const x = clamp(t);
	return x * x * (3 - 2 * x);
};

/**
 * Progresso 0..1 di un morph che termina su `beat`.
 * `delay` (0..1) sfasa la particella: le ultime arrivano esattamente sul beat.
 */
export const morphProgress = (t: number, beat: number, delay: number): number =>
	ease.inOutCubic(clamp((t - (beat - T.morph) - delay * T.stagger) / (T.morph - T.stagger)));

/** Colpo di luce sui beat (1 sul frame del beat, poi decade). */
export const beatFlash = (t: number): number => {
	let k = 0;
	for (const b of BEATS) k = Math.max(k, hit(t, b, 6));
	return k;
};

/** Impulso con rincorsa: sale in `pre` frame fino a 1 esattamente su `at`, poi decade in ~`length` frame. */
export const swing = (t: number, at: number, pre: number, length: number): number =>
	t < at ? ease.inCubic(clamp(1 - (at - t) / pre)) : Math.exp(-((t - at) / length) * 4);

/** Camera dello shot: leggera deriva continua + "frustata" di rotazione che culmina sul beat e si assesta. */
export type Camera = {yaw: number; pitch: number; roll: number; scale: number};

export const cameraAt = (t: number): Camera => {
	const punch = 0.07 * (swing(t, T.toHex, 2, 6) + swing(t, T.toWave, 2, 6) + swing(t, T.toSpark, 2, 5));
	// anticipazione prima dell'esplosione: contrazione, poi rilascio immediato
	const squeeze =
		t <= T.burst
			? 0.085 * ease.inOutSine(invLerp(T.squeeze, T.burst, t))
			: 0.085 * (1 - ease.outCubic(invLerp(T.burst, T.burst + 2, t)));
	return {
		yaw:
			0.09 * Math.sin(t * 0.21 + 1) +
			0.34 * swing(t, T.toHex, 4, 8) -
			0.2 * swing(t, T.toWave, 4, 9) +
			0.2 * swing(t, T.toSpark, 3, 6),
		pitch: 0.06 * Math.cos(t * 0.17) - 0.15 * swing(t, T.toHex, 4, 8) + 0.07 * swing(t, T.toWave, 4, 9),
		roll: -0.1 * swing(t, T.toHex, 4, 8),
		scale: 1 + punch - squeeze,
	};
};
