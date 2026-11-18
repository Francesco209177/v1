import React, {useMemo} from 'react';
import {useCurrentFrame} from 'remotion';
import {useAbsFrame} from '../../lib/frame';
import {beatPulse, clamp, ease, invLerp, seeded} from '../../lib/math';
import {alpha, COLORS} from '../../theme';
import {extrasOut, flare, flash, HUB, T} from './motion';

/** Gradiente conico di raggi irregolari (larghezza e intensità variabili, deterministici). */
const rayGradient = (seed: number, count: number, from: number): string => {
	const rnd = seeded(seed);
	const slot = 360 / count;
	const stops: string[] = [];
	for (let i = 0; i < count; i++) {
		const centre = (i + 0.25 + 0.5 * rnd()) * slot;
		const half = 1.4 + 3.4 * rnd();
		const a = 0.2 + 0.8 * rnd();
		stops.push(
			`${alpha(COLORS.orangeHot, 0)} ${(centre - half).toFixed(2)}deg`,
			`${alpha(COLORS.orangeHot, a)} ${centre.toFixed(2)}deg`,
			`${alpha(COLORS.orangeHot, 0)} ${(centre + half).toFixed(2)}deg`,
		);
	}
	return `conic-gradient(from ${from.toFixed(3)}deg at 50% 50%, ${stops.join(', ')})`;
};

const RAY_R = 640;
const RAY_MASK =
	'radial-gradient(closest-side, rgba(0,0,0,0) 20%, rgba(0,0,0,0.95) 31%, rgba(0,0,0,0.3) 60%, rgba(0,0,0,0) 100%)';

/**
 * Raggi di luce lentissimi dietro lo spark: due strati conici contro-rotanti (il loro
 * incrocio "respira"). Nascono con l'impatto e rientrano entro extrasGone.
 */
export const LightRays: React.FC = () => {
	const f = useCurrentFrame();
	const abs = useAbsFrame();
	const t = f - T.formed;
	// accesi dall'impatto, poi un respiro sul beat; rientrano con gli altri extra
	const k = t < 0 ? 0 : (0.4 + 0.6 * Math.exp(-t / 7) + 0.22 * beatPulse(abs, 4)) * (1 - extrasOut(f));
	// i due motivi sono statici: cambia solo l'angolo "from"
	const layers = useMemo(() => [{seed: 11, count: 13, speed: 0.22, phase: 0}, {seed: 29, count: 17, speed: -0.16, phase: 40}], []);
	if (k <= 0.002) return null;
	const grow = 0.82 + 0.18 * ease.outExpo(clamp(t / 16));
	return (
		<>
			{layers.map((l) => (
				<div
					key={l.seed}
					style={{
						position: 'absolute',
						left: HUB.x - RAY_R,
						top: HUB.y - RAY_R,
						width: RAY_R * 2,
						height: RAY_R * 2,
						borderRadius: '50%',
						background: rayGradient(l.seed, l.count, l.phase + f * l.speed),
						WebkitMaskImage: RAY_MASK,
						maskImage: RAY_MASK,
						opacity: 0.3 * k,
						transform: `scale(${grow})`,
						mixBlendMode: 'screen',
					}}
				/>
			))}
		</>
	);
};

/**
 * Luce al centro: cresce mentre l'energia si raccoglie, poi lascia il posto
 * all'alone proprio di ClaudeSpark durante l'handoff.
 */
export const CoreGlow: React.FC = () => {
	const f = useCurrentFrame();
	const build = ease.inQuad(invLerp(18, T.formed - 1, f)) * (1 - ease.inOutSine(invLerp(T.formed - 2, T.formed + 8, f)));
	if (build <= 0.002) return null;
	const size = 760 + 240 * build;
	return (
		<div
			style={{
				position: 'absolute',
				left: HUB.x - size / 2,
				top: HUB.y - size / 2,
				width: size,
				height: size,
				borderRadius: '50%',
				background: `radial-gradient(closest-side, ${alpha(COLORS.orangeBright, 0.3 * build)} 0%, ${alpha(COLORS.orange, 0.12 * build)} 40%, ${alpha(COLORS.orange, 0)} 100%)`,
			}}
		/>
	);
};

/** Bloom dell'impatto + flare anamorfico orizzontale (stesso linguaggio dei tagli di scena). */
export const ImpactBloom: React.FC = () => {
	const f = useCurrentFrame();
	const k = flash(f);
	if (k <= 0.003) return null;
	const kf = flare(f);
	const t = Math.max(0, f - T.formed);
	const size = 900 + 700 * ease.outExpo(clamp(t / 14));
	const flareW = 1500 + 500 * ease.outExpo(clamp(t / 10));
	return (
		<div style={{position: 'absolute', inset: 0, mixBlendMode: 'screen', pointerEvents: 'none'}}>
			<div
				style={{
					position: 'absolute',
					left: HUB.x - size / 2,
					top: HUB.y - size / 2,
					width: size,
					height: size,
					borderRadius: '50%',
					background: `radial-gradient(closest-side, ${alpha(COLORS.orangeHot, 0.85 * k)} 0%, ${alpha(COLORS.orangeBright, 0.42 * k)} 20%, ${alpha(COLORS.orange, 0.16 * k)} 48%, ${alpha(COLORS.orange, 0)} 100%)`,
				}}
			/>
			<div
				style={{
					position: 'absolute',
					left: HUB.x - flareW / 2,
					top: HUB.y - 300,
					width: flareW,
					height: 600,
					background: `radial-gradient(50% 50% at 50% 50%, ${alpha(COLORS.white, 0.8 * kf)} 0%, ${alpha(COLORS.orangeBright, 0.32 * kf)} 30%, ${alpha(COLORS.orange, 0)} 100%)`,
					transform: `scaleY(${0.02 + 0.06 * kf})`,
				}}
			/>
		</div>
	);
};
