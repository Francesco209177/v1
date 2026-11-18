import React from 'react';
import {clamp, ease, lerp} from '../../lib/math';
import {alpha, COLORS} from '../../theme';
import {beatStep, BORN} from './timing';

const W = 250;
const H = 164;
const SLANT = 9; // % di inclinazione del fronte

/** Contenuto stilizzato di una "scena": un sole e due barre. */
const MiniScene: React.FC<{ink: string}> = ({ink}) => (
	<>
		<div style={{position: 'absolute', left: 30, top: 28, width: 54, height: 54, borderRadius: 27, border: `4px solid ${ink}`}} />
		<div style={{position: 'absolute', left: 104, top: 40, width: 112, height: 10, borderRadius: 5, background: ink}} />
		<div style={{position: 'absolute', left: 104, top: 64, width: 74, height: 10, borderRadius: 5, background: ink, opacity: 0.6}} />
		<div style={{position: 'absolute', left: 30, top: 110, width: 186, height: 26, borderRadius: 13, background: ink, opacity: 0.35}} />
	</>
);

/**
 * <Transizione tipo="glow" /> — una tessera in cui due "scene" si alternano con una tendina:
 * il fronte luminoso attraversa la tessera a ogni beat (andata e ritorno).
 * Spenta è un wireframe grigio; accesa, la scena entrante è arancione e il fronte brilla.
 */
export const WipeElement: React.FC<{frame: number; lit: number; weight: number; tempo: number}> = ({frame: f, lit, weight, tempo}) => {
	const every = tempo > 1 ? 7.5 : 15;
	const step = beatStep(f, tempo > 1 ? 150 : BORN.G - 8, every);
	const u = ease.inOutQuart(clamp(step.t / (every * 0.66)));
	const e = lerp(-0.14, 1.14, step.n % 2 === 0 ? u : 1 - u);
	const top = e * 100 + SLANT;
	const bottom = e * 100 - SLANT;
	const moving = Math.sin(Math.PI * clamp(step.t / (every * 0.66)));
	const edgeColor = lit > 0.5 ? COLORS.orangeHot : COLORS.gray;
	return (
		<div
			style={{
				position: 'absolute',
				left: -W / 2,
				top: -H / 2,
				width: W,
				height: H,
				borderRadius: 26,
				border: `${3.5 * weight}px solid ${lit > 0.5 ? COLORS.orange : COLORS.gray}`,
				background: COLORS.surface,
				overflow: 'hidden',
				boxShadow: `0 0 ${30 + 30 * lit}px ${alpha(COLORS.orange, 0.12 + 0.3 * lit)}`,
			}}
		>
			{/* scena uscente: wireframe */}
			<MiniScene ink={COLORS.grayDark} />
			{/* scena entrante, tagliata dal fronte inclinato */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					clipPath: `polygon(0% 0%, ${top}% 0%, ${bottom}% 100%, 0% 100%)`,
					background:
						lit > 0.5
							? `linear-gradient(135deg, ${COLORS.orangeBright} 0%, ${COLORS.orange} 55%, ${COLORS.orangeDeep} 100%)`
							: COLORS.surface2,
				}}
			>
				<MiniScene ink={lit > 0.5 ? COLORS.bg : COLORS.grayDim} />
			</div>
			{/* fronte luminoso */}
			<div
				style={{
					position: 'absolute',
					left: `${e * 100}%`,
					top: -30,
					width: 6,
					height: H + 60,
					marginLeft: -3,
					background: edgeColor,
					transform: `rotate(${Math.atan2((2 * SLANT * W) / 100, H) * (180 / Math.PI)}deg)`,
					boxShadow: `0 0 ${14 + 18 * moving}px ${alpha(lit > 0.5 ? COLORS.orangeHot : COLORS.white, 0.5 + 0.4 * lit)}, 0 0 ${40 + 40 * moving}px ${alpha(COLORS.orange, 0.5 * lit)}`,
					opacity: 0.55 + 0.45 * moving,
				}}
			/>
		</div>
	);
};
