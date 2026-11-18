import {beatPulse, clamp, ease, invLerp, TAU} from '../../lib/math';
import {SPARK_CENTER, SPARK_VIEWBOX} from '../../lib/spark';
import {CUES, SCENES, SPARK_POSE} from '../../timeline';

/** Posa dello spark per tutta la scena = posa di confine con la scena 2. */
export const POSE = SPARK_POSE.introEnd;

/** Mozzo dello spark in px: origine di scala di ClaudeSpark e centro di tutti gli effetti. */
export const HUB = {
	x: POSE.x + (SPARK_CENTER.x / SPARK_VIEWBOX - 0.5) * POSE.size,
	y: POSE.y + (SPARK_CENTER.y / SPARK_VIEWBOX - 0.5) * POSE.size,
} as const;

/** Tempi chiave della scena (frame locali; la scena parte da 0 quindi coincidono con gli assoluti). */
export const T = {
	coverHold: 8, //      nero pieno fino a qui
	coverGone: 60, //     poi la stanza si accende
	implode: 59, //       anticipazione: archi di luce che si chiudono verso il simbolo
	handoff: 66, //       lo spark solido comincia ad affiorare sotto le particelle
	formed: CUES.sparkFormed - SCENES.intro.start, // 75 · IMPATTO (cue musicale)
	swarmGone: 80, //     ultime particelle fuse nel simbolo solido
	extrasOut: 101, //    orbite e raggi cominciano a rientrare
	extrasGone: 116, //   da qui resta solo lo spark
	titleIn: 26,
	titleOut: 106,
} as const;

/** smoothstep con clamp. */
export const smooth = (t: number): number => {
	const x = clamp(t);
	return x * x * (3 - 2 * x);
};

/** Stesso "respiro" sul beat di ClaudeSpark: le particelle agganciate restano a registro col simbolo. */
export const sparkBreath = (abs: number): number =>
	1 + 0.022 * beatPulse(abs, 4.5) + 0.006 * Math.sin((abs / 90) * TAU);

/**
 * Scala dello spark attorno al mozzo: anticipazione (si contrae) prima dell'impatto,
 * poi colpo con un solo rimbalzo smorzato. Vale ESATTAMENTE 1 da formed+24 in poi.
 */
export const sparkPop = (f: number): number => {
	const t = f - T.formed;
	if (t < 0) return 1 - 0.045 * ease.inOutSine(invLerp(T.formed - 10, T.formed - 1, f));
	const spring = 0.085 * Math.exp(-t / 4.6) * Math.cos(t * 0.52);
	return 1 + spring * (1 - smooth((t - 12) / 12));
};

/** Lampo dell'impatto: breve pre-rampa, picco 1 sul cue, decadimento; 0 esatto da formed+24. */
export const flash = (f: number): number => {
	const t = f - T.formed;
	if (t < 0) return 0.28 * clamp(1 + t / 4) ** 2;
	return Math.exp(-t / 4.2) * (1 - smooth((t - 14) / 10));
};

/** Flare anamorfico: stesso attacco del lampo ma coda molto più corta (niente "filo" residuo sullo spark). */
export const flare = (f: number): number => {
	const t = f - T.formed;
	if (t < 0) return 0.28 * clamp(1 + t / 4) ** 2;
	return Math.exp(-t / 2.3) * (1 - smooth((t - 6) / 6));
};

/** Carica prima dell'impatto: 0 → 1 mentre l'energia si raccoglie (da implode al cue). */
export const charge = (f: number): number => smooth((f - T.implode) / (T.formed - T.implode));

/** "Calore" del simbolo (bianco-arancio) che si raffredda dopo l'impatto. */
export const heat = (f: number): number => {
	const t = f - T.formed;
	if (t < 0) return 0.45 * clamp(1 + t / 4) ** 2;
	return Math.exp(-t / 5.5) * (1 - smooth((t - 14) / 10));
};

/** Camera: lenta spinta in avanti, micro arretramento di anticipo, punch 1.045 sul cue che torna a 1. */
export const cameraScale = (f: number): number => {
	const t = f - T.formed;
	if (t >= 0) return 1 + 0.045 * (1 - ease.outExpo(clamp(t / 20)));
	return 1 + 0.012 * ease.inOutSine(invLerp(8, 62, f)) * (1 - ease.inOutSine(invLerp(64, T.formed - 1, f)));
};

/** Piccola scossa verticale della camera dopo l'impatto (px), nulla prima e dopo ~12 frame. */
export const cameraShake = (f: number): number => {
	const t = f - T.formed;
	if (t <= 0 || t >= 12) return 0;
	return 5 * Math.exp(-t / 3.2) * Math.sin(t * 1.9) * (1 - smooth((t - 6) / 6));
};

/** Inviluppo degli extra post-impatto (orbite, raggi): 0 prima del cue, 1, poi 0 entro extrasGone. */
export const extrasOut = (f: number, stagger = 0): number =>
	ease.inOutSine(invLerp(T.extrasOut + stagger, T.extrasGone - 4 + stagger, f));
