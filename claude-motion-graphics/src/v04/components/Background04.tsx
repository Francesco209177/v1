import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import {FrameCanvas} from '../../components/FrameCanvas';
import {drawGlow} from '../../lib/canvas';
import {useAbsFrame} from '../../lib/frame';
import {beatPulse, hash, TAU} from '../../lib/math';
import {HEIGHT, WIDTH} from '../../timeline';
import {C4} from '../theme';

/**
 * Sfondo continuo del video 04: nero profondo, due luci ambientali (rossa = minaccia, verde = difesa) che si
 * bilanciano con `threat` (1 = tutto rosso, 0 = tutto verde), griglia di punti, scanline, pulviscolo, vignettatura.
 */
export const Background04: React.FC<{threat?: number}> = ({threat = 0.5}) => {
	const f = useAbsFrame();
	const pulse = beatPulse(f, 4);
	const dust = useMemo(
		() => Array.from({length: 80}, (_, i) => ({x: hash(i, 1) * WIDTH, y: hash(i, 2) * HEIGHT, z: 0.35 + hash(i, 3) * 0.65, ph: hash(i, 4) * TAU, sp: 0.25 + hash(i, 5) * 0.6})),
		[],
	);
	const red = threat;
	const green = 1 - threat;
	return (
		<AbsoluteFill style={{backgroundColor: C4.black}}>
			<AbsoluteFill style={{background: `radial-gradient(120% 70% at 50% 42%, ${C4.surface} 0%, ${C4.bg} 46%, ${C4.black} 100%)`}} />
			<div
				style={{
					position: 'absolute',
					width: 1400,
					height: 1400,
					left: -260 + Math.sin(f / 140) * 80,
					top: 120 + Math.cos(f / 170) * 100,
					borderRadius: '50%',
					background: `radial-gradient(closest-side, rgba(240,53,59,${(0.07 + 0.02 * pulse) * red}) 0%, rgba(240,53,59,0) 100%)`,
				}}
			/>
			<div
				style={{
					position: 'absolute',
					width: 1300,
					height: 1300,
					left: 300 + Math.cos(f / 120) * 110,
					top: 820 + Math.sin(f / 150) * 90,
					borderRadius: '50%',
					background: `radial-gradient(closest-side, rgba(34,212,122,${(0.06 + 0.015 * pulse) * green}) 0%, rgba(34,212,122,0) 100%)`,
				}}
			/>
			{/* griglia di punti */}
			<AbsoluteFill
				style={{
					backgroundImage: 'radial-gradient(circle, rgba(235,242,238,0.5) 1.3px, transparent 1.7px)',
					backgroundSize: '54px 54px',
					backgroundPosition: `0px ${-(f * 0.35) % 54}px`,
					opacity: 0.06,
					WebkitMaskImage: 'radial-gradient(90% 60% at 50% 45%, #000 0%, transparent 100%)',
					maskImage: 'radial-gradient(90% 60% at 50% 45%, #000 0%, transparent 100%)',
				}}
			/>
			{/* scanline finissime */}
			<AbsoluteFill style={{backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.0) 0px, rgba(0,0,0,0.0) 3px, rgba(0,0,0,0.18) 3px, rgba(0,0,0,0.18) 4px)', opacity: 0.5}} />
			<FrameCanvas
				frame={f}
				additive
				draw={(ctx) => {
					ctx.globalCompositeOperation = 'lighter';
					for (let i = 0; i < dust.length; i++) {
						const d = dust[i];
						const y = (((d.y - f * d.sp * d.z) % HEIGHT) + HEIGHT) % HEIGHT;
						const x = d.x + Math.sin(f / 60 + d.ph) * 18 * d.z;
						const tw = 0.5 + 0.5 * Math.sin(f / 22 + d.ph * 3);
						const col = hash(i, 9) < red ? C4.red : C4.green;
						drawGlow(ctx, x, y, 1 + d.z * 1.4, col, (0.08 + 0.26 * tw) * d.z, C4.white);
					}
				}}
			/>
			<AbsoluteFill style={{background: 'radial-gradient(85% 62% at 50% 46%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.8) 100%)'}} />
		</AbsoluteFill>
	);
};
