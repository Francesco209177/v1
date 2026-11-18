import React from 'react';
import {clamp, ease, hit, prog} from '../../../lib/math';
import {alpha, COLORS, FONTS, textGlow} from '../../../theme';
import {WIDTH} from '../../../timeline';
import {Y} from './layout';

const KEY_SIZE = 140;

/**
 * Parola chiave + qualificatore (+ nota opzionale) di una sequenza BENEFITS.
 * `f` = frame relativo alla sequenza: f = 0 è il cue → la parola è già a schermo, in pieno "colpo":
 * scala 1.22 → 1, tracking largo che si chiude, bagliore che decade, eco a contorno che si espande.
 */
export const Keyword: React.FC<{
	f: number;
	word: string;
	qualifier: string;
	highlight?: string[];
	note?: string;
	noteAt?: number;
	/** Deriva lenta (parallasse) in px/frame. */
	drift?: number;
}> = ({f, word, qualifier, highlight = [], note, noteAt = 30, drift = 0.18}) => {
	if (f < 0) return null;
	const land = prog(f, 0, 10, ease.outQuart);
	const track = prog(f, 0, 13, ease.outQuint);
	const flash = hit(f, 0, 12);
	const scale = 1.16 - 0.16 * land + 0.012 * (f / 75); // micro dolly continuo
	const echo = prog(f, 0, 14, ease.outCubic);
	const words = qualifier.split(' ');
	const hi = new Set(highlight);
	const dy = -f * drift;
	return (
		<>
			{/* eco a contorno */}
			{echo < 1 ? (
				<div
					style={{
						position: 'absolute',
						left: 0,
						width: WIDTH,
						top: Y.keyword + dy,
						transform: `translateY(-50%) scale(${1 + 0.45 * echo})`,
						textAlign: 'center',
						fontFamily: FONTS.display,
						fontWeight: 700,
						fontSize: KEY_SIZE,
						lineHeight: 1,
						letterSpacing: '-0.01em',
						color: 'transparent',
						WebkitTextStroke: `2px ${alpha(COLORS.orangeBright, 0.8)}`,
						opacity: 0.75 * (1 - echo),
						whiteSpace: 'nowrap',
					}}
				>
					{word}
				</div>
			) : null}
			<div
				style={{
					position: 'absolute',
					left: 0,
					width: WIDTH,
					top: Y.keyword + dy,
					transform: `translateY(-50%) scale(${scale})`,
					textAlign: 'center',
					fontFamily: FONTS.display,
					fontWeight: 700,
					fontSize: KEY_SIZE,
					lineHeight: 1,
					letterSpacing: `${0.07 * (1 - track) - 0.01}em`,
					paddingLeft: `${0.07 * (1 - track) - 0.01}em`, // compensa il tracking dell'ultima lettera
					color: COLORS.white,
					whiteSpace: 'nowrap',
					filter: land < 0.35 ? `blur(${(1 - land / 0.35) * 5}px)` : undefined,
					textShadow: `0 4px 30px rgba(0,0,0,0.6), ${textGlow(COLORS.orange, 0.35 + 1.4 * flash)}`,
				}}
			>
				{word}
			</div>
			{/* qualificatore: parole che salgono da una maschera, sfalsate di 2 frame */}
			<div
				style={{
					position: 'absolute',
					left: 60,
					width: WIDTH - 120,
					top: Y.qualifier + dy * 0.7,
					transform: 'translateY(-50%)',
					display: 'flex',
					justifyContent: 'center',
					flexWrap: 'wrap',
					gap: '0 0.6em',
					fontFamily: FONTS.mono,
					fontWeight: 500,
					fontSize: 32,
					lineHeight: 1.3,
					color: COLORS.gray,
				}}
			>
				{words.map((w, i) => {
					const p = prog(f, 5 + i * 2, 10, ease.outQuint);
					const isHi = hi.has(w);
					return (
						<span key={i} style={{display: 'inline-block', overflow: 'hidden', padding: '2px 0 6px', margin: '-2px 0 -6px'}}>
							<span
								style={{
									display: 'inline-block',
									transform: `translateY(${(1 - p) * 40}px)`,
									opacity: clamp(p * 1.5),
									color: isHi ? COLORS.orangeBright : COLORS.gray,
									textShadow: isHi ? textGlow(COLORS.orange, 0.35) : undefined,
								}}
							>
								{w}
							</span>
						</span>
					);
				})}
			</div>
			{note ? <Note f={f - noteAt} text={note} dy={dy * 0.6} /> : null}
		</>
	);
};

/** Nota onesta in piccolo (mono 24 px, grigio): entra con un fade e una linea che si traccia. */
const Note: React.FC<{f: number; text: string; dy: number}> = ({f, text, dy}) => {
	if (f < 0) return null;
	const p = prog(f, 0, 12, ease.outCubic);
	const line = prog(f, 0, 16, ease.outQuart);
	return (
		<div
			style={{
				position: 'absolute',
				left: 60,
				width: WIDTH - 120,
				top: Y.note + dy,
				transform: `translateY(-50%) translateY(${(1 - p) * 10}px)`,
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				gap: 12,
				opacity: p,
			}}
		>
			<div style={{width: 120 * line, height: 2, background: alpha(COLORS.grayDim, 0.7)}} />
			<div style={{fontFamily: FONTS.mono, fontSize: 24, lineHeight: 1.3, color: alpha(COLORS.gray, 0.78), textAlign: 'center', whiteSpace: 'nowrap'}}>{text}</div>
		</div>
	);
};
