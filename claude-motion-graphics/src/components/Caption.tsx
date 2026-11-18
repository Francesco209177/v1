import React from 'react';
import {useCurrentFrame} from 'remotion';
import {clamp, ease, prog} from '../lib/math';
import {COLORS, FONTS, textGlow} from '../theme';
import {CAPTION_Y, WIDTH} from '../timeline';

/**
 * Caption cinetica standard del reel: parole che salgono da una maschera, da sfocate a nitide.
 * Tutte le scene usano QUESTO componente per i testi narrativi => tipografia coerente.
 *
 * - text: usa "\n" per forzare gli a-capo (consigliato: righe da 2–4 parole).
 * - highlight: parole (match esatto, punteggiatura inclusa o esclusa) rese in arancione.
 * - inAt / outAt: frame (relativi alla scena) di inizio entrata / inizio uscita.
 * - wordAt: opzionale, frame di entrata per singola parola (sync fine con la musica).
 */
export const Caption: React.FC<{
	text: string;
	highlight?: string[];
	inAt: number;
	outAt: number;
	frame?: number;
	stagger?: number;
	wordAt?: number[];
	y?: number;
	size?: number;
	weight?: number;
	lineHeight?: number;
	maxWidth?: number;
	color?: string;
	scrim?: boolean;
	outDuration?: number;
	letterSpacing?: number;
}> = ({
	text,
	highlight = [],
	inAt,
	outAt,
	frame: frameProp,
	stagger = 3,
	wordAt,
	y = CAPTION_Y,
	size = 78,
	weight = 600,
	lineHeight = 1.14,
	maxWidth = 900,
	color = COLORS.white,
	scrim = true,
	outDuration = 8,
	letterSpacing = -0.02,
}) => {
	const current = useCurrentFrame();
	const frame = frameProp ?? current;
	if (frame < inAt - 1 || frame > outAt + outDuration) return null;
	const lines = text.split('\n').map((l) => l.trim().split(/\s+/));
	const out = prog(frame, outAt, outDuration, ease.inCubic);
	const strip = (w: string) => w.replace(/[.,;:!?«»"“”]/g, '').toLowerCase();
	const hi = new Set(highlight.map(strip));
	let index = 0;
	const total = lines.reduce((n, l) => n + l.length, 0);
	const lastIn = wordAt ? Math.max(...wordAt) : inAt + (total - 1) * stagger;
	const scrimIn = prog(frame, inAt, 10, ease.outCubic) * (1 - out);
	void lastIn;
	return (
		<div
			style={{
				position: 'absolute',
				left: (WIDTH - maxWidth) / 2,
				width: maxWidth,
				top: y,
				transform: `translateY(-50%) translateY(${-18 * out}px)`,
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				fontFamily: FONTS.display,
				fontWeight: weight,
				fontSize: size,
				lineHeight,
				letterSpacing: `${letterSpacing}em`,
				color,
				textAlign: 'center',
				opacity: 1 - out,
				filter: out > 0 ? `blur(${out * 10}px)` : undefined,
			}}
		>
			{scrim ? (
				<div
					style={{
						position: 'absolute',
						left: -120,
						right: -120,
						top: -90,
						bottom: -90,
						background: 'radial-gradient(closest-side, rgba(5,5,5,0.72) 0%, rgba(5,5,5,0.5) 55%, rgba(5,5,5,0) 100%)',
						opacity: scrimIn,
					}}
				/>
			) : null}
			{lines.map((words, li) => (
				<div key={li} style={{display: 'flex', justifyContent: 'center', gap: `0 ${size * 0.25}px`, position: 'relative', whiteSpace: 'nowrap'}}>
					{words.map((w) => {
						const i = index++;
						const start = wordAt?.[i] ?? inAt + i * stagger;
						const p = prog(frame, start, 13, ease.outQuint);
						const isHi = hi.has(strip(w));
						return (
							<span key={i} style={{display: 'inline-block', overflow: 'hidden', padding: `${size * 0.1}px ${size * 0.04}px ${size * 0.16}px`, margin: `${-size * 0.1}px ${-size * 0.04}px ${-size * 0.16}px`}}>
								<span
									style={{
										display: 'inline-block',
										transform: `translateY(${(1 - p) * size * 0.95}px) rotate(${(1 - p) * 4}deg)`,
										opacity: clamp(p * 1.6),
										filter: p < 1 ? `blur(${(1 - p) * 9}px)` : undefined,
										color: isHi ? COLORS.orange : color,
										textShadow: isHi ? textGlow(COLORS.orange, 0.9) : '0 2px 24px rgba(0,0,0,0.65)',
									}}
								>
									{w}
								</span>
							</span>
						);
					})}
				</div>
			))}
		</div>
	);
};
