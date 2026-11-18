import React from 'react';
import {FrameCanvas} from '../../../components/FrameCanvas';
import {drawGlow, withAlpha} from '../../../lib/canvas';
import {beatPulse, clamp, ease, hash, hit, prog, TAU} from '../../../lib/math';
import {COLORS} from '../../../theme';
import {ANSWER_TOKENS, answerSlot, PROMPT_TEXT} from './answer';
import {ALL_ROUTES, BOX, PCB, pointAt, RING_R, Route, ROUTES, routeLength, subPath} from './layout';
import {Cam, diagramLevel, HUB, loadP, procP, T} from './timing';

/** Flusso di pacchetti su un gruppo di tracciati. */
type Flow = {
	routes: Route[];
	/** direzione per corsia: 1 = dal primo all'ultimo punto, -1 = inverso */
	dir: number[];
	level: (f: number) => number;
	/** pacchetti per corsia */
	n: number;
	/** distanza percorsa (px) al frame f: monotona, accelera verso il taglio */
	dist: (f: number) => number;
	block?: boolean;
	seed: number;
};

const speedUp = (v0: number, from: number, acc: number) => (f: number) => v0 * f + acc * Math.max(0, f - from) ** 2;

const loadLevel = (f: number) => prog(f, T.loadStart - 2, 6, ease.outCubic) * (1 - prog(f, T.loadEnd - 4, 12, ease.inOutSine) * 0.85);
const procLevel = (f: number) => procP(f);

const FLOWS: Flow[] = [
	// CARICAMENTO: blocchi di pesi SSD → RAM
	{routes: ROUTES.bus, dir: [1, 1, 1], level: (f) => loadLevel(f) + 0.35 * procLevel(f), n: 4, dist: speedUp(9, 150, 0.05), block: true, seed: 1},
	// RAM → GPU (VRAM) e RAM → rete
	{routes: ROUTES.colR, dir: [1, 1], level: (f) => prog(f, 52, 8) * (1 - 0.8 * prog(f, T.loadEnd - 2, 10)) + procLevel(f) * 0.9, n: 3, dist: speedUp(8, 150, 0.05), block: true, seed: 2},
	{routes: ROUTES.spokeR, dir: [1], level: (f) => prog(f, 48, 8) * (1 - 0.7 * prog(f, T.loadEnd - 2, 10)) + procLevel(f), n: 4, dist: speedUp(8, 150, 0.06), seed: 3},
	// ELABORAZIONE: ping-pong memoria ↔ processori ↔ rete
	{routes: ROUTES.colR, dir: [-1, -1], level: (f) => procLevel(f) * 0.7, n: 2, dist: speedUp(10, 150, 0.06), seed: 4},
	{routes: ROUTES.spokeR, dir: [-1], level: (f) => procLevel(f) * 0.7, n: 3, dist: speedUp(9, 150, 0.06), seed: 5},
	{routes: ROUTES.spokeL, dir: [1], level: (f) => procLevel(f) * 0.8, n: 3, dist: speedUp(9, 150, 0.06), seed: 6},
	{routes: ROUTES.spokeL, dir: [-1], level: (f) => procLevel(f) * 0.6, n: 2, dist: speedUp(8, 150, 0.06), seed: 7},
	{routes: ROUTES.colL, dir: [1, -1], level: (f) => procLevel(f) * 0.8, n: 3, dist: speedUp(9, 150, 0.06), seed: 8},
	{routes: ROUTES.cpu, dir: [1, -1], level: (f) => procLevel(f), n: 3, dist: speedUp(7, 150, 0.06), seed: 9},
	{routes: ROUTES.gpu, dir: [-1, 1], level: (f) => procLevel(f), n: 4, dist: speedUp(8, 150, 0.06), seed: 10},
];

/** Quanto un tracciato è "acceso" (colore pieno) in questo istante. */
const litLevel = (r: Route, f: number): number => {
	const g = r.id.replace(/\d+$/, '');
	if (g === 'bus') return 0.25 + 0.75 * loadLevel(f) + 0.3 * procLevel(f);
	if (g === 'spokeR' || g === 'colR') return 0.2 + 0.6 * prog(f, 48, 10) * (1 - 0.5 * prog(f, T.loadEnd, 10)) + 0.6 * procLevel(f);
	if (g === 'input') return 0.3 + 0.9 * (hit(f, T.promptSend, 16) + 0.4 * procLevel(f));
	if (g === 'output') return 0.4 + 1.1 * hit(f, T.answer, 22) + 0.3 * procLevel(f);
	return 0.2 + 0.75 * procLevel(f);
};

const strokePath = (ctx: CanvasRenderingContext2D, pts: {x: number; y: number}[]): void => {
	ctx.beginPath();
	ctx.moveTo(pts[0].x, pts[0].y);
	for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
	ctx.stroke();
};

/**
 * Livello canvas del diagramma (piano del circuito, in coordinate camera):
 * piste PCB di sfondo, bus, anello del modello con avanzamento del caricamento, pacchetti di dati,
 * onde d'urto, token della richiesta e della risposta.
 */
export const Circuit: React.FC<{frame: number; abs: number; cam: Cam}> = ({frame: f, abs, cam}) => {
	const draw = (ctx: CanvasRenderingContext2D): void => {
		const lvl = diagramLevel(f);
		const beat = beatPulse(abs, 6);
		const energy = prog(f, T.cardIn, T.collapse - T.cardIn, ease.inQuad); // sale verso il taglio
		const showAll = 1 - prog(f, T.collapse + 2, 8, ease.inCubic);
		if (showAll <= 0.001) return;
		ctx.globalCompositeOperation = 'lighter';
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';

		// --- piste PCB di sfondo (parallasse: piano più lontano) ---
		{
			const sb = 1 + (cam.s - 1) * 0.8;
			ctx.save();
			ctx.translate(HUB.x + cam.tx * 0.6, HUB.y + cam.ty * 0.6);
			ctx.scale(sb, sb);
			ctx.translate(-HUB.x, -HUB.y);
			const pcbIn = prog(f, 4, 30, ease.outCubic);
			for (let i = 0; i < PCB.length; i++) {
				const p = PCB[i];
				const a = 0.075 * p.a * pcbIn * (0.55 + 0.45 * lvl) * showAll;
				ctx.strokeStyle = withAlpha(COLORS.orange, a);
				ctx.lineWidth = 1.4;
				strokePath(ctx, p.pts);
				if (p.via) {
					const e = p.pts[p.pts.length - 1];
					ctx.fillStyle = withAlpha(COLORS.orange, a * 1.6);
					ctx.beginPath();
					ctx.arc(e.x, e.y, 3.2, 0, TAU);
					ctx.fill();
				}
			}
			ctx.restore();
		}

		// --- camera del piano principale ---
		ctx.save();
		ctx.translate(HUB.x + cam.tx, HUB.y + cam.ty);
		ctx.scale(cam.s, cam.s);
		ctx.translate(-HUB.x, -HUB.y);

		// --- bus: base scura + luce ---
		for (const r of ALL_ROUTES) {
			const b = prog(f, r.build[0], r.build[1] - r.build[0], ease.inOutCubic);
			if (b <= 0.001) continue;
			const pts = subPath(r, 0, b);
			const lit = clamp(litLevel(r, f) + 0.25 * beat * procLevel(f) + 0.6 * energy * beat, 0, 1.6) * showAll;
			// alone largo
			ctx.strokeStyle = withAlpha(COLORS.orange, 0.06 * lit * (0.4 + 0.6 * lvl));
			ctx.lineWidth = r.w * 5;
			strokePath(ctx, pts);
			// pista
			ctx.strokeStyle = withAlpha(COLORS.orangeDeep, (0.55 + 0.25 * lit) * (0.35 + 0.65 * lvl) * showAll);
			ctx.lineWidth = r.w;
			strokePath(ctx, pts);
			ctx.strokeStyle = withAlpha(COLORS.orangeBright, 0.32 * lit * (0.35 + 0.65 * lvl));
			ctx.lineWidth = r.w * 0.5;
			strokePath(ctx, pts);
			// testina luminosa mentre il tracciato si costruisce
			if (b < 1) {
				const h = pointAt(r, b);
				drawGlow(ctx, h.x, h.y, 4.5, COLORS.orangeBright, 0.9, COLORS.white);
			}
			// pad alle estremità
			if (b > 0.98) {
				for (const e of [r.pts[0], r.pts[r.pts.length - 1]]) {
					ctx.fillStyle = withAlpha(COLORS.orangeBright, (0.35 + 0.3 * lit) * (0.4 + 0.6 * lvl) * showAll);
					ctx.beginPath();
					ctx.arc(e.x, e.y, r.w * 1.3, 0, TAU);
					ctx.fill();
				}
			}
		}

		// --- anello del modello: avanzamento del caricamento ---
		{
			const ringIn = prog(f, 2, 26, ease.inOutCubic);
			const lp = loadP(f);
			const done = hit(f, T.loadEnd, 18);
			const a0 = -Math.PI / 2;
			ctx.strokeStyle = withAlpha(COLORS.white, 0.1 * ringIn * (0.5 + 0.5 * lvl) * showAll);
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.arc(HUB.x, HUB.y, RING_R, a0, a0 + TAU * ringIn);
			ctx.stroke();
			if (lp > 0.002) {
				ctx.strokeStyle = withAlpha(COLORS.orangeBright, (0.75 + 0.25 * done) * (0.4 + 0.6 * lvl) * showAll);
				ctx.lineWidth = 4 + 4 * done;
				ctx.beginPath();
				ctx.arc(HUB.x, HUB.y, RING_R, a0, a0 + TAU * lp);
				ctx.stroke();
				ctx.strokeStyle = withAlpha(COLORS.orange, 0.12 * (0.4 + 0.6 * lvl) * showAll);
				ctx.lineWidth = 18;
				ctx.beginPath();
				ctx.arc(HUB.x, HUB.y, RING_R, a0, a0 + TAU * lp);
				ctx.stroke();
				if (lp < 1) {
					const ha = a0 + TAU * lp;
					drawGlow(ctx, HUB.x + Math.cos(ha) * RING_R, HUB.y + Math.sin(ha) * RING_R, 7, COLORS.orangeBright, 1, COLORS.white);
				}
			}
			// tacche che ruotano lentamente
			const ticks = 60;
			const rot = abs / 240;
			for (let i = 0; i < ticks; i++) {
				const a = rot + (i / ticks) * TAU;
				if (i / ticks >= ringIn) continue;
				const major = i % 5 === 0;
				const r0 = RING_R + 12;
				const r1 = r0 + (major ? 12 : 6);
				const k = 0.12 + 0.25 * beat * procLevel(f) + 0.35 * done + 0.25 * energy * beat;
				ctx.strokeStyle = withAlpha(COLORS.orange, k * (0.4 + 0.6 * lvl) * showAll * (major ? 1.6 : 1));
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.moveTo(HUB.x + Math.cos(a) * r0, HUB.y + Math.sin(a) * r0);
				ctx.lineTo(HUB.x + Math.cos(a) * r1, HUB.y + Math.sin(a) * r1);
				ctx.stroke();
			}
		}

		// --- pacchetti di dati ---
		for (const fl of FLOWS) {
			const L0 = fl.level(f) * showAll;
			if (L0 <= 0.01) continue;
			fl.routes.forEach((r, li) => {
				const b = prog(f, r.build[0], r.build[1] - r.build[0]);
				if (b < 0.99) return;
				const L = routeLength(r);
				const d = fl.dist(f);
				for (let k = 0; k < fl.n; k++) {
					const u = ((((d / L + k / fl.n + hash(fl.seed * 31 + li, k) * 0.35) % 1) + 1) % 1);
					const t = fl.dir[li] > 0 ? u : 1 - u;
					const fade = Math.pow(Math.sin(Math.PI * u), 0.6);
					const a = L0 * fade * (0.45 + 0.55 * lvl);
					if (a < 0.02) continue;
					const trail = Math.min(0.45, 46 / L);
					const tt = fl.dir[li] > 0 ? t - trail : t + trail;
					const head = pointAt(r, t);
					const tail = pointAt(r, tt);
					const g = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
					g.addColorStop(0, withAlpha(COLORS.orange, 0));
					g.addColorStop(1, withAlpha(COLORS.orangeHot, 0.9 * a));
					ctx.strokeStyle = g;
					ctx.lineWidth = fl.block ? 5 : 3.5;
					ctx.beginPath();
					ctx.moveTo(tail.x, tail.y);
					ctx.lineTo(head.x, head.y);
					ctx.stroke();
					if (fl.block) {
						const vx = head.x - tail.x;
						const vert = Math.abs(vx) < 0.5;
						ctx.fillStyle = withAlpha(COLORS.orangeHot, a);
						if (vert) ctx.fillRect(head.x - 5, head.y - 7, 10, 14);
						else ctx.fillRect(head.x - 7, head.y - 5, 14, 10);
					}
					drawGlow(ctx, head.x, head.y, fl.block ? 6 : 5, COLORS.orangeBright, a, COLORS.white);
				}
			});
		}

		// --- onde d'urto: modello caricato (105) e risposta (150) ---
		for (const [at, power] of [
			[T.loadEnd, 0.7],
			[T.answer, 1],
		] as const) {
			const age = f - at;
			if (age < 0 || age > 26) continue;
			const p = ease.outCubic(age / 26);
			const r = RING_R + (power > 0.8 ? 360 : 200) * p;
			ctx.strokeStyle = withAlpha(COLORS.orangeHot, power * (1 - p) * 0.8 * lvl);
			ctx.lineWidth = 2 + 10 * (1 - p);
			ctx.beginPath();
			ctx.arc(HUB.x, HUB.y, r, 0, TAU);
			ctx.stroke();
		}

		// --- la richiesta si scompone in token che entrano nella rete ---
		{
			const n = PROMPT_TEXT.length;
			for (let i = 0; i < n; i++) {
				const start = T.promptSend + (i % 6) * 0.8 + hash(i, 41) * 2;
				const age = f - start;
				if (age < 0 || age > 14) continue;
				const p = ease.inCubic(age / 14);
				const x0 = BOX.prompt.x - BOX.prompt.w / 2 + 22 + (i / n) * (BOX.prompt.w - 44);
				const y0 = BOX.prompt.y;
				const x = x0 + (HUB.x - x0) * p;
				const y = y0 + (HUB.y - RING_R + 40 - y0) * p;
				drawGlow(ctx, x, y, 3.5 + 2 * (1 - p), COLORS.orangeBright, (1 - p * 0.6) * lvl, COLORS.white);
			}
		}

		// --- la risposta: token che escono dalla rete e raggiungono il fumetto ---
		{
			for (let i = 0; i < ANSWER_TOKENS.length; i++) {
				const s = answerSlot(i);
				const age = f - s.launch;
				if (age < 0 || age > s.flight + 2) continue;
				const p = ease.inOutCubic(clamp(age / s.flight));
				const x0 = HUB.x;
				const y0 = HUB.y + RING_R * 0.7;
				// arco: scende e si apre verso lo slot del token
				const mx = x0 + (s.x - x0) * 0.15;
				const my = s.y - 40;
				const u = 1 - p;
				const x = u * u * x0 + 2 * u * p * mx + p * p * s.x;
				const y = u * u * y0 + 2 * u * p * my + p * p * s.y;
				const a = (age > s.flight ? 1 - (age - s.flight) / 2 : 1) * lvl;
				drawGlow(ctx, x, y, 6, COLORS.orangeBright, a, COLORS.white);
				// scia
				const pb = ease.inOutCubic(clamp((age - 2) / s.flight));
				const ub = 1 - pb;
				const xb = ub * ub * x0 + 2 * ub * pb * mx + pb * pb * s.x;
				const yb = ub * ub * y0 + 2 * ub * pb * my + pb * pb * s.y;
				ctx.strokeStyle = withAlpha(COLORS.orangeHot, 0.5 * a);
				ctx.lineWidth = 3;
				ctx.beginPath();
				ctx.moveTo(xb, yb);
				ctx.lineTo(x, y);
				ctx.stroke();
			}
		}

		ctx.restore();
		ctx.globalCompositeOperation = 'source-over';
	};
	return <FrameCanvas frame={f} additive draw={draw} />;
};
