import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import {drawGlow} from '../lib/canvas';
import {useAbsFrame} from '../lib/frame';
import {beatPulse, hash, TAU} from '../lib/math';
import {COLORS} from '../theme';
import {HEIGHT, WIDTH} from '../timeline';
import {FrameCanvas} from './FrameCanvas';

/**
 * Sfondo globale e continuo per tutto il reel (montato una sola volta in Main):
 * nero profondo, nebulose arancioni lentissime, griglia di punti, pulviscolo, vignettatura.
 * `intensity` (0..1) scala le luci ambientali.
 */
export const Background: React.FC<{intensity?: number}> = ({intensity = 1}) => {
	const f = useAbsFrame();
	const pulse = beatPulse(f, 4);
	const dust = useMemo(
		() =>
			Array.from({length: 90}, (_, i) => ({
				x: hash(i, 1) * WIDTH,
				y: hash(i, 2) * HEIGHT,
				z: 0.35 + hash(i, 3) * 0.65,
				ph: hash(i, 4) * TAU,
				sp: 0.25 + hash(i, 5) * 0.6,
			})),
		[],
	);
	const k = intensity;
	return (
		<AbsoluteFill style={{backgroundColor: COLORS.black}}>
			<AbsoluteFill
				style={{
					background: `radial-gradient(120% 70% at 50% 42%, ${COLORS.bgSoft} 0%, ${COLORS.bg} 46%, ${COLORS.black} 100%)`,
				}}
			/>
			{/* nebulose */}
			<div
				style={{
					position: 'absolute',
					width: 1500,
					height: 1500,
					left: -210 + Math.sin(f / 140) * 90,
					top: 80 + Math.cos(f / 170) * 110,
					borderRadius: '50%',
					background: `radial-gradient(closest-side, rgba(217,119,87,${(0.085 + 0.02 * pulse) * k}) 0%, rgba(217,119,87,0) 100%)`,
				}}
			/>
			<div
				style={{
					position: 'absolute',
					width: 1100,
					height: 1100,
					left: 360 + Math.cos(f / 120) * 120,
					top: 1040 + Math.sin(f / 150) * 90,
					borderRadius: '50%',
					background: `radial-gradient(closest-side, rgba(168,80,47,${0.07 * k}) 0%, rgba(168,80,47,0) 100%)`,
				}}
			/>
			{/* griglia di punti */}
			<AbsoluteFill
				style={{
					backgroundImage: 'radial-gradient(circle, rgba(250,249,245,0.5) 1.4px, transparent 1.8px)',
					backgroundSize: '54px 54px',
					backgroundPosition: `0px ${-(f * 0.35) % 54}px`,
					opacity: 0.075 * k,
					WebkitMaskImage: 'radial-gradient(90% 60% at 50% 45%, #000 0%, transparent 100%)',
					maskImage: 'radial-gradient(90% 60% at 50% 45%, #000 0%, transparent 100%)',
				}}
			/>
			{/* pulviscolo */}
			<FrameCanvas
				frame={f}
				additive
				draw={(ctx) => {
					ctx.globalCompositeOperation = 'lighter';
					for (const d of dust) {
						const y = (((d.y - f * d.sp * d.z) % HEIGHT) + HEIGHT) % HEIGHT;
						const x = d.x + Math.sin(f / 60 + d.ph) * 18 * d.z;
						const tw = 0.5 + 0.5 * Math.sin(f / 22 + d.ph * 3);
						drawGlow(ctx, x, y, 1.1 + d.z * 1.5, COLORS.orange, (0.1 + 0.3 * tw) * d.z * k, COLORS.orangeHot);
					}
				}}
			/>
			<AbsoluteFill style={{background: 'radial-gradient(85% 62% at 50% 46%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.78) 100%)'}} />
		</AbsoluteFill>
	);
};
