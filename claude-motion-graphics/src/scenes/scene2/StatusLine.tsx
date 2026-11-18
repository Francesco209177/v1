import React from 'react';
import {ease, prog} from '../../lib/math';
import {SPARK_PATH} from '../../lib/spark';
import {COLORS, FONTS} from '../../theme';
import {CODE_METRICS} from '../../lib/code';
import {LH, rowY} from './layout';
import {T} from './timing';

/**
 * Riga di stato in stile Claude Code ("✻ Claude sta scrivendo il codice…"): mini-spark che gira
 * e puntini animati. Vive nell'angolo in basso a destra, dove le ultime righe di codice sono corte.
 */
export const StatusLine: React.FC<{frame: number}> = ({frame}) => {
	if (frame < T.statusIn || frame >= T.statusOut + 8) return null;
	const enter = prog(frame, T.statusIn, 9, ease.outQuint);
	const exit = prog(frame, T.statusOut, 8, ease.inCubic);
	const t = frame - T.statusIn;
	const dots = 1 + (Math.floor(t / 4) % 3);
	return (
		<div
			style={{
				position: 'absolute',
				right: CODE_METRICS.padX,
				top: rowY(12) - LH / 2,
				height: LH,
				display: 'flex',
				alignItems: 'center',
				gap: 14,
				fontFamily: FONTS.mono,
				fontSize: 26,
				fontWeight: 500,
				color: COLORS.gray,
				whiteSpace: 'pre',
				opacity: enter * (1 - exit),
				transform: `translateY(${(1 - enter) * 16 - exit * 10}px)`,
			}}
		>
			<svg viewBox="0 0 24 24" width={28} height={28} style={{transform: `rotate(${t * 13}deg) scale(${1 + 0.12 * Math.sin(t * 0.8)})`, filter: `drop-shadow(0 0 8px ${COLORS.orange})`}}>
				<path d={SPARK_PATH} fill={COLORS.orange} />
			</svg>
			<span>
				<span style={{color: COLORS.white}}>Claude</span> sta scrivendo il codice
				{[0, 1, 2].map((i) => (
					<span key={i} style={{opacity: i < dots ? 1 : 0.18}}>
						.
					</span>
				))}
			</span>
		</div>
	);
};
