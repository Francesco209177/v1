import React from 'react';
import {ease, lerp} from '../../lib/math';
import {WIDTH} from '../../timeline';
import {lastCut} from './shell-timing';
import {STAGE} from './stage';

const ACCENT_LEN = 6; // frame di vita dell'accento

/**
 * Accento sui cambi shot (5-6 frame): frustata di luce orizzontale che attraversa il palco
 * (direzione alternata a ogni taglio) + velo caldo che copre il primo frame del nuovo shot.
 * Stessa famiglia del flare anamorfico globale sui tagli di scena, ma più piccolo.
 */
export const CutAccent: React.FC<{frame: number}> = ({frame}) => {
	const cut = lastCut(frame);
	if (!cut || cut.d >= ACCENT_LEN) return null;
	const {d, index} = cut;
	const dir = index % 2 ? -1 : 1;
	const k = (1 - d / ACCENT_LEN) ** 2;
	const headX = STAGE.cx + dir * lerp(-560, 620, ease.outCubic((d + 1) / ACCENT_LEN));
	const veil = Math.exp(-d / 1.4);
	const pct = (headX / WIDTH) * 100;
	return (
		<div style={{position: 'absolute', left: 0, top: 0, width: WIDTH, height: STAGE.y + STAGE.h + 60, mixBlendMode: 'screen', pointerEvents: 'none'}}>
			{/* velo caldo sul palco */}
			<div
				style={{
					position: 'absolute',
					left: 0,
					top: STAGE.y - 30,
					width: WIDTH,
					height: STAGE.h + 60,
					background: `radial-gradient(62% 50% at 50% 50%, rgba(255,195,160,${0.5 * veil}) 0%, rgba(217,119,87,${0.2 * veil}) 48%, rgba(217,119,87,0) 100%)`,
				}}
			/>
			{/* flare anamorfico che corre col taglio */}
			<div
				style={{
					position: 'absolute',
					left: headX - 800,
					top: STAGE.cy - 260,
					width: 1600,
					height: 520,
					background: `radial-gradient(50% 50% at 50% 50%, rgba(255,232,216,${0.95 * k}) 0%, rgba(240,147,111,${0.4 * k}) 28%, rgba(217,119,87,0) 100%)`,
					transform: `scaleY(${0.035 + 0.075 * k})`,
					filter: 'blur(5px)',
				}}
			/>
			{/* filo incandescente con la testa più luminosa */}
			<div
				style={{
					position: 'absolute',
					left: 0,
					top: STAGE.cy - 1.5,
					width: WIDTH,
					height: 3,
					opacity: k,
					background: `linear-gradient(90deg, rgba(255,195,160,0) ${pct - 55}%, rgba(255,195,160,0.55) ${pct - 12}%, #FFFFFF ${pct}%, rgba(255,195,160,0.55) ${pct + 12}%, rgba(255,195,160,0) ${pct + 55}%)`,
				}}
			/>
		</div>
	);
};
