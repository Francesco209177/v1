import {clamp, ease, hash, invLerp, lerp} from '../../../lib/math';
import {V1_CUES, V1_QUESTION} from '../../timeline';

/** Frame del HOOK (la scena parte a 0: frame locale = frame assoluto). */
export const TYPE_START = V1_CUES.typeStart; // 6
export const TYPE_END = V1_CUES.questionDone; // 45: il "?" arriva esattamente qui
export const DIVE = V1_CUES.diveIn; // 60

/** La domanda va a capo dopo "sapere" (a capo forzato: niente salti di layout durante la digitazione). */
export const LINE1 = 'Come fa ChatGPT a sapere';
export const BREAK = LINE1.length; // indice dello spazio che diventa a capo
export const CHARS = V1_QUESTION.split('');

/**
 * Istante (frame, frazionario) in cui compare ogni carattere: ritmo veloce e un po' irregolare,
 * esitazione a inizio parola, piccola pausa prima del "?" finale. Deterministico (hash).
 */
export const CHAR_AT: number[] = (() => {
	const w = CHARS.map((ch, i) => {
		if (i === 0) return 0;
		let v = 0.62 + 0.8 * hash(i, 41);
		if (CHARS[i - 1] === ' ') v += 0.55; // nuova parola
		if (ch === ' ') v *= 0.7;
		if (i > 0 && CHARS[i - 1] === CHARS[i]) v *= 0.8;
		if (ch === '?') v += 1.4; // ultimo tasto, deciso
		return v;
	});
	const total = w.reduce((a, b) => a + b, 0);
	let acc = 0;
	return w.map((v) => {
		acc += v;
		return TYPE_START + ((TYPE_END - TYPE_START) * acc) / total;
	});
})();

/** Numero di caratteri visibili al frame f (all'ultimo frame di digitazione: tutti e 43). */
export const typedCount = (f: number): number => {
	let n = 0;
	for (const t of CHAR_AT) if (t <= f + 1e-6) n++;
	return n;
};

/** Cursore: fisso mentre si scrive, lampeggio morbido (≈ 0,5 s) quando è fermo. */
export const caretOn = (f: number): number => {
	const typing = f >= TYPE_START && f <= TYPE_END + 2;
	if (typing) return 1;
	const ref = f < TYPE_START ? -4 : TYPE_END + 3;
	const ph = (((f - ref) % 16) + 16) % 16;
	// acceso 0..8, spento 10..15, rampe di 2 frame
	if (ph < 8) return 1;
	if (ph < 10) return 1 - (ph - 8) / 2;
	if (ph < 14) return 0;
	return (ph - 14) / 2;
};

/** Il campo cresce da 1 a 2 righe quando compare la prima lettera della seconda riga. */
export const fieldGrow = (f: number): number => ease.outCubic(clamp((f - CHAR_AT[BREAK + 1] + 1) / 5));

// ── Camera del tuffo ────────────────────────────────────────────────────────────

/** Punto dello schermo (coordinate del frame a scala 1) verso cui la camera si tuffa: sotto la 2ª riga. */
export const FOCUS = {x: 560, y: 806} as const;
/** Punto di fuga condiviso con TOKENS (lì la domanda si ricompone). */
export const VP = {x: 540, y: 720} as const;

/**
 * Logaritmo della scala della camera. Lenta deriva in avanti fino a 50, piccola anticipazione (arretra),
 * poi da 60 spinta con accelerazione crescente: a 89 lo schermo è ~40x e lo abbiamo attraversato.
 */
export const hookLogScale = (f: number): number => {
	const drift = -0.075 * (1 - clamp(f / 60));
	const ant = f > 49 && f < 62 ? -0.022 * Math.sin((Math.PI * (f - 49)) / 13) : 0;
	const t = Math.max(0, f - DIVE);
	const push = 0.018 * t + 9.25e-5 * Math.pow(t, 3.1);
	return drift + ant + push;
};
export const hookScale = (f: number): number => Math.exp(hookLogScale(f));

/** Velocità di zoom (Δ log-scala per frame), per motion blur e scie. */
export const zoomSpeed = (f: number): number => hookLogScale(f) - hookLogScale(f - 1);

export type HookCam = {s: number; px: number; py: number; rx: number; ry: number};

/** Posa completa: scala attorno a FOCUS, FOCUS portato verso VP, leggera inclinazione 3D iniziale che si raddrizza. */
export const hookCam = (f: number): HookCam => {
	const s = hookScale(f);
	const m = ease.inOutCubic(invLerp(DIVE, 88, f));
	const flat = ease.inOutSine(clamp(f / 62));
	return {
		s,
		px: lerp(FOCUS.x, VP.x, m),
		py: lerp(FOCUS.y, VP.y, m),
		rx: lerp(7, 0, flat),
		ry: lerp(-9, 0, flat),
	};
};

/** Scala → 0..1 su un intervallo logaritmico (es. quando la griglia di pixel diventa visibile). */
export const sBand = (s: number, a: number, b: number): number => ease.inOutSine(invLerp(Math.log(a), Math.log(b), Math.log(s)));
