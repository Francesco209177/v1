import {drawGlow, withAlpha} from '../../lib/canvas';
import {clamp, ease, hash, hit, lerp, TAU, Vec2} from '../../lib/math';
import {COLORS} from '../../theme';
import {SPARK_POSE} from '../../timeline';
import {curveWorld} from './curve';
import {cardState} from './layout';
import {drawParticleElement} from './particles';
import {FLIGHT_LEGS, legTrace, sparkPos, sparkState, TOUCH} from './sparkPath';
import {CARD, CODE_BIRTHS, ElementId, ELEMENT_IDS, energy, HOME, IGNITE, T} from './timing';
import {groupCenter, groupConverge, LANDING, tokenGroups} from './tokenFlight';

/** Anello di luce (onda d'urto). */
const ring = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, width: number, color: string, a: number): void => {
	if (a <= 0.004 || r <= 0) return;
	ctx.strokeStyle = withAlpha(color, Math.min(1, a));
	ctx.lineWidth = width;
	ctx.beginPath();
	ctx.arc(x, y, r, 0, TAU);
	ctx.stroke();
};

/** Segmento luminoso (scie di movimento). */
const streak = (ctx: CanvasRenderingContext2D, a: Vec2, b: Vec2, width: number, color: string, alpha: number): void => {
	if (alpha <= 0.004) return;
	ctx.strokeStyle = withAlpha(color, Math.min(1, alpha));
	ctx.lineWidth = width;
	ctx.lineCap = 'round';
	ctx.beginPath();
	ctx.moveTo(a.x, a.y);
	ctx.lineTo(b.x, b.y);
	ctx.stroke();
};

/** Flare anamorfico orizzontale. */
const flare = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, a: number): void => {
	if (a <= 0.004) return;
	ctx.save();
	ctx.translate(x, y);
	ctx.scale(w / 100, h / 100);
	drawGlow(ctx, 0, 0, 100 / 6, COLORS.orange, a, COLORS.orangeHot);
	ctx.restore();
};

/** Punto di contatto dell'accensione di ciascun elemento. */
const CONTACT: Record<ElementId, Vec2> = {...TOUCH, C: curveWorld(0)};

/* ================= LAYER DIETRO agli elementi DOM ================= */
export const drawBack = (ctx: CanvasRenderingContext2D, f: number): void => {
	ctx.globalCompositeOperation = 'lighter';
	const spark = sparkState(f);

	// bagliore che cresce dietro lo storyboard durante il build
	if (f >= T.lock && f < T.arrive) {
		const en = energy(f);
		const out = 1 - clamp((f - T.implode) / 8);
		drawGlow(ctx, 540, CARD.y + 40, 150 + 60 * en, COLORS.orangeDeep, (0.1 + 0.3 * en * en) * out, COLORS.orange);
	}

	// tracce dei voli dello spark: restano un attimo sul palco come linee di regia
	for (const leg of FLIGHT_LEGS) {
		if (f < leg.t0) continue;
		const fade = 1 - clamp((f - leg.t1) / 22);
		if (fade <= 0) continue;
		const u = leg.easing(clamp((f - leg.t0) / (leg.t1 - leg.t0)));
		const pts = legTrace(leg.index, u, 20);
		ctx.strokeStyle = withAlpha(COLORS.orange, 0.34 * fade * fade);
		ctx.lineWidth = 3;
		ctx.lineCap = 'round';
		ctx.setLineDash([2, 13]);
		ctx.beginPath();
		pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
		ctx.stroke();
		ctx.setLineDash([]);
	}

	// scia luminosa dello spark (solo quando si muove)
	const moving = clamp((spark.speed - 5) / 26);
	if (moving > 0.01) {
		const n = 16;
		for (let k = 1; k <= n; k++) {
			const p = sparkPos(f - k * 0.55);
			const t = 1 - k / (n + 1);
			drawGlow(ctx, p.x, p.y, spark.size * 0.115 * (0.35 + 0.65 * t), COLORS.orange, 0.42 * moving * t * t, COLORS.orangeHot);
		}
	}

	// particelle (elemento P)
	drawParticleElement(ctx, f);

	// onde d'urto delle accensioni: partono dal centro dell'elemento
	for (const id of ELEMENT_IDS) {
		const dt = f - IGNITE[id];
		if (dt < 0 || dt > 18) continue;
		const c = HOME[id];
		for (let k = 0; k < 2; k++) {
			const u = clamp((dt - k * 3.5) / 13);
			if (u <= 0) continue;
			ring(ctx, c.x, c.y, 40 + 190 * ease.outQuint(u), 4 - 2.5 * u, k === 0 ? COLORS.orangeBright : COLORS.orange, (1 - u) * (1 - u) * (k === 0 ? 0.85 : 0.5));
		}
		drawGlow(ctx, c.x, c.y, 70 + 50 * ease.outCubic(clamp(dt / 10)), COLORS.orange, 0.5 * Math.exp(-dt / 4), COLORS.orangeHot);
	}
};

/* ================= LAYER DAVANTI a tutto (tranne la caption) ================= */
export const drawFront = (ctx: CanvasRenderingContext2D, f: number): void => {
	ctx.globalCompositeOperation = 'lighter';
	const start = SPARK_POSE.ideaEnd;

	// --- FASE A: dardi dallo spark, gocce di codice, nascite ---
	for (const g of tokenGroups()) {
		// la riga di codice si condensa in una goccia di luce lungo l'arco
		if (f >= g.t0 && f < g.at) {
			const conv = groupConverge(g, f);
			for (let k = 0; k < 7; k++) {
				const c = groupCenter(g, f - k * 0.7);
				const t = 1 - k / 7;
				drawGlow(ctx, c.x, c.y, (4 + 9 * conv) * (0.4 + 0.6 * t), COLORS.orange, conv * t * t * (k === 0 ? 1 : 0.6), COLORS.orangeHot);
			}
		}
		// dardo: lo spark "dà vita" al codice, e arriva sul bersaglio esattamente sul beat
		const du = (f - (g.at - 6)) / 6;
		if (du > 0 && du < 1) {
			for (let k = 0; k < 9; k++) {
				const u = ease.inQuad(clamp(du - k * 0.035));
				const t = 1 - k / 9;
				drawGlow(ctx, lerp(start.x, g.target.x, u), lerp(start.y, g.target.y, u), 7 * (0.35 + 0.65 * t), COLORS.orangeBright, 0.9 * t * t * Math.min(1, du * 4), COLORS.white);
			}
		}
	}
	for (const b of CODE_BIRTHS) {
		const dt = f - b.at;
		if (dt < 0 || dt > 18) continue;
		const c = LANDING[b.id as keyof typeof LANDING];
		const seed = b.at;
		drawGlow(ctx, c.x, c.y, 34 + 60 * ease.outCubic(clamp(dt / 9)), COLORS.orangeBright, Math.exp(-dt / 3.2), COLORS.white);
		ring(ctx, c.x, c.y, 18 + 170 * ease.outQuint(clamp(dt / 14)), 3.5 - 2 * clamp(dt / 14), COLORS.orangeBright, 0.8 * (1 - clamp(dt / 14)) ** 2);
		for (let i = 0; i < 16; i++) {
			const a = hash(i, seed) * TAU;
			const d = (50 + 120 * hash(i, seed + 1)) * (1 - Math.exp(-dt / 4));
			drawGlow(ctx, c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, 2.6, COLORS.orange, 0.9 * Math.exp(-dt / 5), COLORS.orangeHot);
		}
	}

	// --- FASE B: lampo e scintille nel punto di contatto ---
	for (const id of ELEMENT_IDS) {
		const dt = f - IGNITE[id];
		if (dt < 0 || dt > 16) continue;
		const c = CONTACT[id];
		const h = HOME[id];
		const dir = Math.atan2(h.y - c.y, h.x - c.x);
		drawGlow(ctx, c.x, c.y, 26 + 44 * ease.outCubic(clamp(dt / 8)), COLORS.orangeBright, 0.9 * Math.exp(-dt / 3), COLORS.white);
		for (let i = 0; i < 14; i++) {
			// scintille a ventaglio verso l'elemento
			const a = dir + (hash(i, IGNITE[id]) - 0.5) * 2.4;
			const d = (40 + 150 * hash(i, IGNITE[id] + 3)) * (1 - Math.exp(-dt / 4.5));
			drawGlow(ctx, c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, 2.4, COLORS.orange, 0.85 * Math.exp(-dt / 5), COLORS.orangeHot);
		}
	}

	// --- FASE C: "lock" dello storyboard sul cue ---
	const lock = hit(f, T.lock, 9);
	if (f >= T.lock && lock > 0.01) {
		flare(ctx, 540, CARD.y, 1500, 300, 0.75 * lock);
		flare(ctx, 540, CARD.y, 2200, 36, 0.9 * lock);
	}

	// --- IMPLOSIONE: tutto viene risucchiato nello spark ---
	if (f >= T.implode - 2 && f < T.end) {
		const s = sparkPos(f);
		// scie delle card
		for (let i = 0; i < 5; i++) {
			const c = cardState(i, f);
			if (c.imp <= 0 || c.imp >= 1) continue;
			const p = cardState(i, f - 1.8);
			streak(ctx, {x: p.x, y: p.y}, {x: c.x, y: c.y}, 5 + 16 * c.scale, COLORS.orange, 0.5 * Math.sin(Math.PI * c.imp));
			drawGlow(ctx, c.x, c.y, 26 * c.scale + 6, COLORS.orange, 0.6 * c.imp, COLORS.orangeHot);
		}
		// particelle convergenti con stiramento radiale
		for (let i = 0; i < 110; i++) {
			const t0 = T.implode - 2 + hash(i, 71) * 7.5;
			const u = (f - t0) / (6 + hash(i, 72) * 1.5);
			if (u <= 0 || u >= 1) continue;
			const a = hash(i, 73) * TAU;
			const r0 = 230 + hash(i, 74) * 560;
			const head = r0 * (1 - ease.inQuad(u));
			const tail = r0 * (1 - ease.inQuad(Math.max(0, u - 0.17)));
			const al = Math.pow(Math.sin(Math.PI * u), 0.7);
			const hx = s.x + Math.cos(a) * head;
			const hy = s.y + Math.sin(a) * head;
			streak(ctx, {x: s.x + Math.cos(a) * tail, y: s.y + Math.sin(a) * tail}, {x: hx, y: hy}, 2.4, COLORS.orange, 0.55 * al);
			drawGlow(ctx, hx, hy, 2.8, COLORS.orange, 0.9 * al, COLORS.orangeHot);
		}
		// anelli che si stringono: la carica
		for (const t0 of [T.implode + 1, T.implode + 5]) {
			const u = (f - t0) / 7;
			if (u <= 0 || u >= 1) continue;
			ring(ctx, s.x, s.y, 60 + 340 * (1 - ease.inQuad(u)), 2 + 3 * u, COLORS.orangeBright, 0.7 * u * (1 - u) * 4 * 0.6);
		}
	}
};
