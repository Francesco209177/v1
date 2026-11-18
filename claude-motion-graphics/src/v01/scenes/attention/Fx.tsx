import React from 'react';
import {FrameCanvas} from '../../../components/FrameCanvas';
import {drawGlow, withAlpha} from '../../../lib/canvas';
import {clamp, ease, hash, prog, TAU} from '../../../lib/math';
import {COLORS} from '../../../theme';
import {v1NetYaw} from '../../timeline';
import {emergeP, emergeStart, flightPos} from './chips';
import {N_TOK} from './data';
import {chipBottom, Cubic, cubicAt} from './geom';
import {CHIP_X, CUT_POINT, LAYER_NODES, netAt, NetPose, projectNode, slot, T, toScreen} from './layout';

const slotXs = () => CHIP_X.map((x, i) => ({x: x + (i < 6 ? 0 : 0.5), i}));

/** Beat su cui un pacchetto di energia parte da ogni token verso la rete (frame locali). */
const PACKETS = [165, 180, 195];

/** Neurone d'ingresso di ciascun token: secondo strato (più largo), abbinato per posizione orizzontale. */
const STREAM_NODE: number[] = (() => {
	const f = 175;
	const cam = netAt(f, 0);
	const yaw = v1NetYaw(f + 270);
	const nodes = LAYER_NODES[1].map((n) => ({n, ...projectNode(n, cam, yaw)})).sort((a, b) => a.x - b.x);
	const byX = slotXs().sort((a, b) => a.x - b.x);
	const out: number[] = new Array(N_TOK).fill(0);
	byX.forEach(({i}, r) => {
		out[i] = nodes[Math.round((r / (N_TOK - 1)) * (nodes.length - 1))].n;
	});
	return out;
})();

const streamCurve = (f: number, i: number, cam: NetPose, yaw: number): Cubic => {
	const s = slot(f, i);
	const a = toScreen(f, {x: s.x, y: chipBottom(s.y) - 4});
	const e = projectNode(STREAM_NODE[i], cam, yaw);
	const dy = e.y - a.y;
	return [a, {x: a.x, y: a.y + 0.55 * dy}, {x: e.x, y: e.y - 0.45 * dy}, {x: e.x, y: e.y}];
};

/**
 * Effetti su canvas: scie dei token che escono dalla rete, flussi token → rete (strato dopo strato),
 * scie convergenti e punto di luce finale con flare orizzontale (il CutFlash globale colpisce a 480, y 760).
 */
export const FxCanvas: React.FC<{f: number; abs: number}> = ({f, abs}) => {
	const draw = (ctx: CanvasRenderingContext2D): void => {
		ctx.globalCompositeOperation = 'lighter';
		ctx.lineCap = 'round';
		const yaw = v1NetYaw(abs);
		const cam = netAt(f, 0);

		// --- 1. riemersione: i neuroni si caricano, poi la scia del volo
		if (f < 45) {
			for (let i = 0; i < N_TOK; i++) {
				const s0 = emergeStart(i);
				const charge = prog(f, Math.max(0.5, s0 - 5), 5) * (1 - prog(f, s0 + 1, 6));
				if (charge > 0) {
					const p0 = flightPos(f, i, 0);
					drawGlow(ctx, p0.x, p0.y, 6 + 8 * charge, COLORS.orangeBright, charge, COLORS.white);
				}
				const p = emergeP(f, i);
				if (p <= 0.01 || p >= 0.995) continue;
				const tail = Math.max(0, p - 0.32);
				const n = 14;
				for (let s = 0; s < n; s++) {
					const t0 = tail + ((p - tail) * s) / n;
					const t1 = tail + ((p - tail) * (s + 1)) / n;
					const A = flightPos(f, i, t0);
					const B = flightPos(f, i, t1);
					const k = (s + 1) / n;
					ctx.strokeStyle = withAlpha(k > 0.7 ? COLORS.orangeHot : COLORS.orange, 0.75 * k * (1 - p));
					ctx.lineWidth = 2 + 9 * k * (1 - p * 0.6);
					ctx.beginPath();
					ctx.moveTo(A.x, A.y);
					ctx.lineTo(B.x, B.y);
					ctx.stroke();
				}
				// scintille che si staccano
				for (let m = 0; m < 4; m++) {
					const t = Math.max(0, p - 0.06 - hash(i, m) * 0.25);
					const q = flightPos(f, i, t);
					const ox = (hash(i, m + 9) - 0.5) * 30;
					drawGlow(ctx, q.x + ox, q.y, 1.6 + 1.6 * hash(m, i), COLORS.orangeBright, 0.7 * (1 - p), COLORS.white);
				}
			}
		}

		// --- 2. elaborazione: i token entrano nella rete, strato dopo strato
		const fwd = prog(f, T.process, 16);
		const energy = prog(f, T.process, T.collapse - T.process, ease.inQuad);
		const out = prog(f, T.collapse, T.end - T.collapse, ease.inCubic);
		if (f >= T.process && out < 1) {
			for (let i = 0; i < N_TOK; i++) {
				const sc = T.process + i * 1.3 + 2;
				if (f < sc) continue;
				const c = streamCurve(f, i, cam, yaw);
				const grow = prog(f, sc, 10, ease.outCubic);
				// filo guida
				ctx.strokeStyle = withAlpha(COLORS.orange, (0.13 + 0.17 * energy) * fwd * (1 - out));
				ctx.lineWidth = 2.4;
				ctx.beginPath();
				for (let s = 0; s <= 24; s++) {
					const p = cubicAt(c, (s / 24) * grow);
					if (s === 0) ctx.moveTo(p.x, p.y);
					else ctx.lineTo(p.x, p.y);
				}
				ctx.stroke();
				// flusso continuo (sempre più fitto)
				const nPart = 3 + Math.round(3 * energy);
				for (let m = 0; m < nPart; m++) {
					const t = ((((f - sc) / (16 - 5 * energy) + m / nPart + hash(i, m) * 0.2) % 1) + 1) % 1;
					if (t > grow) continue;
					const p = cubicAt(c, t);
					drawGlow(ctx, p.x, p.y, 3 + 2 * energy, COLORS.orangeBright, Math.sin(Math.PI * t) * (0.7 + 0.3 * energy) * (1 - out), COLORS.white);
				}
				// pacchetti sul beat
				for (const b of PACKETS) {
					const tt = (f - b - i * 0.35) / 10;
					if (tt < 0 || tt > 1) continue;
					const e = ease.inOutSine(tt);
					for (let s = 0; s < 5; s++) {
						const p = cubicAt(c, clamp(e - s * 0.04));
						drawGlow(ctx, p.x, p.y, 8.5 - s * 1.2, COLORS.orangeHot, (1 - s / 5) * (1 - out), COLORS.white);
					}
				}
			}
			// cascata negli strati della rete dopo ogni pacchetto
			for (const b of PACKETS) {
				for (let l = 0; l < LAYER_NODES.length; l++) {
					const tl = b + 10 + l * 2.5;
					const it = Math.exp(-((f - tl) ** 2) / 4) * (1 - out);
					if (it < 0.03) continue;
					for (const n of LAYER_NODES[l]) {
						const P = projectNode(n, cam, yaw);
						drawGlow(ctx, P.x, P.y, (6 + 4 * energy) * P.k * cam.scale + 1.5, COLORS.orangeHot, it * 0.75, COLORS.white);
					}
				}
			}
		}

		// --- 3. collasso: scie convergenti e punto di luce
		const from = T.collapse - 14;
		if (f >= from) {
			const c = CUT_POINT;
			const N = 100;
			for (let i = 0; i < N; i++) {
				const start = from + Math.sqrt(hash(i, 1)) * (T.end - from - 3);
				const life = 5 + hash(i, 2) * 6;
				const q = (f - start) / life;
				if (q < 0 || q > 1) continue;
				const a = hash(i, 3) * TAU;
				const R = 520 + hash(i, 4) * 520;
				const p = ease.inCubic(q);
				const r = R * (1 - p);
				const len = 30 + 260 * p;
				const x = c.x + Math.cos(a) * r;
				const y = c.y + Math.sin(a) * r * 0.9;
				const xb = c.x + Math.cos(a) * (r + len);
				const yb = c.y + Math.sin(a) * (r + len) * 0.9;
				const al = Math.sin(Math.PI * q) * (0.35 + 0.65 * prog(f, from, T.end - from));
				const g = ctx.createLinearGradient(xb, yb, x, y);
				g.addColorStop(0, withAlpha(COLORS.orange, 0));
				g.addColorStop(1, withAlpha(COLORS.orangeHot, 0.8 * al));
				ctx.strokeStyle = g;
				ctx.lineWidth = 1.6 + 1.6 * hash(i, 5) + 1.5 * p;
				ctx.beginPath();
				ctx.moveTo(xb, yb);
				ctx.lineTo(x, y);
				ctx.stroke();
			}
			const k = prog(f, T.collapse, T.end - T.collapse, ease.inQuad);
			if (k > 0) {
				drawGlow(ctx, c.x, c.y, 10 + 36 * k, COLORS.orange, 0.5 + 0.5 * k, COLORS.orangeHot);
				drawGlow(ctx, c.x, c.y, 4 + 13 * k, COLORS.orangeHot, clamp(0.6 + k), COLORS.white);
				const w = 120 + 720 * k;
				const g = ctx.createLinearGradient(c.x - w, c.y, c.x + w, c.y);
				g.addColorStop(0, withAlpha(COLORS.orange, 0));
				g.addColorStop(0.5, withAlpha(COLORS.orangeHot, 0.9 * k));
				g.addColorStop(1, withAlpha(COLORS.orange, 0));
				ctx.fillStyle = g;
				ctx.fillRect(c.x - w, c.y - 1.5 - 2 * k, w * 2, 3 + 4 * k);
			}
		}
		ctx.globalCompositeOperation = 'source-over';
	};
	return <FrameCanvas frame={f} additive draw={draw} />;
};
