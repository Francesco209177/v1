import React from 'react';
import {FrameCanvas} from '../../../components/FrameCanvas';
import {drawGlow, withAlpha} from '../../../lib/canvas';
import {clamp, ease, hash, prog} from '../../../lib/math';
import {alpha, COLORS, FONTS} from '../../../theme';
import {focusEnv} from './chips';
import {FOCUS, fmtWeight} from './data';
import {arcGeom, chipBottom, chipTop, Cubic, cubicAt} from './geom';
import {slot} from './layout';

const SAMPLES = 44;

/** Ordine di accensione: archi più forti per primi. */
const rankOf = (w: number[], k: number): number => [...w.keys()].sort((a, b) => w[b] - w[a]).indexOf(k);
const drawP = (f: number, at: number, rank: number): number => prog(f, at - 1 + rank * 1.1, 11, ease.outCubic);

const strokePart = (ctx: CanvasRenderingContext2D, c: Cubic, d: number): void => {
	ctx.beginPath();
	const n = Math.max(2, Math.ceil(SAMPLES * d));
	for (let s = 0; s <= n; s++) {
		const p = cubicAt(c, (s / n) * d);
		if (s === 0) ctx.moveTo(p.x, p.y);
		else ctx.lineTo(p.x, p.y);
	}
	ctx.stroke();
};

/**
 * ATTENZIONE: archi luminosi dal token "che guarda" verso i token precedenti.
 * Spessore e luce = peso. Gli impulsi scorrono dai token guardati verso il token in esame (l'informazione confluisce).
 */
export const ArcsCanvas: React.FC<{f: number; beat: number}> = ({f, beat}) => {
	const draw = (ctx: CanvasRenderingContext2D): void => {
		ctx.globalCompositeOperation = 'lighter';
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		FOCUS.forEach((F, fi) => {
			const env = focusEnv(f, fi);
			if (env <= 0.002) return;
			const maxW = Math.max(...F.w);
			for (let k = 0; k < F.q; k++) {
				const wn = F.w[k] / maxW;
				const rank = rankOf(F.w.slice(0, F.q), k);
				const d = drawP(f, F.at, rank);
				if (d <= 0.001) continue;
				const c = arcGeom(f, F.q, k);
				const pulse = 1 + 0.55 * beat;
				// alone largo, corpo, nucleo (spessore e luce = peso)
				ctx.strokeStyle = withAlpha(COLORS.orange, clamp((0.04 + 0.07 * wn) * env * pulse));
				ctx.lineWidth = 16 + 34 * wn;
				strokePart(ctx, c, d);
				ctx.strokeStyle = withAlpha(COLORS.orange, clamp((0.14 + 0.32 * wn) * env * pulse));
				ctx.lineWidth = 4 + 10 * wn;
				strokePart(ctx, c, d);
				ctx.strokeStyle = withAlpha(COLORS.orangeHot, clamp((0.28 + 0.72 * wn) * env * pulse));
				ctx.lineWidth = 1.3 + 3.4 * wn;
				strokePart(ctx, c, d);
				if (wn > 0.6) {
					ctx.strokeStyle = withAlpha(COLORS.white, clamp(0.55 * wn * env * pulse));
					ctx.lineWidth = 1.2;
					strokePart(ctx, c, d);
				}
				// testa luminosa mentre l'arco si disegna
				if (d < 1) {
					const h = cubicAt(c, d);
					drawGlow(ctx, h.x, h.y, 4 + 5 * wn, COLORS.orangeBright, env, COLORS.white);
				} else {
					// approdo sul token guardato
					drawGlow(ctx, c[3].x, c[3].y, 3 + 6 * wn, COLORS.orangeBright, (0.4 + 0.6 * wn) * env * pulse, COLORS.orangeHot);
					// impulsi: dal token guardato verso il token in esame
					const n = 1 + Math.round(3 * wn);
					for (let m = 0; m < n; m++) {
						const sp = 1 / (20 + 10 * hash(k, m + fi * 7));
						const t = 1 - ((((f - F.at) * sp + m / n + hash(k, m) * 0.3) % 1) + 1) % 1;
						const p = cubicAt(c, t);
						drawGlow(ctx, p.x, p.y, 2.5 + 4 * wn, COLORS.orangeBright, Math.sin(Math.PI * t) * env * (0.5 + 0.5 * wn), COLORS.white);
					}
				}
			}
			// partenza: il token in esame "emette" gli archi
			const s = slot(f, F.q);
			drawGlow(ctx, s.x, chipTop(s.y), 9, COLORS.orangeBright, 0.55 * env * (1 + 0.6 * beat), COLORS.white);
		});
		// passaggio del fuoco: una cometa dal primo al secondo token (sul beat 135)
		const A = FOCUS[0];
		const B = FOCUS[1];
		const tp = prog(f, B.at - 8, 8, ease.inOutCubic);
		if (tp > 0 && tp < 1) {
			const sa = slot(f, A.q);
			const sb = slot(f, B.q);
			const c: Cubic = [
				{x: sa.x, y: chipBottom(sa.y)},
				{x: sa.x, y: chipBottom(sa.y) + 140},
				{x: sb.x, y: chipTop(sb.y) - 140},
				{x: sb.x, y: chipTop(sb.y)},
			];
			for (let s = 0; s < 8; s++) {
				const t = clamp(tp - s * 0.035);
				const p = cubicAt(c, t);
				drawGlow(ctx, p.x, p.y, 7 - s * 0.6, COLORS.orangeBright, (1 - s / 8) * 0.9, COLORS.white);
			}
		}
		ctx.globalCompositeOperation = 'source-over';
	};
	return <FrameCanvas frame={f} additive draw={draw} />;
};

/** Pesi scritti sugli archi più forti (illustrativi). */
export const WeightPills: React.FC<{f: number}> = ({f}) => (
	<>
		{FOCUS.flatMap((F, fi) => {
			const env = focusEnv(f, fi);
			if (env <= 0.01) return [];
			return F.labels.map((k, li) => {
				const rank = rankOf(F.w.slice(0, F.q), k);
				const on = prog(f, F.at + 5 + rank * 1.1, 7, ease.outBack);
				if (on <= 0) return null;
				const p = cubicAt(arcGeom(f, F.q, k), 0.8);
				const strong = li === 0;
				return (
					<div
						key={`${fi}-${k}`}
						style={{
							position: 'absolute',
							left: p.x - 50,
							top: p.y - 21,
							width: 100,
							height: 42,
							borderRadius: 21,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							fontFamily: FONTS.mono,
							fontWeight: 700,
							fontSize: 26,
							letterSpacing: '0.02em',
							color: strong ? COLORS.white : COLORS.orangeHot,
							background: alpha(COLORS.black, 0.86),
							border: `1.5px solid ${alpha(strong ? COLORS.orangeHot : COLORS.orange, 0.85)}`,
							boxShadow: `0 0 ${16 + 10 * (strong ? 1 : 0)}px ${alpha(COLORS.orange, strong ? 0.55 : 0.35)}`,
							opacity: clamp(on * 1.5) * env,
							transform: `scale(${0.6 + 0.4 * on})`,
						}}
					>
						{fmtWeight(F.w[k])}
					</div>
				);
			});
		})}
	</>
);
