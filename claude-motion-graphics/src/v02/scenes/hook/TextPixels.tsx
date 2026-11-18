import React, {useMemo} from 'react';
import {FrameCanvas} from '../../../components/FrameCanvas';
import {drawGlow, withAlpha} from '../../../lib/canvas';
import {clamp, ease, hash} from '../../../lib/math';
import {COLORS} from '../../../theme';
import {wordBoxes} from './ChatScreen';
import {DIVE_CENTER, hookPose, projectLaptop, screenToGroup} from './pose';
import {DIVE} from './timing';

/**
 * Il testo della chat si scioglie in "pixel/token" luminosi: particelle campionate sulle parole,
 * proiettate con la stessa camera del laptop e spinte verso l'esterno mentre la camera si tuffa.
 */
export const TextPixels: React.FC<{f: number}> = ({f}) => {
	const seeds = useMemo(() => {
		const out: {sx: number; sy: number; w: number; d: number; sz: number}[] = [];
		for (const b of wordBoxes()) {
			const n = Math.max(5, Math.round(b.w / 9));
			for (let k = 0; k < n; k++) {
				const id = b.i * 40 + k;
				out.push({sx: b.x + hash(id, 1) * b.w, sy: b.y + hash(id, 2) * b.h, w: b.i, d: hash(id, 3), sz: 0.6 + hash(id, 4) * 1.2});
			}
		}
		return out;
	}, []);
	if (f < DIVE - 4 || f > 104) return null;
	const pose = hookPose(f);
	const prev = hookPose(f - 1);
	const draw = (ctx: CanvasRenderingContext2D): void => {
		ctx.globalCompositeOperation = 'lighter';
		ctx.lineCap = 'round';
		for (const p of seeds) {
			const t = clamp((f - DIVE + 2 - p.w * 0.22 - p.d * 3) / 12);
			if (t <= 0) continue;
			const e = ease.inQuad(t);
			const g = screenToGroup(p.sx, p.sy);
			const A = projectLaptop(pose, g);
			const B = projectLaptop(prev, g);
			const dx = A.x - DIVE_CENTER.x;
			const dy = A.y - DIVE_CENTER.y;
			const len = Math.hypot(dx, dy) || 1;
			const push = (120 + 380 * p.d) * e;
			const x = A.x + (dx / len) * push;
			const y = A.y + (dy / len) * push;
			const px = B.x + (dx / len) * push * 0.75;
			const py = B.y + (dy / len) * push * 0.75;
			const a = clamp(t * 4) * (1 - clamp((t - 0.7) / 0.3) * 0.6);
			ctx.strokeStyle = withAlpha(p.d > 0.5 ? COLORS.orangeHot : COLORS.orangeBright, 0.75 * a);
			ctx.lineWidth = (1.5 + 2.5 * p.sz * e) * Math.min(3, A.k);
			ctx.beginPath();
			ctx.moveTo(px, py);
			ctx.lineTo(x, y);
			ctx.stroke();
			drawGlow(ctx, x, y, (1.6 + 2.2 * p.sz) * Math.min(3, A.k), COLORS.orangeBright, a, COLORS.white);
		}
		ctx.globalCompositeOperation = 'source-over';
	};
	return <FrameCanvas frame={f} draw={draw} />;
};
