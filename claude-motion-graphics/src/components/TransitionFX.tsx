import React from 'react';
import {AbsoluteFill} from 'remotion';
import {useAbsFrame} from '../lib/frame';
import {clamp} from '../lib/math';
import {SCENES} from '../timeline';

const CUTS: {at: number; power: number}[] = [
	{at: SCENES.idea.start, power: 0.55},
	{at: SCENES.creation.start, power: 0.9},
	{at: SCENES.result.start, power: 1},
	{at: SCENES.outro.start, power: 0.8},
];

/** Colpo di luce globale sui tagli di scena (sul beat): bagliore + flare anamorfico orizzontale. */
export const TransitionFX: React.FC = () => {
	const f = useAbsFrame();
	let k = 0;
	for (const c of CUTS) {
		const d = f - c.at;
		const v = d < 0 ? clamp(1 + d / 3) ** 2 : Math.exp(-d / 4.2);
		k = Math.max(k, v * c.power);
	}
	if (k < 0.004) return null;
	return (
		<AbsoluteFill style={{pointerEvents: 'none', mixBlendMode: 'screen'}}>
			<AbsoluteFill
				style={{background: `radial-gradient(70% 45% at 50% 42%, rgba(255,195,160,${0.5 * k}) 0%, rgba(217,119,87,${0.22 * k}) 45%, rgba(217,119,87,0) 100%)`}}
			/>
			<div
				style={{
					position: 'absolute',
					left: -200,
					right: -200,
					top: 806 - 300 * k,
					height: 600 * k,
					background: `radial-gradient(50% 50% at 50% 50%, rgba(255,225,205,${0.75 * k}) 0%, rgba(240,147,111,${0.3 * k}) 30%, rgba(217,119,87,0) 100%)`,
					transform: `scaleY(${0.05 + 0.1 * k})`,
					filter: 'blur(6px)',
				}}
			/>
		</AbsoluteFill>
	);
};
