import React from 'react';
import {useAbsFrame} from '../../../lib/frame';
import {beatPulse, clamp, ease, hash, lerp} from '../../../lib/math';
import {alpha, COLORS, FONTS} from '../../../theme';
import {SIZE, SLOTS, T} from './layout';
import {charAt, charX, layerXf, popAt, scanBeam, slotPos, toScreen} from './motion';

const mixHot = (t: number): string =>
	`rgb(${Math.round(lerp(250, 255, t))},${Math.round(lerp(249, 195, t))},${Math.round(lerp(245, 160, t))})`;

/**
 * La domanda ricomposta come testo luminoso (mono, stessi passi dei token): i caratteri tornano al loro posto
 * come pixel, la frase galleggia, il raggio del "tokenizer" la scorre; al cue 180 ogni pezzo lascia il posto
 * al suo TokenChip (vedi Chips) nello stesso punto.
 */
export const Question: React.FC = () => {
	const abs = useAbsFrame();
	if (abs >= popAt(SLOTS.length - 1)) return null;
	const L = layerXf(abs);
	const beam = scanBeam(abs);
	const blur = Math.max(0, 6 * (1 - ease.outCubic(clamp((abs - T.start) / 18))));
	const beat = abs < T.split ? 0.22 * beatPulse(abs, 5) : 0;
	return (
		<>
			{SLOTS.map((s) => {
				if (abs >= popAt(s.i)) return null;
				const p = slotPos(s.i, abs);
				const c = toScreen(abs, p);
				const chars = s.text.split('');
				return (
					<div
						key={s.i}
						style={{
							position: 'absolute',
							left: c.x,
							top: c.y,
							width: 0,
							height: 0,
							transform: `scale(${L.s}) rotate(${p.rot}deg)`,
							filter: blur > 0.3 ? `blur(${blur.toFixed(2)}px)` : undefined,
						}}
					>
						<div
							style={{
								position: 'absolute',
								left: -(s.text.length * SIZE * 0.6) / 2,
								top: -SIZE * 0.78,
								height: SIZE * 1.55,
								display: 'flex',
								alignItems: 'center',
								fontFamily: FONTS.mono,
								fontWeight: 500,
								fontSize: SIZE,
								whiteSpace: 'pre',
							}}
						>
							{chars.map((ch, j) => {
								const t0 = charAt(s.i, j);
								const age = abs - t0;
								if (age < 0 || ch === ' ') return <span key={j}>{' '}</span>;
								const on = clamp(age / 3);
								const fresh = Math.exp(-age / 5);
								const sx = toScreen(abs, {x: charX(s.i, j), y: s.py}).x;
								const lit = beam.a * Math.exp(-Math.pow((sx - beam.x) / 46, 2));
								// scintillio sparso: qualche carattere si accende per un istante (materia "viva")
								const tw = Math.pow(0.5 + 0.5 * Math.sin(abs / 6 + hash(s.i * 17 + j, 57) * 6.283), 6);
								const hot = clamp(fresh + lit + 0.35 * tw);
								const g = 1 + beat + 1.2 * lit;
								return (
									<span
										key={j}
										style={{
											opacity: on,
											color: mixHot(hot),
											textShadow: `0 0 ${10 * g}px ${alpha(COLORS.orangeBright, 0.7 + 0.3 * hot)}, 0 0 ${30 * g}px ${alpha(COLORS.orange, 0.45 + 0.2 * hot)}, 0 0 ${70 * g}px ${alpha(COLORS.orange, 0.22)}`,
										}}
									>
										{ch}
									</span>
								);
							})}
						</div>
					</div>
				);
			})}
		</>
	);
};
