import React from 'react';
import {FrameCanvas} from '../../../components/FrameCanvas';
import {clamp, ease} from '../../../lib/math';
import {HEIGHT, WIDTH} from '../../../timeline';
import {a4, C4} from '../../theme';

/** Onda protettiva: anello che si espande da (x, y) a partire da `at` (frame locali). */
export type Wave = {at: number; x: number; y: number; power: number; dur?: number; maxR?: number};

const HEX_R = 40; // raggio del singolo esagono
const HEX_W = Math.sqrt(3) * HEX_R;
const ROW_H = 1.5 * HEX_R;

const waveRadius = (w: Wave, f: number): number => (w.maxR ?? 1300) * ease.outCubic(clamp((f - w.at) / (w.dur ?? 30)));
const waveLife = (w: Wave, f: number): number => {
	const t = clamp((f - w.at) / (w.dur ?? 30));
	return f < w.at ? 0 : Math.pow(1 - t, 1.3);
};

/**
 * Griglia esagonale verde (canvas): visibile appena attorno al centro (`base`, `radius`) e accesa dal fronte
 * delle onde protettive, che vengono disegnate anche come anelli luminosi. Pura funzione del frame.
 */
export const HexField: React.FC<{f: number; cx: number; cy: number; base: number; radius: number; waves: Wave[]; rings?: boolean}> = ({
	f,
	cx,
	cy,
	base,
	radius,
	waves,
	rings = true,
}) => (
	<FrameCanvas
		frame={f}
		additive
		draw={(ctx) => {
			const live = waves.filter((w) => f >= w.at && waveLife(w, f) > 0.01);
			// griglia
			ctx.lineWidth = 1.6;
			const drift = (f * 0.25) % ROW_H;
			for (let r = -1; r < HEIGHT / ROW_H + 2; r++) {
				for (let c = -1; c < WIDTH / HEX_W + 2; c++) {
					const x = c * HEX_W + (r % 2 ? HEX_W / 2 : 0);
					const y = r * ROW_H - drift;
					const d = Math.hypot(x - cx, y - cy);
					let a = base * Math.exp(-((d / radius) ** 2));
					for (const w of live) {
						const R = waveRadius(w, f);
						const dw = Math.hypot(x - w.x, y - w.y);
						a += w.power * waveLife(w, f) * Math.exp(-(((dw - R) / 70) ** 2));
					}
					if (a < 0.012) continue;
					ctx.beginPath();
					for (let k = 0; k < 6; k++) {
						const ang = (Math.PI / 3) * k + Math.PI / 6;
						const px = x + HEX_R * 0.9 * Math.cos(ang);
						const py = y + HEX_R * 0.9 * Math.sin(ang);
						if (k === 0) ctx.moveTo(px, py);
						else ctx.lineTo(px, py);
					}
					ctx.closePath();
					ctx.strokeStyle = a4(C4.green, Math.min(0.85, a));
					ctx.stroke();
					if (a > 0.25) {
						ctx.fillStyle = a4(C4.green, Math.min(0.16, (a - 0.25) * 0.25));
						ctx.fill();
					}
				}
			}
			if (!rings) return;
			// anelli delle onde
			for (const w of live) {
				const R = waveRadius(w, f);
				const life = waveLife(w, f) * w.power;
				ctx.beginPath();
				ctx.arc(w.x, w.y, R, 0, Math.PI * 2);
				ctx.strokeStyle = a4(C4.green, 0.22 * life);
				ctx.lineWidth = 34;
				ctx.stroke();
				ctx.strokeStyle = a4(C4.greenBright, 0.55 * life);
				ctx.lineWidth = 8;
				ctx.stroke();
				ctx.strokeStyle = a4(C4.greenHot, 0.9 * life);
				ctx.lineWidth = 2.5;
				ctx.stroke();
			}
		}}
	/>
);
