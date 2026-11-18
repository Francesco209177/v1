import React from 'react';
import {useCurrentFrame} from 'remotion';
import {prog} from '../../lib/math';
import {T} from './timing';
import {sweepX} from './windowMath';

/**
 * <Transizione tipo="glow" /> in azione: una lama di luce inclinata attraversa il quadro sul beat
 * e porta via la finestra del codice (la maschera in CodeWindow segue lo stesso fronte).
 */
export const GlowSweep: React.FC = () => {
	const f = useCurrentFrame();
	if (f < T.sweepStart || f > T.sweepEnd + 4) return null;
	const x = sweepX(f);
	const a = prog(f, T.sweepStart, 2) * (1 - prog(f, T.sweepEnd - 2, 6));
	return (
		<div style={{position: 'absolute', inset: 0, overflow: 'hidden', mixBlendMode: 'screen', pointerEvents: 'none'}}>
			{/* alone largo */}
			<div
				style={{
					position: 'absolute',
					left: x - 330,
					top: -400,
					width: 660,
					height: 2720,
					transform: 'rotate(14deg)',
					opacity: a,
					background:
						'linear-gradient(90deg, rgba(217,119,87,0) 0%, rgba(217,119,87,0.16) 28%, rgba(240,147,111,0.5) 46%, rgba(255,195,160,0.95) 50%, rgba(240,147,111,0.34) 54%, rgba(217,119,87,0.06) 70%, rgba(217,119,87,0) 100%)',
				}}
			/>
			{/* nucleo sottile e caldissimo */}
			<div
				style={{
					position: 'absolute',
					left: x - 5,
					top: -400,
					width: 10,
					height: 2720,
					transform: 'rotate(14deg)',
					opacity: a,
					background: 'rgba(250,249,245,0.95)',
					boxShadow: '0 0 30px rgba(255,195,160,0.9), 0 0 90px rgba(217,119,87,0.8)',
				}}
			/>
		</div>
	);
};
