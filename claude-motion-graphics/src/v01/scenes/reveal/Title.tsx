import React from 'react';
import {clamp, ease, hash, hit, lerp, prog} from '../../../lib/math';
import {alpha, COLORS, FONTS, textGlow} from '../../../theme';
import {LAYOUT, R} from './data';

const SCRAMBLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#%&$@';

/** Scossa breve (pseudo-casuale, deterministica) dopo un impatto. */
export const shake = (f: number, at: number, amp: number): {x: number; y: number} => {
	const k = hit(f, at, 10);
	if (k < 0.01) return {x: 0, y: 0};
	return {x: (hash(f, 3) - 0.5) * 2 * amp * k, y: (hash(f, 5) - 0.5) * 2 * amp * k};
};

/**
 * "NON PENSA." sbatte dentro sul cue (780 = relativo 90); "PREVEDE." si decodifica lettera per lettera
 * e si blocca sul beat successivo (795 = relativo 105), arancione e luminoso.
 */
export const Title: React.FC<{f: number}> = ({f}) => {
	if (f < R.title) return null;
	// --- NON PENSA. ---
	const p1 = prog(f, R.title - 1, 7, ease.outExpo); // già visibile (sfocato e grande) sul frame del cue
	const h1 = hit(f, R.title, 14);
	const sc1 = lerp(1.55, 1, p1);
	const track1 = lerp(0.12, -0.02, p1) + 0.012 * prog(f, R.title + 7, R.end - R.title - 7, ease.outCubic);
	// --- PREVEDE. ---
	const word = 'PREVEDE.';
	const h2 = hit(f, R.prevede, 16);
	const lockAll = f >= R.prevede;
	const sc2 = 1 + 0.06 * h2;
	// lama di luce su PREVEDE. nella cartolina finale (abs 870)
	const sweep = prog(f, R.endCard, 18, ease.inOutSine);
	// spinta lenta
	const drift = 1 + 0.025 * prog(f, R.title + 10, R.end - R.title - 10, ease.inOutSine);

	return (
		<div style={{position: 'absolute', inset: 0, transformOrigin: `540px ${(LAYOUT.titleY1 + LAYOUT.titleY2) / 2}px`, transform: `scale(${drift})`}}>
			{/* scrim per la leggibilità */}
			<div
				style={{
					position: 'absolute',
					left: -40,
					width: 1160,
					top: LAYOUT.titleY1 - 200,
					height: 520,
					background: 'radial-gradient(closest-side, rgba(5,5,5,0.62), rgba(5,5,5,0))',
					opacity: prog(f, R.title, 6),
				}}
			/>
			{/* flare anamorfico dell'impatto */}
			<div
				style={{
					position: 'absolute',
					left: -100,
					width: 1280,
					top: LAYOUT.titleY1 - 5,
					height: 10,
					background: `linear-gradient(90deg, ${alpha(COLORS.orange, 0)}, ${alpha(COLORS.orangeHot, 0.9 * h1)}, ${alpha(COLORS.orange, 0)})`,
					transform: `scaleX(${0.3 + 0.9 * (1 - h1)})`,
					mixBlendMode: 'screen',
				}}
			/>
			<div
				style={{
					position: 'absolute',
					left: 0,
					width: 1080,
					top: LAYOUT.titleY1 - 100,
					height: 200,
					lineHeight: '200px',
					textAlign: 'center',
					fontFamily: FONTS.display,
					fontWeight: 700,
					fontSize: 152,
					letterSpacing: `${track1}em`,
					paddingLeft: `${track1}em`,
					color: COLORS.white,
					whiteSpace: 'nowrap',
					transform: `scale(${sc1})`,
					opacity: clamp(p1 * 3),
					filter: p1 < 0.98 ? `blur(${(1 - p1) * 16}px)` : undefined,
					textShadow: `0 0 ${10 + 30 * h1}px ${alpha(COLORS.orangeHot, 0.25 + 0.6 * h1)}, 0 6px 34px rgba(0,0,0,0.6)`,
				}}
			>
				NON PENSA.
			</div>
			{/* alone arancione sotto PREVEDE. */}
			<div
				style={{
					position: 'absolute',
					left: 90,
					width: 900,
					top: LAYOUT.titleY2 - 160,
					height: 320,
					background: `radial-gradient(closest-side, ${alpha(COLORS.orange, (0.12 + 0.28 * h2) * (lockAll ? 1 : prog(f, R.prevede - 9, 9)))}, ${alpha(COLORS.orange, 0)})`,
					mixBlendMode: 'screen',
				}}
			/>
			{/* PREVEDE. — decodifica */}
			<div
				style={{
					position: 'absolute',
					left: 0,
					width: 1080,
					top: LAYOUT.titleY2 - 120,
					height: 240,
					lineHeight: '240px',
					textAlign: 'center',
					fontFamily: FONTS.display,
					fontWeight: 700,
					fontSize: 188,
					letterSpacing: '0.006em',
					whiteSpace: 'nowrap',
					transform: `scale(${sc2})`,
				}}
			>
				{word.split('').map((ch, i) => {
					const appear = R.prevede - 9 + i * 0.6;
					const lock = R.prevede - 7 + i;
					if (f < appear) return <span key={i} style={{color: 'transparent'}}>{ch}</span>;
					const locked = f >= lock;
					const lh = hit(f, lock, 6);
					const lit = sweep > 0 && sweep < 1 ? Math.exp(-((((i / (word.length - 1)) - lerp(-0.2, 1.2, sweep)) / 0.16) ** 2)) : 0;
					const g = h2 * 1.4 + lh * 0.8 + lit * 0.9;
					return (
						<span key={i} style={{position: 'relative', display: 'inline-block', color: locked ? COLORS.orange : 'transparent', textShadow: locked ? `${textGlow(COLORS.orange, 0.9 + g)}${g > 0.2 ? `, 0 0 6px ${alpha(COLORS.white, 0.6 * Math.min(1, g))}` : ''}` : undefined, transform: locked ? `translateY(${-8 * lh}px)` : undefined}}>
							{ch}
							{!locked ? (
								<span
									style={{
										position: 'absolute',
										left: 0,
										right: 0,
										top: 0,
										textAlign: 'center',
										color: alpha(COLORS.orangeBright, 0.55),
										textShadow: `0 0 18px ${alpha(COLORS.orange, 0.5)}`,
									}}
								>
									{SCRAMBLE[Math.floor(hash(i * 7 + 1, f) * SCRAMBLE.length)]}
								</span>
							) : null}
						</span>
					);
				})}
			</div>
		</div>
	);
};
