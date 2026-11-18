import React from 'react';
import {FrameCanvas} from '../../../components/FrameCanvas';
import {drawGlow, withAlpha} from '../../../lib/canvas';
import {clamp, hash, TAU} from '../../../lib/math';
import {COLORS} from '../../../theme';
import {DIVE_CENTER} from './pose';

/**
 * Transizione condivisa HOOK → SECRET (funzione pura del frame ASSOLUTO, quindi continua sul taglio 104|105):
 * velo di luce calda che riempie il quadro e scie "a curvatura" che accelerano e poi si posano.
 */
const PEAK = 104.5;

/**
 * Velo di luce: prima un nucleo incandescente che si allarga fino a riempire il quadro (picco tra 104 e 105),
 * poi la luce si dissolve e si richiude verso il centro, dove nasce la rete neurale.
 */
export const diveVeil = (abs: number): {a: number; r: number; heat: number} => {
	if (abs < PEAK) {
		const t = clamp((abs - 92) / (PEAK - 92));
		return {a: t <= 0 ? 0 : Math.min(0.97, 0.3 + 0.75 * t), r: 160 + 2300 * t ** 2.2, heat: 1};
	}
	// la luce si condensa in un nucleo al centro (i bordi tornano scuri per primi), poi si spegne nella rete
	const d = abs - PEAK;
	const fade = clamp((d - 6) / 14);
	return {a: 0.97 * (1 - fade * fade * (3 - 2 * fade)), r: 140 + 2320 * Math.exp(-d / 3.6), heat: Math.exp(-d / 10)};
};

const mixRgb = (a: number[], b: number[], t: number): string => a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',');

/** Avanzamento cumulativo del volo (0..1): accelera fino al taglio, poi rallenta e si posa. */
const travel = (abs: number): number => {
	const w = abs < 104 ? 5 : 11;
	return 0.5 * (1 + Math.tanh((abs - 104) / w));
};

export const DiveVeil: React.FC<{abs: number}> = ({abs}) => {
	const {a, r, heat} = diveVeil(abs);
	if (a < 0.004) return null;
	const core = mixRgb([240, 147, 111], [255, 246, 238], heat);
	const mid = mixRgb([217, 119, 87], [255, 214, 190], heat);
	return (
		<div
			style={{
				position: 'absolute',
				inset: 0,
				pointerEvents: 'none',
				background: `radial-gradient(circle ${Math.round(r)}px at ${DIVE_CENTER.x}px ${DIVE_CENTER.y}px, rgba(${core},${a}) 0%, rgba(${mid},${0.93 * a}) 25%, rgba(240,147,111,${0.72 * a}) 55%, rgba(217,119,87,${0.32 * a}) 78%, rgba(217,119,87,0) 100%)`,
			}}
		/>
	);
};

/** Scie radiali dal centro del tuffo: lunghe e veloci al taglio, poi brevi e lente (si "posano"). */
export const WarpStreaks: React.FC<{abs: number}> = ({abs}) => {
	if (abs < 86 || abs > 134) return null;
	const u = travel(abs);
	const uPrev = travel(abs - 1.4);
	const speed = (u - uPrev) / 0.14; // ~0..1
	const draw = (ctx: CanvasRenderingContext2D): void => {
		ctx.globalCompositeOperation = 'lighter';
		ctx.lineCap = 'round';
		const N = 190;
		const fadeIn = clamp((abs - 86) / 6);
		const fadeOut = 1 - clamp((abs - 116) / 18);
		for (let i = 0; i < N; i++) {
			const ang = hash(i, 11) * TAU;
			const R = 30 + hash(i, 12) * 420;
			const z = 0.07 + ((((hash(i, 13) - u * 2.4) % 1) + 1) % 1) * 0.93;
			const zt = z + (u - uPrev) * 2.4;
			const r1 = (R * 0.32) / z;
			const r0 = (R * 0.32) / Math.min(1.6, zt);
			if (r0 > 2400) continue;
			const near = 1 - z;
			const a = (0.25 + 0.75 * near) * clamp(speed * 1.6 + 0.12) * fadeIn * fadeOut;
			if (a < 0.01) continue;
			const cx = DIVE_CENTER.x;
			const cy = DIVE_CENTER.y;
			const c = Math.cos(ang);
			const s = Math.sin(ang);
			ctx.strokeStyle = withAlpha(hash(i, 14) > 0.35 ? COLORS.orangeBright : COLORS.orangeHot, a);
			ctx.lineWidth = 0.8 + 3.2 * near * near;
			ctx.beginPath();
			ctx.moveTo(cx + c * r0, cy + s * r0);
			ctx.lineTo(cx + c * r1, cy + s * r1);
			ctx.stroke();
			if (near > 0.5) drawGlow(ctx, cx + c * r1, cy + s * r1, 1.5 + 3 * near, COLORS.orangeBright, a * 0.8, COLORS.white);
		}
		ctx.globalCompositeOperation = 'source-over';
	};
	return <FrameCanvas frame={abs} draw={draw} />;
};
