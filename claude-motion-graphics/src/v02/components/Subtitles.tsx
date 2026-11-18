import React from 'react';
import {useAbsFrame} from '../../lib/frame';
import {clamp, ease, prog} from '../../lib/math';
import {alpha, COLORS, FONTS} from '../../theme';
import {WIDTH} from '../../timeline';
import {V2_SUB_Y, V2_VO} from '../timeline';

/**
 * Sottotitoli della voce narrante (per chi guarda senza audio), stile "karaoke" sobrio:
 * la frase entra con un fade, le parole si accendono man mano che vengono pronunciate
 * (tempo stimato proporzionale alla lunghezza delle parole). Montati una sola volta nel Main.
 */
export type VoLine = {readonly start: number; readonly end: number; readonly text: string};

export const Subtitles: React.FC<{hidden?: (absFrame: number) => boolean; lines?: readonly VoLine[]; y?: number}> = ({
	hidden,
	lines = V2_VO,
	y = V2_SUB_Y,
}) => {
	const f = useAbsFrame();
	if (hidden?.(f)) return null;
	const t = f / 30;
	const line = lines.find((l) => t >= l.start - 0.12 && t <= l.end + 0.25);
	if (!line) return null;
	const inP = prog(f, line.start * 30 - 4, 6, ease.outCubic);
	const outP = prog(f, line.end * 30 + 2, 6, ease.inCubic);
	const words = line.text.split(' ');
	const total = words.reduce((n, w) => n + w.length + 1, 0);
	const dur = line.end - line.start;
	let acc = 0;
	return (
		<div
			style={{
				position: 'absolute',
				left: 90,
				width: WIDTH - 180,
				top: y,
				transform: `translateY(-50%) translateY(${(1 - inP) * 14}px)`,
				opacity: inP * (1 - outP),
				display: 'flex',
				flexWrap: 'wrap',
				justifyContent: 'center',
				gap: '0 14px',
				fontFamily: FONTS.display,
				fontWeight: 600,
				fontSize: 50,
				lineHeight: 1.22,
				letterSpacing: '-0.01em',
				textAlign: 'center',
			}}
		>
			<div
				style={{
					position: 'absolute',
					left: -60,
					right: -60,
					top: -50,
					bottom: -50,
					background: 'radial-gradient(closest-side, rgba(5,5,5,0.7) 0%, rgba(5,5,5,0.45) 60%, rgba(5,5,5,0) 100%)',
				}}
			/>
			{words.map((w, i) => {
				const at = line.start + (acc / total) * dur;
				acc += w.length + 1;
				const lit = clamp((t - at + 0.06) / 0.12);
				return (
					<span
						key={i}
						style={{
							position: 'relative',
							color: lit > 0.5 ? COLORS.white : alpha(COLORS.white, 0.42),
							textShadow: `0 2px 18px rgba(0,0,0,0.7)${lit > 0.5 ? `, 0 0 26px ${alpha(COLORS.orange, 0.25 * lit)}` : ''}`,
						}}
					>
						{w}
					</span>
				);
			})}
		</div>
	);
};
