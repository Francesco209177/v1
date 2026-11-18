import React from 'react';
import {FrameCanvas} from '../../../components/FrameCanvas';
import {drawGlow, withAlpha} from '../../../lib/canvas';
import {clamp, ease, hash, prog, TAU} from '../../../lib/math';
import {COLORS} from '../../../theme';
import {Cam, HUB, T} from './timing';

/**
 * Energia verso il taglio: scie che convergono verso il centro (moto con stiramento),
 * poi tutto si raccoglie in un punto di luce sul quale parte il CutFlash globale (510).
 */
export const CollapseLight: React.FC<{f: number; cam: Cam}> = ({f, cam}) => {
	const from = T.collapse - 18;
	if (f < from) return null;
	const draw = (ctx: CanvasRenderingContext2D): void => {
		ctx.globalCompositeOperation = 'lighter';
		ctx.lineCap = 'round';
		const c = {x: HUB.x + cam.tx, y: HUB.y + cam.ty};
		// scie convergenti, sempre più fitte
		const N = 110;
		for (let i = 0; i < N; i++) {
			// partenze sempre più fitte verso il taglio
			const start = from + Math.sqrt(hash(i, 1)) * (T.end - from - 4);
			const life = 6 + hash(i, 2) * 6;
			const q = (f - start) / life;
			if (q < 0 || q > 1) continue;
			const a = hash(i, 3) * TAU;
			const R = 560 + hash(i, 4) * 480;
			const p = ease.inCubic(q);
			const r = R * (1 - p);
			const len = 30 + 260 * p;
			const x = c.x + Math.cos(a) * r;
			const y = c.y + Math.sin(a) * r * 0.92;
			const xb = c.x + Math.cos(a) * (r + len);
			const yb = c.y + Math.sin(a) * (r + len) * 0.92;
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
		// punto di luce finale
		const k = prog(f, T.collapse, T.end - T.collapse, ease.inQuad);
		if (k > 0) {
			drawGlow(ctx, c.x, c.y, 10 + 34 * k, COLORS.orange, 0.5 + 0.5 * k, COLORS.orangeHot);
			drawGlow(ctx, c.x, c.y, 4 + 12 * k, COLORS.orangeHot, clamp(0.6 + k), COLORS.white);
			// flare anamorfico orizzontale
			const w = 120 + 700 * k;
			const g = ctx.createLinearGradient(c.x - w, c.y, c.x + w, c.y);
			g.addColorStop(0, withAlpha(COLORS.orange, 0));
			g.addColorStop(0.5, withAlpha(COLORS.orangeHot, 0.85 * k));
			g.addColorStop(1, withAlpha(COLORS.orange, 0));
			ctx.fillStyle = g;
			ctx.fillRect(c.x - w, c.y - 1.5 - 2 * k, w * 2, 3 + 4 * k);
		}
		ctx.globalCompositeOperation = 'source-over';
	};
	return <FrameCanvas frame={f} additive draw={draw} />;
};
