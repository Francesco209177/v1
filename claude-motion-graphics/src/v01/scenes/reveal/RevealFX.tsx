import React from 'react';
import {FrameCanvas} from '../../../components/FrameCanvas';
import {drawGlow, withAlpha} from '../../../lib/canvas';
import {clamp, ease, hash, prog, TAU} from '../../../lib/math';
import {COLORS} from '../../../theme';
import {LAYOUT, R} from './data';

/**
 * Luce della seconda metà: onda d'urto e schegge sul colpo del titolo (780), scintille sul blocco di PREVEDE. (795),
 * braci che salgono lente nella cartolina finale (niente è mai fermo).
 */
export const RevealFX: React.FC<{f: number}> = ({f}) => {
	const draw = (ctx: CanvasRenderingContext2D): void => {
		ctx.globalCompositeOperation = 'lighter';
		ctx.lineCap = 'round';
		// onda d'urto del titolo, dal centro della rete
		const q = clamp((f - R.title) / 20);
		if (f >= R.title && q < 1) {
			const e = ease.outExpo(q);
			const rr = 60 + 1100 * e;
			ctx.beginPath();
			ctx.ellipse(540, LAYOUT.titleY1, rr, rr * 0.42, 0, 0, TAU);
			ctx.strokeStyle = withAlpha(COLORS.orange, 0.22 * (1 - q) ** 2);
			ctx.lineWidth = 26 * (1 - q) + 4;
			ctx.stroke();
			ctx.strokeStyle = withAlpha(COLORS.orangeHot, 0.6 * (1 - q) ** 2);
			ctx.lineWidth = 1.5 + 3 * (1 - q);
			ctx.stroke();
			// schegge radiali
			for (let i = 0; i < 60; i++) {
				const a = hash(i, 61) * TAU;
				const life = 8 + hash(i, 62) * 12;
				const t = clamp((f - R.title) / life);
				if (t >= 1) continue;
				const r1 = 80 + (500 + 600 * hash(i, 63)) * ease.outCubic(t);
				const len = (30 + 160 * hash(i, 64)) * (1 - t);
				const x1 = 540 + Math.cos(a) * r1;
				const y1 = LAYOUT.titleY1 + Math.sin(a) * r1 * 0.55;
				const x0 = 540 + Math.cos(a) * (r1 - len);
				const y0 = LAYOUT.titleY1 + Math.sin(a) * (r1 - len) * 0.55;
				const g = ctx.createLinearGradient(x0, y0, x1, y1);
				g.addColorStop(0, withAlpha(COLORS.orange, 0));
				g.addColorStop(1, withAlpha(COLORS.orangeHot, 0.8 * (1 - t)));
				ctx.strokeStyle = g;
				ctx.lineWidth = 1.5 + 2 * hash(i, 65);
				ctx.beginPath();
				ctx.moveTo(x0, y0);
				ctx.lineTo(x1, y1);
				ctx.stroke();
			}
		}
		// scintille sul blocco di PREVEDE.
		const q2 = clamp((f - R.prevede) / 16);
		if (f >= R.prevede && q2 < 1) {
			for (let i = 0; i < 40; i++) {
				const x = 140 + hash(i, 71) * 800;
				const vy = -(2 + 6 * hash(i, 72));
				const vx = (hash(i, 73) - 0.5) * 8;
				const d = f - R.prevede;
				drawGlow(ctx, x + vx * d, LAYOUT.titleY2 + (hash(i, 74) - 0.5) * 90 + vy * d + 0.25 * d * d, 2 + 2 * hash(i, 75), COLORS.orangeBright, 0.9 * (1 - q2), COLORS.white);
			}
		}
		// braci che salgono (dal titolo in poi)
		const on = prog(f, R.title, 20);
		if (on > 0) {
			for (let i = 0; i < 46; i++) {
				const sp = 1.2 + 2.4 * hash(i, 81);
				const span = 1500;
				const y = 1500 - ((hash(i, 82) * span + (f - R.title) * sp) % span);
				const x = 60 + hash(i, 83) * 960 + Math.sin((f + i * 17) / 26) * 16;
				const tw = 0.5 + 0.5 * Math.sin(f / 7 + i * 2.1);
				const fadeEdge = clamp((y - 200) / 200) * clamp((1450 - y) / 200);
				drawGlow(ctx, x, y, 1.6 + 2.2 * hash(i, 84), i % 3 ? COLORS.orange : COLORS.orangeBright, (0.25 + 0.45 * tw) * on * fadeEdge, COLORS.orangeHot);
			}
		}
		ctx.globalCompositeOperation = 'source-over';
	};
	return <FrameCanvas frame={f} additive draw={draw} />;
};
