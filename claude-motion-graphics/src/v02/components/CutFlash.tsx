import React from 'react';
import {AbsoluteFill} from 'remotion';
import {useAbsFrame} from '../../lib/frame';
import {clamp} from '../../lib/math';

/** Colpo di luce sui tagli principali del video 02 (sul beat): bagliore caldo + flare orizzontale. */
export type Cut = {at: number; power: number; y: number};
const CUTS: Cut[] = [
	{at: 270, power: 0.8, y: 800},
	{at: 510, power: 0.9, y: 760},
	{at: 720, power: 0.8, y: 700},
];

/** core/mid/edge: colori RGB "r,g,b" del lampo (default caldi, video 01/02). */
export const CutFlash: React.FC<{cuts?: Cut[]; core?: string; mid?: string; edge?: string}> = ({
	cuts = CUTS,
	core = '255,195,160',
	mid = '217,119,87',
	edge = '255,225,205',
}) => {
	const f = useAbsFrame();
	let k = 0;
	let y = 800;
	for (const c of cuts) {
		const d = f - c.at;
		const v = (d < 0 ? clamp(1 + d / 3) ** 2 : Math.exp(-d / 4.2)) * c.power;
		if (v > k) {
			k = v;
			y = c.y;
		}
	}
	if (k < 0.004) return null;
	return (
		<AbsoluteFill style={{pointerEvents: 'none', mixBlendMode: 'screen'}}>
			<AbsoluteFill style={{background: `radial-gradient(70% 45% at 50% ${(y / 1920) * 100}%, rgba(${core},${0.45 * k}) 0%, rgba(${mid},${0.2 * k}) 45%, rgba(${mid},0) 100%)`}} />
			<div style={{position: 'absolute', left: -200, right: -200, top: y - 300 * k, height: 600 * k, background: `radial-gradient(50% 50% at 50% 50%, rgba(${edge},${0.7 * k}) 0%, rgba(${mid},${0.28 * k}) 30%, rgba(${mid},0) 100%)`, transform: `scaleY(${0.05 + 0.1 * k})`, filter: 'blur(6px)'}} />
		</AbsoluteFill>
	);
};
