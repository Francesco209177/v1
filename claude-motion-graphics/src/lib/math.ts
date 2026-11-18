import {BEAT} from '../timeline';

export const TAU = Math.PI * 2;
export const clamp = (v: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number): number => (a === b ? 0 : clamp((v - a) / (b - a)));

export type Easing = (t: number) => number;
export const ease = {
	linear: (t: number) => t,
	inQuad: (t: number) => t * t,
	outQuad: (t: number) => 1 - (1 - t) * (1 - t),
	inCubic: (t: number) => t * t * t,
	outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
	inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
	inQuart: (t: number) => t * t * t * t,
	outQuart: (t: number) => 1 - Math.pow(1 - t, 4),
	inOutQuart: (t: number) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
	outQuint: (t: number) => 1 - Math.pow(1 - t, 5),
	inExpo: (t: number) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
	outExpo: (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
	inOutExpo: (t: number) =>
		t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
	inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
	outBack: (t: number) => {
		const c1 = 1.70158;
		const c3 = c1 + 1;
		return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
	},
	inBack: (t: number) => {
		const c1 = 1.70158;
		const c3 = c1 + 1;
		return c3 * t * t * t - c1 * t * t;
	},
	outElastic: (t: number) => {
		const c4 = TAU / 3;
		return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
	},
} satisfies Record<string, Easing>;

/** Progresso 0..1 (con easing) di un'animazione che parte a `start` e dura `duration` frame. */
export const prog = (frame: number, start: number, duration: number, easing: Easing = ease.outCubic): number =>
	easing(clamp((frame - start) / Math.max(1e-6, duration)));

/** Mappa frame in [f0,f1] su [v0,v1] con easing e clamp. */
export const tween = (
	frame: number,
	f0: number,
	f1: number,
	v0: number,
	v1: number,
	easing: Easing = ease.inOutCubic,
): number => lerp(v0, v1, easing(invLerp(f0, f1, frame)));

/** Inviluppo 0→1→0: entra in [inStart, inStart+inDur], esce in [outStart, outStart+outDur]. */
export const envelope = (
	frame: number,
	inStart: number,
	inDur: number,
	outStart: number,
	outDur: number,
	easeIn: Easing = ease.outCubic,
	easeOut: Easing = ease.inCubic,
): number => prog(frame, inStart, inDur, easeIn) * (1 - prog(frame, outStart, outDur, easeOut));

/** Impulso sul beat: 1 esattamente sul beat, decade esponenzialmente. Usa il frame ASSOLUTO. */
export const beatPulse = (absFrame: number, decay = 5, every: number = BEAT): number => {
	const phase = (((absFrame % every) + every) % every) / every;
	return Math.exp(-phase * decay);
};

/** Impulso one-shot che parte a `at` e decade in ~`length` frame (0 prima di `at`). */
export const hit = (frame: number, at: number, length = 12): number =>
	frame < at ? 0 : Math.exp(-((frame - at) / length) * 4);

/** PRNG deterministico (mulberry32). MAI Math.random(): il render è multi-processo. */
export const seeded = (seed: number): (() => number) => {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

/** Hash deterministico 0..1 da uno o due interi. */
export const hash = (i: number, j = 0): number => {
	let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263)) | 0;
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export type Vec2 = {x: number; y: number};
export const mix2 = (a: Vec2, b: Vec2, t: number): Vec2 => ({x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t)});

/** Punto su una curva di Bézier quadratica (traiettorie ad arco). */
export const bezier2 = (a: Vec2, c: Vec2, b: Vec2, t: number): Vec2 => {
	const u = 1 - t;
	return {x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y};
};
