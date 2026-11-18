import React from 'react';
import {clamp, ease, hash, prog} from '../../../lib/math';
import {alpha, COLORS, FONTS, textGlow} from '../../../theme';
import {LAYOUT, R} from './data';

/** Glitch sobrio: attivo in finestre brevi, spostamenti orizzontali a fette (solo arancio/grigio). */
const glitchAt = (f: number): number => {
	const windows: [number, number][] = [
		[R.caveat + 1, R.caveat + 11],
		[R.caveat + 27, R.caveat + 29],
		[R.endCard + 14, R.endCard + 16],
	];
	for (const [a, b] of windows) if (f >= a && f <= b) return 1 - (f - a) / (b - a + 1) * 0.5;
	return 0;
};

const Word: React.FC<{w: string; f: number; at: number; size: number; color: string; glow?: boolean; glitch?: number}> = ({w, f, at, size, color, glow, glitch = 0}) => {
	const p = prog(f, at, 12, ease.outQuint);
	const g = glitch > 0 && hash(f, 41) > 0.25 ? glitch : 0;
	const dx1 = g ? (hash(f, 43) - 0.5) * 22 * g : 0;
	const dx2 = g ? (hash(f, 47) - 0.5) * 16 * g : 0;
	const cut = 0.25 + 0.5 * hash(f, 53);
	return (
		<span style={{display: 'inline-block', overflow: 'hidden', padding: `${size * 0.08}px ${size * 0.05}px ${size * 0.18}px`, margin: `${-size * 0.08}px ${-size * 0.05}px ${-size * 0.18}px`}}>
			<span
				style={{
					position: 'relative',
					display: 'inline-block',
					transform: `translateY(${(1 - p) * size * 1.05}px)`,
					opacity: clamp(p * 1.6),
					color: g ? 'transparent' : color,
					textShadow: glow && !g ? textGlow(COLORS.orange, 0.7) : g ? undefined : '0 2px 22px rgba(0,0,0,0.7)',
				}}
			>
				{w}
				{g ? (
					<>
						{/* fetta superiore e inferiore spostate + fantasma arancione */}
						<span style={{position: 'absolute', left: dx1, top: 0, color: COLORS.white, clipPath: `inset(0 0 ${(1 - cut) * 100}% 0)`}}>{w}</span>
						<span style={{position: 'absolute', left: dx2, top: 0, color: COLORS.white, clipPath: `inset(${cut * 100}% 0 0 0)`}}>{w}</span>
						<span style={{position: 'absolute', left: -dx1 * 0.6 + 4, top: 0, color: alpha(COLORS.orange, 0.55), mixBlendMode: 'screen'}}>{w}</span>
					</>
				) : null}
			</span>
		</span>
	);
};

/** "Può sbagliare: verifica le informazioni importanti." — entra calma sul cue (840 = relativo 150). */
export const Caveat: React.FC<{f: number}> = ({f}) => {
	if (f < R.caveat - 6) return null;
	const sep = prog(f, R.caveat - 6, 12, ease.outCubic);
	const g = glitchAt(f);
	const s1 = 48;
	const s2 = 42;
	const drift = 1 + 0.015 * prog(f, R.caveat, R.end - R.caveat, ease.inOutSine);
	return (
		<div style={{position: 'absolute', inset: 0, transformOrigin: `540px ${LAYOUT.caveatY1}px`, transform: `scale(${drift})`}}>
			{/* separatore */}
			<div
				style={{
					position: 'absolute',
					left: 540 - 300 * sep,
					width: 600 * sep,
					top: LAYOUT.sepY,
					height: 2,
					background: `linear-gradient(90deg, ${alpha(COLORS.orange, 0)}, ${alpha(COLORS.orangeHot, 0.8)}, ${alpha(COLORS.orange, 0)})`,
					boxShadow: `0 0 12px ${alpha(COLORS.orange, 0.5)}`,
				}}
			/>
			{/* riga 1 */}
			<div
				style={{
					position: 'absolute',
					left: 0,
					width: 1080,
					top: LAYOUT.caveatY1 - s1 * 0.7,
					display: 'flex',
					justifyContent: 'center',
					alignItems: 'center',
					gap: `0 ${s1 * 0.26}px`,
					fontFamily: FONTS.display,
					fontWeight: 500,
					fontSize: s1,
					lineHeight: 1.3,
					whiteSpace: 'nowrap',
				}}
			>
				<WarnIcon f={f} size={s1 * 0.82} />
				<Word w="Può" f={f} at={R.caveat} size={s1} color={COLORS.white} />
				<Word w="sbagliare:" f={f} at={R.caveat + 2} size={s1} color={COLORS.white} glitch={g} />
			</div>
			{/* riga 2 */}
			<div
				style={{
					position: 'absolute',
					left: 0,
					width: 1080,
					top: LAYOUT.caveatY2 - s2 * 0.7,
					display: 'flex',
					justifyContent: 'center',
					gap: `0 ${s2 * 0.26}px`,
					fontFamily: FONTS.display,
					fontWeight: 500,
					fontSize: s2,
					lineHeight: 1.3,
					whiteSpace: 'nowrap',
				}}
			>
				{['verifica', 'le', 'informazioni', 'importanti.'].map((w, i) => (
					<Word key={i} w={w} f={f} at={R.caveat + 5 + i * 2} size={s2} color={i === 0 ? COLORS.orange : alpha(COLORS.white, 0.92)} glow={i === 0} />
				))}
			</div>
		</div>
	);
};

/** Piccolo triangolo di avviso (SVG), disegnato a tratto. */
const WarnIcon: React.FC<{f: number; size: number}> = ({f, size}) => {
	const p = prog(f, R.caveat - 2, 10, ease.outCubic);
	const len = 3 * size * 0.95;
	return (
		<svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{opacity: p, marginRight: 4, flexShrink: 0, filter: `drop-shadow(0 0 6px ${alpha(COLORS.orange, 0.7)})`}}>
			<path
				d={`M ${size / 2} ${size * 0.08} L ${size * 0.95} ${size * 0.9} L ${size * 0.05} ${size * 0.9} Z`}
				fill="none"
				stroke={COLORS.orange}
				strokeWidth={size * 0.08}
				strokeLinejoin="round"
				strokeDasharray={`${len * p} ${len}`}
			/>
			<line x1={size / 2} y1={size * 0.38} x2={size / 2} y2={size * 0.62} stroke={COLORS.orangeHot} strokeWidth={size * 0.09} strokeLinecap="round" opacity={prog(f, R.caveat + 4, 4)} />
			<circle cx={size / 2} cy={size * 0.76} r={size * 0.05} fill={COLORS.orangeHot} opacity={prog(f, R.caveat + 5, 4)} />
		</svg>
	);
};
