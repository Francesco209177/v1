import React from 'react';
import {FrameCanvas} from '../../../components/FrameCanvas';
import {drawGlow, withAlpha} from '../../../lib/canvas';
import {clamp, ease, hash, invLerp, lerp} from '../../../lib/math';
import {COLORS} from '../../../theme';
import {tokenWidth} from '../../components/TokenChip';
import {VP} from '../hook/timing';
import {GAP, SIZE, SLOTS, T} from './layout';
import {charAt, charX, departAt, FLIGHT, layerXf, rowY, scanBeam, splitP, toScreen} from './motion';
import {flightPos, flightU, PATHS} from './flight';
import {HOP, netState, projectNet} from './net';

/** Confini interni alle righe (tra due token consecutivi): lì si aprono le crepe di luce. */
const BOUNDS = SLOTS.filter((s) => !s.first).map((s) => {
	const a = SLOTS[s.i - 1];
	return {a: a.i, b: s.i, row: s.row, packed: s.leftEdge, spread: a.sx + tokenWidth(a.text, SIZE) / 2 + GAP / 2};
});

/**
 * Luce della scena TOKENS (canvas, coordinate schermo): pixel che ricompongono le lettere, raggio del
 * tokenizer con le tacche, crepe di luce e schegge al cue 180, scie dei token in volo e impulsi lungo
 * le connessioni della rete.
 */
export const TokenLight: React.FC<{abs: number}> = ({abs}) => {
	const draw = (ctx: CanvasRenderingContext2D): void => {
		ctx.globalCompositeOperation = 'lighter';
		ctx.lineCap = 'round';
		const L = layerXf(abs);

		// 1 · ricomposizione: ogni carattere arriva come un piccolo pixel di luce dalla direzione del tuffo
		if (abs < T.start + 30) {
			for (const s of SLOTS) {
				for (let j = 0; j < s.text.length; j++) {
					if (s.text[j] === ' ') continue;
					const t0 = charAt(s.i, j);
					const d = abs - t0;
					if (d < -7 || d > 6) continue;
					const c = toScreen(abs, {x: charX(s.i, j), y: s.py});
					if (d < 0) {
						// in arrivo: dalla periferia verso il carattere
						const e = ease.inQuad(1 - -d / 7);
						const dx = c.x - VP.x;
						const dy = c.y - VP.y;
						const k = 1 + 2.4 * (1 - e);
						const x = VP.x + dx * k;
						const y = VP.y + dy * k;
						const px = VP.x + dx * (k + 0.5);
						const py = VP.y + dy * (k + 0.5);
						ctx.strokeStyle = withAlpha(COLORS.orangeBright, 0.5 * e);
						ctx.lineWidth = 2;
						ctx.beginPath();
						ctx.moveTo(px, py);
						ctx.lineTo(x, y);
						ctx.stroke();
						drawGlow(ctx, x, y, 3.5, COLORS.orangeBright, 0.8 * e, COLORS.white);
					} else {
						const a = Math.exp(-d / 2.2);
						const q = 9 * L.s;
						ctx.fillStyle = withAlpha(COLORS.orangeHot, 0.55 * a);
						ctx.fillRect(c.x - q / 2, c.y - q / 2, q, q);
						drawGlow(ctx, c.x, c.y, 9 * L.s, COLORS.orange, 0.7 * a, COLORS.orangeHot);
					}
				}
			}
		}

		// 2 · raggio del tokenizer + tacche sui confini
		const beam = scanBeam(abs);
		const top = toScreen(abs, {x: 0, y: SLOTS[0].py - 70}).y;
		const bot = toScreen(abs, {x: 0, y: SLOTS[10].py + 70}).y;
		if (beam.a > 0.01) {
			const g = ctx.createLinearGradient(0, top - 60, 0, bot + 60);
			g.addColorStop(0, withAlpha(COLORS.orangeHot, 0));
			g.addColorStop(0.5, withAlpha(COLORS.orangeHot, 0.85 * beam.a));
			g.addColorStop(1, withAlpha(COLORS.orangeHot, 0));
			ctx.fillStyle = g;
			ctx.fillRect(beam.x - 1.5, top - 60, 3, bot - top + 120);
			const h = ctx.createLinearGradient(beam.x - 70, 0, beam.x + 70, 0);
			h.addColorStop(0, withAlpha(COLORS.orange, 0));
			h.addColorStop(0.5, withAlpha(COLORS.orange, 0.16 * beam.a));
			h.addColorStop(1, withAlpha(COLORS.orange, 0));
			ctx.fillStyle = h;
			ctx.fillRect(beam.x - 70, top - 40, 140, bot - top + 80);
		}
		const p = splitP(abs);
		if (abs >= T.scan && abs < T.split + 26) {
			for (const b of BOUNDS) {
				const c = toScreen(abs, {x: lerp(b.packed, b.spread, p), y: rowY(b.row, abs)});
				// tacca lasciata dal raggio, poi crepa piena sul cue
				const tick = abs < T.split ? clamp((beam.x - c.x) / 24) * 0.55 : 0;
				const crack = abs >= T.split ? Math.exp(-(abs - T.split) / 4.5) : 0;
				const a = Math.max(tick, crack);
				if (a < 0.01) continue;
				const hh = SIZE * L.s * (0.62 + 0.45 * crack);
				ctx.strokeStyle = withAlpha(COLORS.orange, 0.5 * a);
				ctx.lineWidth = 7 + 10 * crack;
				ctx.beginPath();
				ctx.moveTo(c.x, c.y - hh);
				ctx.lineTo(c.x, c.y + hh);
				ctx.stroke();
				ctx.strokeStyle = withAlpha(crack > 0 ? COLORS.white : COLORS.orangeHot, Math.min(1, 1.1 * a));
				ctx.lineWidth = 2 + 2 * crack;
				ctx.beginPath();
				ctx.moveTo(c.x, c.y - hh);
				ctx.lineTo(c.x, c.y + hh);
				ctx.stroke();
				if (crack > 0.02) {
					drawGlow(ctx, c.x, c.y, 26 * crack, COLORS.orangeBright, 0.55 * crack, COLORS.white);
					// schegge di luce che schizzano dalla crepa
					const d = abs - T.split;
					for (let k = 0; k < 6; k++) {
						const ang = (hash(b.b * 13 + k, 81) - 0.5) * 1.6 + (k % 2 ? Math.PI / 2 : -Math.PI / 2);
						const sp = 9 + 16 * hash(b.b * 13 + k, 82);
						const dist = sp * d * (1 - 0.035 * d);
						const x = c.x + Math.cos(ang) * dist * 0.6;
						const y = c.y + Math.sin(ang) * dist;
						const fa = Math.exp(-d / 6);
						ctx.strokeStyle = withAlpha(COLORS.orangeHot, 0.8 * fa);
						ctx.lineWidth = 2;
						ctx.beginPath();
						ctx.moveTo(x - Math.cos(ang) * sp * 0.4, y - Math.sin(ang) * sp * 0.7);
						ctx.lineTo(x, y);
						ctx.stroke();
						drawGlow(ctx, x, y, 2.6, COLORS.orangeHot, fa, COLORS.white);
					}
				}
			}
		}

		// 3 · token in volo verso la rete e impulsi lungo le connessioni
		if (abs >= T.intoNet - 1) {
			const ns = netState(abs);
			const proj = projectNet(ns.cam);
			const fade = 1 - ease.inOutSine(invLerp(255, 267, abs));
			for (const s of SLOTS) {
				const u = clamp((abs - departAt(s.i)) / FLIGHT);
				if (u <= 0) continue;
				if (u < 1) {
					const e = flightU(s.i, abs);
					const c = flightPos(s.i, abs, e);
					const prev = flightPos(s.i, abs, flightU(s.i, abs - 1.4));
					const a = clamp((u - 0.25) / 0.5);
					ctx.strokeStyle = withAlpha(COLORS.orangeBright, 0.7 * a);
					ctx.lineWidth = 3 + 5 * a;
					ctx.beginPath();
					ctx.moveTo(prev.x, prev.y);
					ctx.lineTo(c.x, c.y);
					ctx.stroke();
					drawGlow(ctx, c.x, c.y, 5 + 7 * a, COLORS.orangeBright, a, COLORS.white);
					continue;
				}
				// arrivato: impulso che salta di strato in strato
				const arr = departAt(s.i) + FLIGHT;
				const tau = abs - arr;
				const path = PATHS[s.i];
				const hop = Math.floor(tau / HOP);
				const fr = (tau - hop * HOP) / HOP;
				const land = Math.exp(-tau / 5);
				const n0 = proj[path[0]];
				if (n0.k) drawGlow(ctx, n0.x, n0.y, 10 + 22 * land, COLORS.orangeBright, (0.25 + 0.75 * land) * fade, COLORS.white);
				if (hop >= path.length - 1) continue;
				const A = proj[path[hop]];
				const B = proj[path[hop + 1]];
				if (!A.k || !B.k) continue;
				const e = ease.inOutSine(fr);
				const x = lerp(A.x, B.x, e);
				const y = lerp(A.y, B.y, e);
				const e0 = ease.inOutSine(Math.max(0, fr - 0.35));
				const x0 = lerp(A.x, B.x, e0);
				const y0 = lerp(A.y, B.y, e0);
				const k = Math.min(2.2, (A.k + B.k) / 2) * ns.cam.scale;
				ctx.strokeStyle = withAlpha(COLORS.orangeHot, 0.8 * fade);
				ctx.lineWidth = 2.5 + 3.5 * k;
				ctx.beginPath();
				ctx.moveTo(x0, y0);
				ctx.lineTo(x, y);
				ctx.stroke();
				drawGlow(ctx, x, y, 6 + 8 * k, COLORS.orangeBright, fade, COLORS.white);
				drawGlow(ctx, x, y, 18 + 16 * k, COLORS.orange, 0.25 * fade, COLORS.orangeBright);
				if (fr < 0.3 && hop > 0) drawGlow(ctx, A.x, A.y, 12 * k + 6, COLORS.orange, 0.6 * (1 - fr / 0.3) * fade, COLORS.orangeHot);
			}
		}
		ctx.globalCompositeOperation = 'source-over';
	};
	return <FrameCanvas frame={abs} draw={draw} />;
};
