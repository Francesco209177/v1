import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {clamp, ease} from '../../lib/math';
import {flash, hubAt, smooth, T} from './motion';

/**
 * Luce dietro lo spark: si carica durante la convergenza (swell), esplode sul colpo
 * e resta come tenue controluce della end card. Nulla a f 0.
 */
export const Backlight: React.FC = () => {
	const f = useCurrentFrame();
	const hub = hubAt(f);
	const charge = f < T.hit ? 0.2 * ease.inQuad(clamp(f / (T.hit - 1))) : 0;
	const hold = 0.085 * smooth((f - T.hit) / 12);
	const k = charge + hold + 0.42 * flash(f);
	if (k <= 0.002) return null;
	const r = hub.size * 2.6 + 260 * flash(f);
	return (
		<div
			style={{
				position: 'absolute',
				left: hub.x - r,
				top: hub.y - r,
				width: r * 2,
				height: r * 2,
				borderRadius: '50%',
				background: `radial-gradient(closest-side, rgba(240,147,111,${k}) 0%, rgba(217,119,87,${k * 0.42}) 36%, rgba(217,119,87,0) 100%)`,
			}}
		/>
	);
};

/** Lampo del colpo finale: bagliore radiale + flare anamorfico orizzontale centrati sullo spark. */
export const HitFlash: React.FC = () => {
	const f = useCurrentFrame();
	const k = flash(f);
	if (k <= 0.004) return null;
	const hub = hubAt(T.hit);
	const flare = Math.exp(-(f - T.hit) / 2.4);
	return (
		<AbsoluteFill style={{mixBlendMode: 'screen', pointerEvents: 'none'}}>
			<AbsoluteFill
				style={{
					background: `radial-gradient(64% 40% at 50% ${(hub.y / 1920) * 100}%, rgba(255,226,206,${0.7 * k}) 0%, rgba(240,147,111,${0.3 * k}) 38%, rgba(217,119,87,0) 100%)`,
				}}
			/>
			<div
				style={{
					position: 'absolute',
					left: -200,
					right: -200,
					top: hub.y - 300,
					height: 600,
					background: `radial-gradient(50% 50% at 50% 50%, rgba(255,236,222,${0.9 * flare}) 0%, rgba(240,147,111,${0.34 * flare}) 30%, rgba(217,119,87,0) 100%)`,
					transform: `scaleY(${0.012 + 0.07 * flare})`,
					filter: 'blur(5px)',
				}}
			/>
		</AbsoluteFill>
	);
};
