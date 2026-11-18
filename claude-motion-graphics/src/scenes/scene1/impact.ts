import {drawGlow} from '../../lib/canvas';
import {clamp, ease, lerp, seeded, TAU} from '../../lib/math';
import {sampleSparkPoints} from '../../lib/spark';
import {COLORS} from '../../theme';
import {BEAT} from '../../timeline';
import {extrasOut, HUB, POSE, T} from './motion';

/**
 * IMPATTO (cue sparkFormed) — archi di anticipazione, onde d'urto, braci e pulviscolo in orbita.
 * Tutto in forma chiusa rispetto al frame; da disegnare con composite 'lighter'.
 */

type Vec = {x: number; y: number};

// ─────────────────────── anelli: implosione e onde d'urto ───────────────────────

/** Raggio (px) appena oltre le punte dello spark: qui si chiude l'implosione e nasce l'onda d'urto. */
const RING_BIRTH = 186;

const RINGS = [
	{delay: 0, life: 20, from: RING_BIRTH, to: 780, width: 4, alpha: 0.85},
	{delay: 3, life: 17, from: RING_BIRTH, to: 500, width: 2.5, alpha: 0.5},
] as const;

/** Archi di anticipazione: partono larghi e radi, ruotano col vortice e si chiudono in un cerchio sul cue. */
const IMPLOSION = [
	{start: T.implode, from: 440, arcs: 3, turns: 0.55, phase: 0.4, width: 2.4, alpha: 0.55},
	{start: T.implode + 6, from: 330, arcs: 2, turns: 0.4, phase: 2.1, width: 1.8, alpha: 0.34},
] as const;

/** Arco con glow a tre passate (alone largo + bordo + filo caldo): niente shadowBlur. */
const strokeArc = (ctx: CanvasRenderingContext2D, r: number, a0: number, a1: number, w: number, a: number): void => {
	if (a <= 0.003 || r <= 0) return;
	const pass = (width: number, alpha: number, color: string) => {
		ctx.globalAlpha = Math.min(1, alpha);
		ctx.strokeStyle = color;
		ctx.lineWidth = width;
		ctx.beginPath();
		ctx.arc(HUB.x, HUB.y, r, a0, a1);
		ctx.stroke();
	};
	pass(w * 6, a * 0.09, COLORS.orange);
	pass(w * 2.4, a * 0.26, COLORS.orangeBright);
	pass(w, a, COLORS.orangeHot);
};

/**
 * Anticipazione dell'impatto: archi sottili che si stringono accelerando verso il simbolo,
 * si allungano fino a chiudere il cerchio ESATTAMENTE sul cue, da cui riparte l'onda d'urto.
 */
export const drawImplosion = (ctx: CanvasRenderingContext2D, f: number): void => {
	ctx.lineCap = 'round';
	for (const r of IMPLOSION) {
		const t = (f - r.start) / (T.formed - r.start);
		if (t <= 0 || t >= 1) continue;
		const radius = lerp(r.from, RING_BIRTH, ease.inCubic(t));
		const slot = TAU / r.arcs;
		const span = slot * lerp(0.1, 0.94, ease.inQuad(t));
		const rot = r.phase - r.turns * TAU * ease.inCubic(t); // stesso verso del vortice
		const a = r.alpha * ease.outQuad(clamp(t * 2.5)) * (0.35 + 0.65 * t);
		for (let i = 0; i < r.arcs; i++) {
			const mid = rot + i * slot;
			strokeArc(ctx, radius, mid - span / 2, mid + span / 2, lerp(1.2, r.width, t), a);
		}
	}
	ctx.globalAlpha = 1;
};

/** Due anelli sottili che nascono al bordo dello spark, si espandono e svaniscono entro formed+20. */
export const drawRings = (ctx: CanvasRenderingContext2D, f: number): void => {
	ctx.lineCap = 'butt';
	for (const r of RINGS) {
		const t = (f - T.formed - r.delay) / r.life;
		if (t < 0 || t >= 1) continue;
		const radius = lerp(r.from, r.to, ease.outQuint(t));
		// sul frame di nascita l'anello è ancora dentro il bloom: entra a metà intensità
		const born = lerp(0.4, 1, clamp(t * r.life));
		strokeArc(ctx, radius, 0, TAU, lerp(r.width, 1.2, t), Math.pow(1 - t, 1.7) * r.alpha * born);
	}
	ctx.globalAlpha = 1;
};

/** Beat successivi all'impatto (f 90 e 105): lo spark "batte" e lascia partire un'onda sottile. */
const RIPPLE_BEATS = [T.formed + BEAT, T.formed + 2 * BEAT] as const;
const RIPPLE_LIFE = 10; // l'ultima onda è spenta a f 115, prima di extrasGone

/** Onde leggere sul beat: stessa nascita delle onde d'urto, ma brevi e discrete. */
export const drawRipples = (ctx: CanvasRenderingContext2D, f: number): void => {
	ctx.lineCap = 'butt';
	for (const at of RIPPLE_BEATS) {
		const t = (f - at) / RIPPLE_LIFE;
		if (t < 0 || t >= 1) continue;
		const radius = lerp(RING_BIRTH, 345, ease.outCubic(t));
		strokeArc(ctx, radius, 0, TAU, lerp(2.4, 1, t), 0.34 * Math.pow(1 - t, 1.4) * lerp(0.5, 1, clamp(t * RIPPLE_LIFE)));
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

/** Scia a cometa delle braci: tre tratti all'indietro nel tempo, sempre più sottili e trasparenti. */
const EMBER_TAIL = [
	{back: 0.34, width: 0.9, alpha: 0.6},
	{back: 0.68, width: 0.62, alpha: 0.3},
	{back: 1.02, width: 0.38, alpha: 0.11},
] as const;

/** ~80 braci veloci scagliate dalla sagoma verso l'esterno, con stiramento lungo la direzione. */
export const drawEmbers = (ctx: CanvasRenderingContext2D, embers: Ember[], f: number, k: number): void => {
	const head: Vec = {x: 0, y: 0};
	const from: Vec = {x: 0, y: 0};
	const to: Vec = {x: 0, y: 0};
	ctx.lineCap = 'round';
	for (const e of embers) {
		const t = f - T.formed - e.delay;
		if (t < 0 || t >= e.life) continue;
		const x = emberPosition(e, t, k, head);
		const alpha = Math.pow(1 - x, 1.5) * (0.78 + 0.22 * Math.sin(f * 1.3 + e.twPh));
		const size = e.size * (1 - 0.55 * x);
		const color = e.hot ? COLORS.orangeBright : COLORS.orange;
		ctx.strokeStyle = color;
		from.x = head.x;
		from.y = head.y;
		for (const seg of EMBER_TAIL) {
			emberPosition(e, Math.max(0, t - seg.back), k, to);
			ctx.lineWidth = Math.max(0.8, size * seg.width);
			ctx.globalAlpha = alpha * seg.alpha;
			ctx.beginPath();
			ctx.moveTo(from.x, from.y);
			ctx.lineTo(to.x, to.y);
			ctx.stroke();
			from.x = to.x;
			from.y = to.y;
		}
		drawGlow(ctx, head.x, head.y, size, color, alpha, e.hot ? COLORS.white : COLORS.orangeHot);
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
			size: 3 + 2.2 * rnd(),
			delay: rnd() * 3,
			hot: rnd() < 0.4,
		};
	});
};

const TRAIL = 10; // campioni della scia
const TRAIL_STEP = 0.6; // distanza temporale tra i campioni (frame)

type MoteSample = {x: number; y: number; depth: number; env: number; alive: boolean};

/** Stato del granello al frame (frazionario) `ff`: posizione, profondità (>0 = davanti) e inviluppo. */
const sampleMote = (m: Mote, ff: number, out: MoteSample): void => {
	const t = ff - T.formed - m.delay;
	const exit = extrasOut(ff, m.delay);
	out.alive = t > 0 && exit < 1;
	if (!out.alive) return;
	const th = m.th0 + m.w * t + m.w * 12 * exit * exit; // accelera mentre cade verso il centro
	const depth = Math.sin(th); // metà bassa dell'ellisse = davanti
	const rad = m.a * ease.outExpo(clamp(t / 18)) * (1 - 0.82 * ease.inCubic(exit));
	const ex = Math.cos(th) * rad;
	const ey = depth * rad * m.ratio;
	const ct = Math.cos(m.tilt);
	const st = Math.sin(m.tilt);
	out.x = HUB.x + ex * ct - ey * st;
	out.y = HUB.y + ex * st + ey * ct;
	out.depth = depth;
	out.env = clamp(t / 4) * (1 - exit) * (0.72 + 0.28 * depth);
};

/**
 * Pulviscolo che l'impatto lancia in orbita attorno allo spark e che poi rientra a spirale.
 * `front` seleziona la metà dell'orbita davanti (true) o dietro (false) al simbolo: due passate
 * su due canvas, sopra e sotto ClaudeSpark, danno profondità vera.
 * Scia = polilinea continua che si assottiglia (niente "perline"), testa = punto luminoso.
 */
export const drawMotes = (ctx: CanvasRenderingContext2D, motes: Mote[], f: number, front: boolean): void => {
	const cur: MoteSample = {x: 0, y: 0, depth: 0, env: 0, alive: false};
	ctx.lineCap = 'butt';
	for (const m of motes) {
		const color = m.hot ? COLORS.orangeBright : COLORS.orange;
		let px = 0;
		let py = 0;
		let hasPrev = false;
		for (let j = TRAIL; j >= 0; j--) {
			sampleMote(m, f - j * TRAIL_STEP, cur);
			if (!cur.alive) {
				hasPrev = false;
				continue;
			}
			const visible = cur.depth >= 0 === front;
			const scale = m.size * (1 + 0.28 * cur.depth);
			if (visible && hasPrev) {
				const tail = 1 - (j + 0.5) / (TRAIL + 1); // 0 in coda … 1 vicino alla testa
				ctx.strokeStyle = color;
				ctx.lineWidth = Math.max(0.8, scale * (0.25 + 0.85 * tail));
				ctx.globalAlpha = cur.env * 0.55 * tail * tail;
				ctx.beginPath();
				ctx.moveTo(px, py);
				ctx.lineTo(cur.x, cur.y);
				ctx.stroke();
			}
			if (visible && j === 0) drawGlow(ctx, cur.x, cur.y, scale, color, cur.env, m.hot ? COLORS.white : COLORS.orangeHot);
			px = cur.x;
			py = cur.y;
			hasPrev = true;
		}
	}
	ctx.globalAlpha = 1;
};
