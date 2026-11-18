import {clamp, ease, invLerp, lerp, Vec2} from '../../lib/math';
import {SPARK_CENTER, SPARK_VIEWBOX} from '../../lib/spark';
import {CUES, SCENES, SPARK_POSE} from '../../timeline';

const START = SCENES.outro.start;

/** Tempi chiave della scena (frame locali; assoluto = locale + 720). */
export const T = {
	arrive: 54, //      lo spark è atterrato nella posa del lockup
	lastAbsorb: 58, //  ultimo elemento assorbito: poi un frame di silenzio
	hit: CUES.lockup - START, // 60 · COLPO FINALE (cue musicale)
	wordIn: 62, //      "Claude Code" sale dalla maschera, lettera per lettera
	dividerIn: 78,
	cursorIn: 80,
	taglineIn: 84,
	sweepIn: 100, //    un solo passaggio di luce sul wordmark
	sweepOut: 125,
	calm: CUES.fadeStart - START, // 150 · la musica sfuma: il battito si attenua
	last: SCENES.outro.length - 1, // 179
} as const;

const FROM = SPARK_POSE.resultEnd;
const TO = SPARK_POSE.lockup;

/** smoothstep con clamp. */
export const smooth = (t: number): number => {
	const x = clamp(t);
	return x * x * (3 - 2 * x);
};

export type Pose = {x: number; y: number; size: number; rotation: number};

/**
 * Posa dello spark: da resultEnd (f 0) a lockup (f >= arrive) con ease in-out,
 * piccolo slancio verso l'alto di anticipazione e un giro completo che atterra a rotazione 0.
 * Dopo il colpo galleggia di pochi px (periodo scelto perché valga 0 sull'ultimo frame).
 */
export const sparkPose = (f: number): Pose => {
	const e = ease.inOutCubic(clamp(f / T.arrive));
	const antic = Math.sin(Math.PI * clamp(f / 16)) ** 2;
	const spin = ease.inOutCubic(clamp(f / T.arrive));
	const float = f > T.hit ? 4 * Math.sin(((f - T.hit) / (T.last - T.hit)) * 3 * Math.PI) * smooth((f - T.hit) / 30) : 0;
	return {
		x: lerp(FROM.x, TO.x, e),
		y: lerp(FROM.y, TO.y, e) - 22 * antic + float,
		size: lerp(FROM.size, TO.size, ease.inOutSine(clamp(f / T.arrive))),
		rotation: spin >= 1 ? 0 : 360 * spin,
	};
};

export type Hub = Vec2 & {size: number};

/** Mozzo dello spark in px (origine di scala/rotazione di ClaudeSpark): bersaglio di tutta la convergenza. */
export const hubAt = (f: number): Hub => {
	const p = sparkPose(f);
	return {
		x: p.x + (SPARK_CENTER.x / SPARK_VIEWBOX - 0.5) * p.size,
		y: p.y + (SPARK_CENTER.y / SPARK_VIEWBOX - 0.5) * p.size,
		size: p.size,
	};
};

/** Impulso di "richiamo" subito dopo il taglio (0 esatto a f 0, picco a f ~3, nullo da f 12). */
export const callPulse = (f: number): number => (f <= 0 || f >= 12 ? 0 : Math.sin((Math.PI * f) / 12) * Math.exp(-f / 5) * 1.7);

/**
 * Scala dello spark attorno al mozzo: si contrae prima del colpo (anticipazione),
 * esplode sul cue e torna a 1 con un rimbalzo smorzato. Vale 1 esatto a f 0 e da hit+26.
 */
export const sparkPop = (f: number): number => {
	const t = f - T.hit;
	if (t < 0) return 1 + 0.1 * callPulse(f) - 0.085 * ease.inCubic(invLerp(T.arrive - 4, T.hit - 1, f));
	return 1 + 0.15 * Math.exp(-t / 4.4) * Math.cos(t * 0.6) * (1 - smooth((t - 14) / 12));
};

/** Glow dello spark: si carica con lo swell, picco sul colpo, poi torna a 1. */
export const sparkGlow = (f: number): number => {
	const t = f - T.hit;
	if (t < 0) return 1 + 0.75 * ease.inQuad(clamp(f / (T.hit - 1))) + 0.5 * callPulse(f);
	return 1 + 1.4 * Math.exp(-t / 7) * (1 - smooth((t - 22) / 14));
};

/** "Calore" (overlay arancio chiaro): cresce assorbendo, incandescente sul colpo, poi si raffredda. */
export const heat = (f: number): number => {
	const t = f - T.hit;
	if (t < 0) return 0.34 * ease.inQuad(clamp(f / (T.hit - 1))) + 0.4 * callPulse(f);
	return Math.exp(-t / 6) * (1 - smooth((t - 16) / 12));
};

/** Lampo del colpo finale: 0 prima del cue, 1 sul cue, 0 esatto da hit+26. */
export const flash = (f: number): number => {
	const t = f - T.hit;
	if (t < 0) return 0;
	return Math.exp(-t / 4.6) * (1 - smooth((t - 14) / 12));
};

/** Scossa verticale della camera dopo il colpo (px). */
export const cameraShake = (f: number): number => {
	const t = f - T.hit;
	if (t <= 0 || t >= 12) return 0;
	return 7 * Math.exp(-t / 3) * Math.sin(t * 1.9) * (1 - smooth((t - 6) / 6));
};

/** Ampiezza del battito di ClaudeSpark: 1 fino a quando la musica sfuma, poi scende a 0.3. */
export const beatAmp = (f: number): number => lerp(1, 0.3, ease.inOutSine(invLerp(T.calm, T.calm + 22, f)));

