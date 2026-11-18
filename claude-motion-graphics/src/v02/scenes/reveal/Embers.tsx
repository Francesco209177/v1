import React, {useMemo} from 'react';
import {FrameCanvas} from '../../../components/FrameCanvas';
import {drawGlow} from '../../../lib/canvas';
import {hash, TAU} from '../../../lib/math';
import {COLORS} from '../../../theme';
import {HEIGHT, WIDTH} from '../../../timeline';

type Ember = {x: number; y: number; z: number; sp: number; ph: number; sw: number};

/**
 * Braci arancioni che salgono lentamente (pura funzione del frame). `layer`:
 *  - 'back'  → piccole e numerose, dietro al laptop;
 *  - 'front' → poche, grandi e morbide (fuori fuoco), davanti: profondità.
 * `push` = velocità extra verso l'esterno all'inizio (la camera che arretra).
 */
export const Embers: React.FC<{f: number; layer: 'back' | 'front'; push?: number; intensity?: number}> = ({f, layer, push = 0, intensity = 1}) => {
	const front = layer === 'front';
	const list = useMemo<Ember[]>(
		() =>
			Array.from({length: front ? 14 : 110}, (_, i) => {
				const s = front ? 500 : 0;
				return {
					x: hash(i + s, 61) * WIDTH,
					y: hash(i + s, 62) * (HEIGHT + 200),
					z: front ? 1.4 + hash(i + s, 63) * 1.4 : 0.25 + hash(i + s, 63) * 0.8,
					sp: 0.5 + hash(i + s, 64) * 1.1,
					ph: hash(i + s, 65) * TAU,
					sw: 10 + hash(i + s, 66) * 30,
				};
			}),
		[front],
	);
	return (
		<FrameCanvas
			frame={f}
			additive
			draw={(ctx) => {
				ctx.globalCompositeOperation = 'lighter';
				const cx = WIDTH / 2;
				const cy = 720;
				for (const e of list) {
					const t = f + 400;
					let y = e.y - t * e.sp * e.z;
					y = ((y % (HEIGHT + 200)) + HEIGHT + 200) % (HEIGHT + 200) - 100;
					let x = e.x + Math.sin(t / 50 + e.ph) * e.sw * e.z;
					// spinta radiale (arretramento della camera)
					x += (x - cx) * push * e.z * 0.6;
					y += (y - cy) * push * e.z * 0.6;
					const tw = 0.55 + 0.45 * Math.sin(t / 13 + e.ph * 5);
					if (front) {
						drawGlow(ctx, x, y, 7 * e.z, COLORS.orange, 0.11 * tw * intensity, COLORS.orangeBright);
					} else {
						const hot = hash(Math.round(e.ph * 1000), 3) > 0.75;
						drawGlow(ctx, x, y, 1.2 + 2.4 * e.z, hot ? COLORS.orangeBright : COLORS.orange, (0.25 + 0.55 * tw) * e.z * intensity, COLORS.orangeHot);
					}
				}
				ctx.globalCompositeOperation = 'source-over';
			}}
		/>
	);
};
