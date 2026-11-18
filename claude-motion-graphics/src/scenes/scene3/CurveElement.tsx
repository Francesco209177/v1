import React, {useMemo} from 'react';
import {clamp, ease, prog} from '../../lib/math';
import {alpha, COLORS, FONTS} from '../../theme';
import {CURVE_AXIS, CURVE_TARGET_Y, curveLocal, curvePath} from './curve';
import {beatStep, IGNITE} from './timing';

/**
 * spring() — il grafico della molla. Lo spark lo DISEGNA percorrendolo (9 frame dopo il beat);
 * poi un punto luminoso ripercorre la curva a ogni beat. `label` mostra il nome della funzione.
 */
export const CurveElement: React.FC<{frame: number; weight: number; tempo: number; label: number}> = ({frame: f, weight, tempo, label}) => {
	const d = useMemo(() => curvePath(), []);
	const born = IGNITE.C;
	const draw = ease.outCubic(clamp((f - born) / 9)); // stessa legge dello spark sulla tratta
	const axes = prog(f, born - 3, 8, ease.outQuint);
	const every = tempo > 1 ? 7.5 : 15;
	const step = beatStep(f, tempo > 1 ? 150 : born + 15, every);
	const running = f >= born + 15;
	const u = running ? ease.outCubic(clamp(step.t / (every * 0.8))) : 1;
	const dot = curveLocal(u);
	const dotPulse = running ? Math.sin(Math.PI * clamp(step.t / (every * 0.8))) : 0;
	const sw = 3.5 * weight;
	const A = CURVE_AXIS;
	return (
		<>
			<svg width={320} height={240} viewBox="-160 -120 320 240" style={{position: 'absolute', left: -160, top: -120, overflow: 'visible'}}>
				{/* assi a L + tacche */}
				<g opacity={axes} stroke={COLORS.grayDim} strokeWidth={sw * 0.86} strokeLinecap="round" fill="none">
					<path d={`M${A.x0} ${A.y1} L${A.x0} ${A.y0} L${A.x0 + (A.x1 - A.x0 + 10) * axes} ${A.y0}`} />
					{[0.25, 0.5, 0.75, 1].map((t) => (
						<path key={t} d={`M${A.x0 + (A.x1 - A.x0) * t} ${A.y0} l0 8`} opacity={0.7} />
					))}
				</g>
				{/* valore di assestamento */}
				<path
					d={`M${A.x0} ${CURVE_TARGET_Y} L${A.x1 + 10} ${CURVE_TARGET_Y}`}
					stroke={COLORS.gray}
					strokeOpacity={0.5 * axes}
					strokeWidth={2.5 * weight}
					strokeDasharray="3 11"
					strokeLinecap="round"
				/>
				{/* la curva: alone + tratto */}
				<path d={d} fill="none" stroke={alpha(COLORS.orange, 0.35)} strokeWidth={sw * 3.4} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - draw} style={{filter: 'blur(7px)'}} />
				<path d={d} fill="none" stroke={COLORS.orangeBright} strokeWidth={sw * 1.25} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - draw} />
				{/* punto che ripercorre la curva sul beat */}
				{running ? (
					<>
						<circle cx={dot.x} cy={dot.y} r={(13 + 9 * dotPulse) * weight} fill={alpha(COLORS.orange, 0.35)} />
						<circle cx={dot.x} cy={dot.y} r={7.5 * weight} fill={COLORS.white} />
					</>
				) : null}
			</svg>
			{/* etichetta: lega il grafico alla riga di codice `spring({ frame, fps })` */}
			<div
				style={{
					position: 'absolute',
					left: A.x0 + 6,
					top: A.y1 - 34,
					fontFamily: FONTS.mono,
					fontSize: 24,
					fontWeight: 500,
					letterSpacing: '0.04em',
					color: COLORS.gray,
					whiteSpace: 'nowrap',
					opacity: label * prog(f, born + 6, 6),
				}}
			>
				spring()
			</div>
		</>
	);
};
