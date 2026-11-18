import {drawGlow} from '../../lib/canvas';
import {clamp, ease, lerp, seeded, TAU} from '../../lib/math';
import {sampleSparkPoints} from '../../lib/spark';
import {COLORS} from '../../theme';
import {extrasOut, HUB, POSE, T} from './motion';

/**
 * IMPATTO (cue sparkFormed) — onde d'urto, braci e pulviscolo in orbita.
 * Tutto in forma chiusa rispetto al frame; da disegnare con composite 'lighter'.
 */

type Vec = {x: number; y: number};

// ───────────────────────────── onde d'urto ─────────────────────────────

const RINGS = [
	{delay: 0, life: 20, from: 120, to: 760, width: 4, alpha: 0.85},
	{delay: 3, life: 17, from: 90, to: 470, width: 2.5, alpha: 0.5},
] as const;

const strokeCircle = (ctx: CanvasRenderingContext2D, r: number, w: number, a: number, color: string): void => {
	if (a <= 0.003) return;
	ctx.globalAlpha = Math.min(1, a);
	ctx.strokeStyle = color;
	ctx.lineWidth = w;
	ctx.beginPath();
	ctx.arc(HUB.x, HUB.y, r, 0, TAU);
	ctx.stroke();
};

/** Due anelli sottili che si espandono dal mozzo e svaniscono entro formed+20. */
export const drawRings = (ctx: CanvasRenderingContext2D, f: number): void => {
	for (const r of RINGS) {
		const t = (f - T.formed - r.delay) / r.life;
		if (t < 0 || t >= 1) continue;
		const radius = lerp(r.from, r.to, ease.outQuint(t));
		const a = Math.pow(1 - t, 1.7) * r.alpha;
		const w = lerp(r.width, 1.2, t);
		// alone largo + bordo + filo caldo: glow senza shadowBlur
		strokeCircle(ctx, radius, w * 6, a * 0.09, COLORS.orange);
		strokeCircle(ctx, radius, w * 2.4, a * 0.26, COLORS.orangeBright);
		strokeCircle(ctx, radius, w, a, COLORS.orangeHot);
	}
	ctx.globalAlpha = 1;
};

// ──────────────────────────────── braci ────────────────────────────────

export type Ember = {
	ox: number;
	oy: number;
	dx: number;
	dy: number;
	dist: number;
	curl: number;
	life: number;
	delay: number;
	size: number;
	twPh: number;
	hot: boolean;
};

export const buildEmbers = (count: number, seed: number): Ember[] => {
	const pts = sampleSparkPoints(count, seed);
	const rnd = seeded(seed * 2749 + 5);
	return pts.map((pt) => {
		const ang = pt.a + (rnd() - 0.5) * 0.7;
		return {
			ox: POSE.x + pt.x * POSE.size - HUB.x,
			oy: POSE.y + pt.y * POSE.size - HUB.y,
			dx: Math.cos(ang),
			dy: Math.sin(ang),
			dist: 190 + 600 * Math.pow(rnd(), 1.6),
			curl: 30 + 110 * rnd(),
			life: 14 + 12 * rnd(),
			delay: rnd() * 2.5,
			size: 1.7 + 2.1 * rnd(),
			twPh: rnd() * TAU,
			hot: rnd() < 0.4,
		};
	});
};

const emberPosition = (e: Ember, t: number, k: number, out: Vec): number => {
	const x = clamp(t / e.life);
	const p = 1 - Math.pow(1 - x, 3.4); // partenza violenta, frenata lunga
	const side = e.curl * p * p; // leggera curva nel verso del vortice
	out.x = HUB.x + e.ox * k + e.dx * e.dist * p + e.dy * side;
	out.y = HUB.y + e.oy * k + e.dy * e.dist * p - e.dx * side;
	return x;
};

/** ~80 braci veloci scagliate dalla sagoma verso l'esterno, con stiramento lungo la direzione. */
export const drawEmbers = (ctx: CanvasRenderingContext2D, embers: Ember[], f: number, k: number): void => {
	const a: Vec = {x: 0, y: 0};
	const b: Vec = {x: 0, y: 0};
	ctx.lineCap = 'round';
	for (const e of embers) {
		const t = f - T.formed - e.delay;
		if (t < 0 || t >= e.life) continue;
		const x = emberPosition(e, t, k, a);
		const alpha = Math.pow(1 - x, 1.5) * (0.78 + 0.22 * Math.sin(f * 1.3 + e.twPh));
		const size = e.size * (1 - 0.55 * x);
		const color = e.hot ? COLORS.orangeBright : COLORS.orange;
		emberPosition(e, Math.max(0, t - 0.9), k, b);
		ctx.strokeStyle = color;
		ctx.lineWidth = Math.max(1, size * 0.9);
		ctx.globalAlpha = alpha * 0.55;
		ctx.beginPath();
		ctx.moveTo(a.x, a.y);
		ctx.lineTo(b.x, b.y);
		ctx.stroke();
		drawGlow(ctx, a.x, a.y, size, color, alpha, e.hot ? COLORS.white : COLORS.orangeHot);
	}
	ctx.globalAlpha = 1;
};

// ─────────────────────────── pulviscolo in orbita ───────────────────────────

export type Mote = {
	a: number;
	ratio: number;
	tilt: number;
	th0: number;
	w: number;
	size: number;
	delay: number;
	hot: boolean;
};

export const buildMotes = (count: number, seed: number): Mote[] => {
	const rnd = seeded(seed * 9173 + 3);
	return Array.from({length: count}, (_, i): Mote => {
		const a = 208 + 130 * rnd();
		return {
			a,
			ratio: 0.3 + 0.12 * rnd(),
			tilt: -0.26 + (rnd() - 0.5) * 0.22,
			th0: ((i + rnd() * 0.7) / count) * TAU,
			w: -(0.1 - 0.035 * ((a - 208) / 130)) * (0.9 + 0.2 * rnd()), // stesso verso del vortice, interni più rapidi
			size: 2.4 + 1.9 * rnd(),
			delay: rnd() * 3,
			hot: rnd() < 0.35,
		};
	});
};

const TRAIL = 8;

/**
 * Pulviscolo che l'impatto lancia in orbita attorno allo spark e che poi rientra a spirale.
 * `front` seleziona la metà dell'orbita davanti (true) o dietro (false) al simbolo: due passate
 * su due canvas, sopra e sotto ClaudeSpark, danno profondità vera.
 */
export const drawMotes = (ctx: CanvasRenderingContext2D, motes: Mote[], f: number, front: boolean): void => {
	for (const m of motes) {
		for (let j = TRAIL; j >= 0; j--) {
			const ff = f - j * 0.55;
			const t = ff - T.formed - m.delay;
			if (t <= 0) continue;
			const out = extrasOut(ff, m.delay);
			if (out >= 1) continue;
			const th = m.th0 + m.w * t + m.w * 12 * out * out; // accelera mentre cade verso il centro
			const depth = Math.sin(th); // >0: metà bassa dell'ellisse = davanti
			if (depth >= 0 !== front) continue;
			const rad = m.a * ease.outExpo(clamp(t / 18)) * (1 - 0.82 * ease.inCubic(out));
			const ex = Math.cos(th) * rad;
			const ey = depth * rad * m.ratio;
			const ct = Math.cos(m.tilt);
			const st = Math.sin(m.tilt);
			const tail = 1 - j / (TRAIL + 1);
			const alpha = clamp(t / 4) * (1 - out) * (0.7 + 0.3 * depth) * (j === 0 ? 1 : 0.55 * tail * tail);
			const size = m.size * (1 + 0.28 * depth) * (j === 0 ? 1 : 0.45 + 0.5 * tail);
			drawGlow(
				ctx,
				HUB.x + ex * ct - ey * st,
				HUB.y + ex * st + ey * ct,
				size,
				m.hot ? COLORS.orangeBright : COLORS.orange,
				alpha,
				m.hot ? COLORS.white : COLORS.orangeHot,
			);
		}
	}
	ctx.globalAlpha = 1;
};
