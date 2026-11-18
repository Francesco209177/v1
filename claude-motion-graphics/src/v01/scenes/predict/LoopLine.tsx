import React from 'react';
import {alpha, COLORS} from '../../../theme';
import {CTX, LOOP, PANEL} from './data';

/**
 * Anello di retroazione (SVG sottile): dalla risposta, lungo il bordo destro, fino al contesto (freccia).
 * `draw` 0..1 = tracciamento; `glow` = intensità (impulsi/accento); il tratteggio scorre verso l'alto.
 * Più il connettore verticale contesto → pannello ("il modello legge il contesto").
 */
export const LoopLine: React.FC<{f: number; draw: number; glow: number; opacity: number}> = ({f, draw, glow, opacity}) => {
	const {x, yAns, xAns, yCtx, xCtx, r} = LOOP;
	const d = `M ${xAns} ${yAns} H ${x - r} Q ${x} ${yAns} ${x} ${yAns - r} V ${yCtx + r} Q ${x} ${yCtx} ${x - r} ${yCtx} H ${xCtx + 4}`;
	const len = x - r - xAns + (yAns - yCtx - 2 * r) + (x - r - xCtx - 4) + 2 * 1.571 * r;
	if (opacity <= 0.003) return null;
	return (
		<svg width={1080} height={1920} style={{position: 'absolute', left: 0, top: 0, opacity, overflow: 'visible'}}>
			{/* alone */}
			<path d={d} fill="none" stroke={alpha(COLORS.orange, 0.16 + 0.4 * glow)} strokeWidth={10 + 10 * glow} strokeLinecap="round" strokeDasharray={`${len * draw} ${len}`} style={{filter: 'blur(6px)'}} />
			{/* binario */}
			<path d={d} fill="none" stroke={alpha(COLORS.orange, 0.32 + 0.5 * glow)} strokeWidth={2.2} strokeLinecap="round" strokeDasharray={`${len * draw} ${len}`} />
			{/* tratteggio in movimento (verso il contesto) */}
			{draw >= 1 ? (
				<path d={d} fill="none" stroke={alpha(COLORS.orangeHot, 0.5 + 0.5 * glow)} strokeWidth={3} strokeLinecap="round" strokeDasharray="3 22" strokeDashoffset={-f * 3.2} />
			) : null}
			{/* freccia verso il contesto */}
			<path
				d={`M ${xCtx + 16} ${yCtx - 9} L ${xCtx + 3} ${yCtx} L ${xCtx + 16} ${yCtx + 9}`}
				fill="none"
				stroke={alpha(COLORS.orangeHot, (0.6 + 0.4 * glow) * (draw >= 0.98 ? 1 : 0))}
				strokeWidth={2.6}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
};

/** Connettore contesto → pannello: il modello legge tutto il contesto per prevedere il token successivo. */
export const Connector: React.FC<{f: number; on: number; pulse: number}> = ({f, on, pulse}) => {
	const y0 = CTX.y + 26;
	const y1 = PANEL.top - 2;
	if (on <= 0.003) return null;
	return (
		<svg width={1080} height={1920} style={{position: 'absolute', left: 0, top: 0, opacity: on}}>
			<line x1={540} y1={y0} x2={540} y2={y0 + (y1 - y0) * on} stroke={alpha(COLORS.orange, 0.4 + 0.5 * pulse)} strokeWidth={2} />
			<line x1={540} y1={y0} x2={540} y2={y1} stroke={alpha(COLORS.orangeHot, 0.6 + 0.4 * pulse)} strokeWidth={3} strokeDasharray="2 14" strokeDashoffset={-f * 2.4} />
			<path d={`M 530 ${y1 - 14} L 540 ${y1 - 4} L 550 ${y1 - 14}`} fill="none" stroke={alpha(COLORS.orangeHot, 0.7 + 0.3 * pulse)} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
};
