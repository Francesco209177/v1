import {clamp, ease, envelope, hit, lerp, prog, tween} from '../../../lib/math';
import {V2_NET_AT_270} from '../../timeline';

/**
 * Tempi della scena HOW (frame LOCALI; assoluto = locale + 270). Beat locali: multipli di 15.
 * Atti: pull-back → caricamento (SSD → RAM) → elaborazione (CPU/GPU) → risposta (150) → nota hardware → collasso.
 */
export const T = {
	pullEnd: 36, //       la camera si allontana: la rete diventa il cuore del diagramma
	popTop: 15, //        SSD + RAM (beat)
	popBottom: 30, //     CPU + GPU (beat)
	loadStart: 40, //     i pesi fluiscono dall'SSD alla RAM
	loadBeat: 45,
	loadEnd: 105, //      modello caricato (beat)
	promptIn: 104, //     arriva la richiesta
	promptSend: 120, //   la richiesta entra nella rete, CPU/GPU si accendono (beat)
	answer: 150, //       RISPOSTA (cue assoluto 420)
	cardIn: 163, //       nota di accuratezza
	rowsIn: 180, //       confronto dimensioni modello (beat, abs 450)
	collapse: 227, //     tutto collassa in un punto di luce
	end: 239,
} as const;

/** Centro del diagramma (= posa della rete al taglio). */
export const HUB = {x: V2_NET_AT_270.cx, y: V2_NET_AT_270.cy};
/** Scala della rete a diagramma composto (camera a s = 1). */
export const NET_K = 0.44;
/** Scala iniziale della camera: la rete parte esattamente a scale 0.95. */
export const S0 = V2_NET_AT_270.scale / NET_K;
/** Scala camera a diagramma composto e discesa verticale del centro. */
export const S_END = 1.04;
export const DROP = 60;

export type Cam = {s: number; tx: number; ty: number};

/** Pull-back: parte da fermo (continuità col taglio), accelera subito e si posa morbido. */
export const pullP = (f: number): number => {
	const t = clamp(f / T.pullEnd);
	const k = clamp(t / 0.25);
	return ease.outCubic(t) * k * k * (3 - 2 * k);
};

/** Camera del diagramma: pull-back iniziale, lenta deriva, arretramento sulla nota, collasso finale. */
export const camAt = (f: number): Cam => {
	const pull = pullP(f);
	let s = lerp(S0, S_END, pull);
	// lenta spinta in avanti durante caricamento/elaborazione (mai statico)
	s *= 1 + 0.02 * prog(f, T.pullEnd, T.answer - T.pullEnd, ease.inOutSine);
	// piccola "inspirazione" prima della risposta e rimbalzo sul colpo
	s *= 1 - 0.018 * prog(f, T.answer - 8, 8, ease.inQuad) * (f < T.answer ? 1 : 0) + 0.025 * hit(f, T.answer, 10);
	// la nota prende la scena: il diagramma arretra
	s *= 1 - 0.1 * prog(f, T.cardIn - 4, 18, ease.outCubic);
	// collasso finale verso il centro
	s *= 1 - 0.96 * prog(f, T.collapse, T.end - T.collapse, ease.inExpo);
	const drift = prog(f, 4, 40, ease.inOutSine);
	const tx = Math.sin(f / 47) * 6 * drift;
	// il diagramma scende verso il centro ottico del formato verticale
	const back = 1 - prog(f, T.collapse, T.end - T.collapse, ease.inOutCubic); // il punto di luce torna su y 760 (CutFlash)
	const ty = (DROP * pull + (Math.cos(f / 61) * 5 - 5) * drift) * back;
	return {s, tx, ty};
};

/** Punto del piano del diagramma → schermo. */
export const toScreen = (cam: Cam, x: number, y: number): {x: number; y: number} => ({
	x: HUB.x + cam.tx + cam.s * (x - HUB.x),
	y: HUB.y + cam.ty + cam.s * (y - HUB.y),
});

/** Progresso del caricamento del modello (RAM, anello, rete). */
export const loadP = (f: number): number => prog(f, T.loadStart + 2, T.loadEnd - T.loadStart - 2, ease.inOutSine);

/** Intensità dell'elaborazione (CPU/GPU): sale dopo l'invio, picco sulla risposta, resta viva sotto la nota. */
export const procP = (f: number): number =>
	clamp(prog(f, T.promptSend - 2, 10, ease.outCubic) * (0.75 + 0.25 * prog(f, T.promptSend, T.answer - T.promptSend, ease.inQuad)));

/** Diagramma attenuato quando la nota di accuratezza è il punto focale (1 = pieno). */
export const diagramLevel = (f: number): number => 1 - 0.78 * prog(f, T.cardIn - 4, 14, ease.outCubic);

/** Uscita generale (collasso): 1 → 0 negli ultimi frame. */
export const outP = (f: number): number => prog(f, T.collapse, T.end - T.collapse, ease.inCubic);

/** Comparsa di un elemento sul beat: pop con leggero overshoot. */
export const popIn = (f: number, at: number, dur = 10): number => prog(f, at, dur, ease.outBack);

export {envelope, hit, tween};
