import {drawGlow, withAlpha} from '../../lib/canvas';
import {clamp, ease, lerp, seeded, TAU} from '../../lib/math';
import {COLORS} from '../../theme';
import {hubAt, smooth, T} from './motion';

/**
 * COLPO FINALE (cue lockup) — anello di implosione, onda d'urto, braci e poi il pulviscolo
 * lento che tiene viva la end card. Tutto in forma chiusa; composite 'lighter'.
 */

/** Cerchio con glow a tre passate (alone largo + bordo + filo caldo): niente shadowBlur. */
const strokeRing = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, w: number, a: number): void => {
	if (a <= 0.003 || r <= 0) return;
	const pass = (width: number, alpha: number, color: string) => {
		ctx.globalAlpha = Math.min(1, alpha);
		ctx.strokeStyle = color;
		ctx.lineWidth = width;
		ctx.beginPath();
		ctx.arc(x, y, r, 0, TAU);
		ctx.stroke();
	};
	pass(w * 6, a * 0.08, COLORS.orange);
	pass(w * 2.4, a * 0.24, COLORS.orangeBright);
	pass(w, a, COLORS.orangeHot);
	ctx.globalAlpha = 1;
};

const CALL_LIFE = 18;

/**
 * Richiamo: subito dopo il taglio lo spark emette un anello che corre verso i bordi a velocità
 * costante, come un'onda sonora; dietro di lui tutto comincia a rientrare. Nullo a f 0.
 */
export const drawCall = (ctx: CanvasRenderingContext2D, f: number): void => {
	if (f <= 0 || f >= CALL_LIFE) return;
	const hub = hubAt(0);
	const t = f / CALL_LIFE;
	const r = hub.size * 0.6 + 96 * Math.pow(f, 0.96);
	strokeRing(ctx, hub.x, hub.y, r, lerp(3, 1, t), 0.8 * Math.pow(1 - t, 1.3) * Math.min(1, f));
};

const IMPLODE_FROM = 44; // l'anello di anticipazione parte largo e si chiude sul cue
const SHOCK_LIFE = 30;

/** Anticipazione: un anello sottile si stringe accelerando fino al bordo dello spark, esattamente sul colpo. */
export const drawImplosion = (ctx: CanvasRenderingContext2D, f: number): void => {
	const t = (f - IMPLODE_FROM) / (T.hit - IMPLODE_FROM);
	if (t <= 0 || t >= 1) return;
	const hub = hubAt(f);
	const r = lerp(820, hub.size * 0.56, ease.inCubic(t));
	strokeRing(ctx, hub.x, hub.y, r, lerp(1.2, 2.6, t), 0.6 * ease.outQuad(clamp(t * 2)) * (0.3 + 0.7 * t));
};

/** Una sola onda d'urto sottile che nasce al bordo dello spark e si allarga fino a svanire. */
export const drawShockwave = (ctx: CanvasRenderingContext2D, f: number): void => {
	const t = (f - T.hit) / SHOCK_LIFE;
	if (t < 0 || t >= 1) return;
	const hub = hubAt(T.hit);
	// nasce già staccata dalle punte dello spark: sul fotogramma del colpo non lo "incornicia"
	const r = lerp(hub.size * 0.78, 1180, ease.outCubic(t));
	strokeRing(ctx, hub.x, hub.y, r, lerp(4, 1.1, t), Math.pow(1 - t, 1.8) * 0.9);
};

/** Nucleo che pulsa a ogni assorbimento (`pulse` = somma dei micro-impulsi). */
export const drawCore = (ctx: CanvasRenderingContext2D, f: number, pulse: number): void => {
	if (pulse <= 0.01) return;
	const hub = hubAt(f);
	drawGlow(ctx, hub.x, hub.y, hub.size * (0.045 + 0.02 * pulse), COLORS.orangeBright, 0.5 * Math.min(1, pulse), COLORS.white);
};

// ──────────────────────────────── braci ────────────────────────────────

type Ember = {angle: number; from: number; reach: number; tau: number; life: number; size: number; lift: number; phase: number; hot: boolean};

export const buildEmbers = (n: number, seed = 31): Ember[] => {
	const rnd = seeded(seed);
	return Array.from({length: n}, (_, i) => {
		const fast = rnd() < 0.3;
		return {
			angle: ((i + rnd() * 0.9) / n) * TAU,
			from: 0.3 + rnd() * 0.22, // frazione del lato dello spark
			reach: fast ? 300 + rnd() * 260 : 90 + rnd() * 210,
			tau: 5 + rnd() * 4,
			life: 16 + rnd() * 20,
			size: 1.3 + rnd() * 2.2,
			lift: 0.2 + rnd() * 0.7,
			phase: rnd() * TAU,
			hot: rnd() < 0.35,
		};
	});
};

/** Breve raffica di braci: schizzano via radiali, frenano (decadimento esponenziale) e salgono piano spegnendosi. */
export const drawEmbers = (ctx: CanvasRenderingContext2D, embers: Ember[], f: number): void => {
	const d = f - T.hit;
	if (d < 0 || d > 38) return;
	const hub = hubAt(T.hit);
	const at = (e: Ember, t: number) => {
		const dist = hub.size * e.from + e.reach * (1 - Math.exp(-t / e.tau));
		return {x: hub.x + Math.cos(e.angle) * dist, y: hub.y + Math.sin(e.angle) * dist - e.lift * t - 0.012 * t * t};
	};
	ctx.lineCap = 'round';
	for (const e of embers) {
		if (d >= e.life) continue;
		const k = 1 - d / e.life;
		const a = Math.pow(k, 1.4) * (0.75 + 0.25 * Math.sin(d * 1.3 + e.phase));
		const p = at(e, d);
		const q = at(e, Math.max(0, d - 1.3));
		const color = e.hot ? COLORS.orangeHot : COLORS.orange;
		ctx.strokeStyle = withAlpha(color, a * 0.5);
		ctx.lineWidth = e.size * 0.9;
		ctx.beginPath();
		ctx.moveTo(q.x, q.y);
		ctx.lineTo(p.x, p.y);
		ctx.stroke();
		drawGlow(ctx, p.x, p.y, e.size * (0.7 + 0.5 * k), color, a, e.hot ? COLORS.white : COLORS.orangeHot);
	}
	ctx.globalAlpha = 1;
};

// ─────────────────────── pulviscolo della end card ───────────────────────

type Mote = {x: number; y0: number; speed: number; size: number; sway: number; phase: number; bright: number};

const RISE = {top: 430, bottom: 1560}; // fascia verticale attorno al lockup
const TEXT_BAND = {top: 925, bottom: 1295}; // wordmark + payoff

export const buildMotes = (n: number, seed = 9): Mote[] => {
	const rnd = seeded(seed);
	return Array.from({length: n}, () => ({
		x: 130 + rnd() * 820,
		y0: rnd(),
		speed: 0.35 + rnd() * 0.8,
		size: 1.2 + rnd() * 1.9,
		sway: 10 + rnd() * 26,
		phase: rnd() * TAU,
		bright: 0.35 + rnd() * 0.5,
	}));
};

/** Particelle lente che salgono attorno al logo: la end card resta viva senza distrarre. */
export const drawMotes = (ctx: CanvasRenderingContext2D, motes: Mote[], f: number): void => {
	const on = smooth((f - T.hit - 6) / 34);
	if (on <= 0) return;
	const span = RISE.bottom - RISE.top;
	for (const m of motes) {
		const ph = (((m.y0 - (f * m.speed) / span) % 1) + 1) % 1; // 1 = in basso, 0 = in alto
		const y = RISE.top + ph * span;
		const x = m.x + Math.sin(f / 46 + m.phase) * m.sway;
		const env = Math.sin(Math.PI * ph) ** 1.5; // nasce e muore dolcemente ai bordi della fascia
		const tw = 0.7 + 0.3 * Math.sin(f / 13 + m.phase * 2);
		// più tenue (con rampa morbida) dove passano wordmark e payoff: i testi restano puliti
		const overText = 1 - 0.65 * smooth((y - TEXT_BAND.top + 60) / 60) * (1 - smooth((y - TEXT_BAND.bottom) / 60));
		drawGlow(ctx, x, y, m.size, COLORS.orange, on * env * tw * m.bright * overText, COLORS.orangeHot);
	}
	ctx.globalAlpha = 1;
};
