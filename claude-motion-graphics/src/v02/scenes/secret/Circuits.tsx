import React, {useMemo} from 'react';
import {FrameCanvas} from '../../../components/FrameCanvas';
import {drawGlow, withAlpha} from '../../../lib/canvas';
import {clamp, ease, hash, invLerp, lerp} from '../../../lib/math';
import {COLORS} from '../../../theme';
import {LOADED, T} from './timing';

type P = {x: number; y: number};
type Bundle = {pts: P[]; n: number; gap: number; at: number; dur: number; data?: boolean};

/**
 * Piste del circuito stampato (coordinate del frame): fasci di linee ad angolo retto con smussi a 45°,
 * che dai bordi convergono verso la "camera" della rete. I fasci `data` collegano l'SSD alla rete.
 */
const BUNDLES: Bundle[] = [
	{pts: [{x: -30, y: 300}, {x: 150, y: 300}, {x: 150, y: 520}, {x: 290, y: 520}], n: 4, gap: 16, at: 0, dur: 26},
	{pts: [{x: 1110, y: 360}, {x: 930, y: 360}, {x: 930, y: 560}, {x: 795, y: 560}], n: 4, gap: 16, at: 3, dur: 26},
	{pts: [{x: -30, y: 930}, {x: 110, y: 930}, {x: 110, y: 700}, {x: 290, y: 700}], n: 3, gap: 16, at: 6, dur: 26},
	{pts: [{x: 1110, y: 880}, {x: 970, y: 880}, {x: 970, y: 690}, {x: 795, y: 690}], n: 3, gap: 16, at: 8, dur: 26},
	{pts: [{x: 420, y: -30}, {x: 420, y: 170}, {x: 490, y: 170}, {x: 490, y: 340}], n: 3, gap: 16, at: 2, dur: 24},
	{pts: [{x: 720, y: -30}, {x: 720, y: 200}, {x: 600, y: 200}, {x: 600, y: 340}], n: 2, gap: 16, at: 5, dur: 24},
	// SSD → rete (si disegnano quando arriva l'SSD)
	{pts: [{x: 205, y: 1080}, {x: 205, y: 900}, {x: 380, y: 900}, {x: 380, y: 815}], n: 3, gap: 15, at: T.slabIn + 4, dur: 20, data: true},
	{pts: [{x: 875, y: 1080}, {x: 875, y: 900}, {x: 700, y: 900}, {x: 700, y: 815}], n: 3, gap: 15, at: T.slabIn + 6, dur: 20, data: true},
];

const offsetPolyline = (pts: P[], d: number): P[] => {
	const nrm = (a: P, b: P): P => {
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const l = Math.hypot(dx, dy) || 1;
		return {x: -dy / l, y: dx / l};
	};
	return pts.map((p, k) => {
		const n1 = k > 0 ? nrm(pts[k - 1], p) : null;
		const n2 = k < pts.length - 1 ? nrm(p, pts[k + 1]) : null;
		const nx = (n1?.x ?? 0) + (n2?.x ?? 0);
		const ny = (n1?.y ?? 0) + (n2?.y ?? 0);
		return {x: p.x + d * nx, y: p.y + d * ny};
	});
};

/** Smussa gli angoli a 45° (look da PCB). */
const chamfer = (pts: P[], c: number): P[] => {
	const out: P[] = [pts[0]];
	for (let k = 1; k < pts.length - 1; k++) {
		const a = pts[k - 1];
		const p = pts[k];
		const b = pts[k + 1];
		const l1 = Math.hypot(p.x - a.x, p.y - a.y) || 1;
		const l2 = Math.hypot(b.x - p.x, b.y - p.y) || 1;
		const cc = Math.min(c, l1 / 2, l2 / 2);
		out.push({x: p.x - ((p.x - a.x) / l1) * cc, y: p.y - ((p.y - a.y) / l1) * cc});
		out.push({x: p.x + ((b.x - p.x) / l2) * cc, y: p.y + ((b.y - p.y) / l2) * cc});
	}
	out.push(pts[pts.length - 1]);
	return out;
};

type Trace = {pts: P[]; cum: number[]; len: number; at: number; dur: number; data: boolean; id: number};

const buildTraces = (): Trace[] => {
	const out: Trace[] = [];
	BUNDLES.forEach((b, bi) => {
		for (let i = 0; i < b.n; i++) {
			const pts = chamfer(offsetPolyline(b.pts, (i - (b.n - 1) / 2) * b.gap), 16);
			const cum = [0];
			for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
			out.push({pts, cum, len: cum[cum.length - 1], at: b.at + i * 2, dur: b.dur, data: !!b.data, id: bi * 10 + i});
		}
	});
	return out;
};

const pointAt = (t: Trace, d: number): P => {
	const dd = clamp(d, 0, t.len);
	let k = 1;
	while (k < t.cum.length - 1 && t.cum[k] < dd) k++;
	const seg = t.cum[k] - t.cum[k - 1] || 1;
	const u = (dd - t.cum[k - 1]) / seg;
	return {x: lerp(t.pts[k - 1].x, t.pts[k].x, u), y: lerp(t.pts[k - 1].y, t.pts[k].y, u)};
};

const strokeUpTo = (ctx: CanvasRenderingContext2D, t: Trace, d: number): void => {
	ctx.beginPath();
	ctx.moveTo(t.pts[0].x, t.pts[0].y);
	for (let k = 1; k < t.pts.length; k++) {
		if (t.cum[k] <= d) ctx.lineTo(t.pts[k].x, t.pts[k].y);
		else {
			const p = pointAt(t, d);
			ctx.lineTo(p.x, p.y);
			break;
		}
	}
	ctx.stroke();
};

/** Circuito che si disegna da solo, vias che si accendono, impulsi di dati; esplosione di luce a LOADED. */
export const Circuits: React.FC<{L: number; opacity: number}> = ({L, opacity}) => {
	const traces = useMemo(buildTraces, []);
	if (opacity <= 0.003) return null;
	// lieve spinta in avanti del piano del circuito (la camera continua ad avanzare)
	const zoom = lerp(0.93, 1.05, ease.outCubic(invLerp(0, 150, L)));
	const loadHit = L >= LOADED ? Math.exp(-(L - LOADED) / 9) : 0;
	const draw = (ctx: CanvasRenderingContext2D): void => {
		ctx.translate(540, 700);
		ctx.scale(zoom, zoom);
		ctx.translate(-540, -700);
		ctx.globalCompositeOperation = 'lighter';
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		for (const t of traces) {
			const p = ease.inOutCubic(clamp((L - T.circuitsIn - t.at) / t.dur));
			if (p <= 0) continue;
			const d = p * t.len;
			const boost = t.data ? loadHit : loadHit * 0.5;
			// alone + linea
			ctx.strokeStyle = withAlpha(COLORS.orange, (0.07 + 0.2 * boost) * opacity);
			ctx.lineWidth = 7;
			strokeUpTo(ctx, t, d);
			ctx.strokeStyle = withAlpha(t.data ? COLORS.orangeBright : COLORS.orange, (0.42 + 0.5 * boost) * opacity);
			ctx.lineWidth = 2;
			strokeUpTo(ctx, t, d);
			// testa luminosa mentre la pista si disegna
			if (p < 1) {
				const h = pointAt(t, d);
				drawGlow(ctx, h.x, h.y, 5, COLORS.orangeBright, 0.95 * opacity, COLORS.white);
			}
			// via all'estremità: anello che "scatta" all'arrivo
			const arr = clamp((L - T.circuitsIn - t.at - t.dur) / 8);
			if (arr > 0) {
				const end = t.pts[t.pts.length - 1];
				const pop = ease.outBack(arr);
				ctx.strokeStyle = withAlpha(COLORS.orangeBright, (0.85 + 0.15 * boost) * opacity);
				ctx.lineWidth = 2.2;
				ctx.beginPath();
				ctx.arc(end.x, end.y, 6.5 * pop, 0, Math.PI * 2);
				ctx.stroke();
				drawGlow(ctx, end.x, end.y, 3 + 3 * (1 - arr) + 3 * boost, COLORS.orangeBright, (0.6 + 0.4 * (1 - arr)) * opacity, COLORS.orangeHot);
			}
			// impulsi di dati lungo le piste completate (verso la rete)
			if (p >= 1) {
				const period = 34 + Math.floor(hash(t.id, 3) * 26);
				const ph = (((L + hash(t.id, 4) * period) % period) + period) % period / period;
				const q = pointAt(t, ph * t.len);
				drawGlow(ctx, q.x, q.y, 2.6, COLORS.orangeHot, Math.sin(Math.PI * ph) * 0.8 * opacity, COLORS.white);
			}
			// onda di caricamento: SSD → rete a LOADED
			if (t.data && L >= LOADED && L < LOADED + 22) {
				const w = ease.outCubic((L - LOADED) / 16);
				for (const lag of [0, 0.08, 0.16]) {
					const q = pointAt(t, clamp(w - lag) * t.len);
					drawGlow(ctx, q.x, q.y, 6 - lag * 20, COLORS.orangeHot, (1 - lag * 3) * opacity * (1 - clamp((L - LOADED - 14) / 8)), COLORS.white);
				}
			}
		}
		ctx.globalCompositeOperation = 'source-over';
	};
	return <FrameCanvas draw={draw} />;
};
