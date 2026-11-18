import React from 'react';
import {clamp, ease, hit, prog} from '../../lib/math';
import {COLORS, FONTS, alpha, boxGlow} from '../../theme';
import {mixHex} from './color';
import {BOX, CW, LH, boxHeight, cursorAt} from './layout';
import {T} from './timing';

/** Icona del tasto invio (freccia ↵) disegnata a mano: non dipende dai glifi del font. */
const EnterIcon: React.FC<{color: string}> = ({color}) => (
	<svg viewBox="0 0 24 24" width={24} height={24} style={{display: 'block'}}>
		<path d="M19 5v6a3 3 0 0 1-3 3H6M10 9.5 5.5 14l4.5 4.5" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
	</svg>
);

/**
 * Campo di input stilizzato di Claude Code: bordo arrotondato, tasto INVIO e cursore a blocco.
 * Il testo NON è qui: i caratteri sono glifi indipendenti (GlyphLayer) perché poi diventano codice.
 * `beat` = frame assoluto, per il lampeggio del cursore a tempo.
 */
export const Composer: React.FC<{frame: number; beat: number}> = ({frame, beat}) => {
	if (frame < T.boxIn || frame > T.submit + 11) return null;
	const enter = prog(frame, T.boxIn, 9, ease.outQuint);
	const h = boxHeight(frame);
	const flash = hit(frame, T.submit, 5);
	const release = prog(frame, T.submit + 1, 9, ease.outCubic); // dopo l'invio il campo si dissolve e libera il testo
	const focus = 0.42 + 0.1 * Math.sin(frame / 9);
	const border = mixHex(COLORS.orange, COLORS.white, flash);

	// tasto INVIO: spento → armato (anticipazione) → premuto sul cue
	const arm = prog(frame, T.keyArm, 5, ease.outCubic);
	const press = frame >= T.submit ? 1 : 0;
	const keyIn = prog(frame, T.boxIn + 7, 9, ease.outQuint);
	const keyColor = press ? COLORS.black : mixHex(COLORS.grayDim, COLORS.white, arm);
	const keyScale = press ? 0.93 + 0.07 * prog(frame, T.submit, 6, ease.outCubic) : 1 + 0.05 * arm - 0.07 * ease.inCubic(clamp((frame - (T.submit - 3)) / 3));

	// cursore: pieno mentre si scrive, lampeggia a tempo quando è fermo, collassa sull'invio
	const cur = cursorAt(frame);
	const typing = frame >= T.typeStart && frame < T.keyArm;
	const blinkOn = typing || ((beat % 15) + 15) % 15 < 8;
	const curGone = prog(frame, T.submit, 3, ease.outCubic);
	const curW = CW * cur.scale * 0.62;
	const curH = (LH - 12) * cur.scale;
	const sweepX = -340 + (BOX.w + 420) * prog(frame, T.submit - 1, 8, ease.outCubic);
	return (
		<>
			<div
				style={{
					position: 'absolute',
					left: BOX.x,
					top: BOX.y,
					width: BOX.w,
					height: h,
					borderRadius: BOX.radius,
					border: `2px solid ${frame >= T.submit ? border : alpha(COLORS.orange, focus)}`,
					background: `linear-gradient(180deg, rgba(250,249,245,${0.035 + 0.1 * flash}) 0%, rgba(250,249,245,${0.012 + 0.06 * flash}) 100%)`,
					boxShadow: `0 0 ${46 + 60 * flash}px ${alpha(COLORS.orange, 0.1 + 0.5 * flash)}, inset 0 0 28px ${alpha(COLORS.orange, 0.05 + 0.25 * flash)}`,
					opacity: enter * (1 - release),
					transform: `translateY(${(1 - enter) * 14}px) scale(${0.97 + 0.03 * enter + 0.035 * release})`,
					overflow: 'hidden',
				}}
			>
				{/* lama di luce che attraversa il campo sull'invio */}
				{frame >= T.submit - 1 ? (
					<div
						style={{
							position: 'absolute',
							left: sweepX,
							top: -20,
							bottom: -20,
							width: 300,
							transform: 'skewX(-18deg)',
							background: `linear-gradient(90deg, rgba(255,195,160,0) 0%, rgba(255,195,160,${0.5 * (1 - release)}) 50%, rgba(255,195,160,0) 100%)`,
						}}
					/>
				) : null}
				<div
					style={{
						position: 'absolute',
						right: 22,
						bottom: 20,
						height: 46,
						padding: '0 16px 0 14px',
						display: 'flex',
						alignItems: 'center',
						gap: 10,
						borderRadius: 13,
						border: `2px solid ${press ? COLORS.orangeHot : mixHex(COLORS.grayDark, COLORS.orange, arm)}`,
						background: press ? COLORS.orangeBright : alpha(COLORS.orange, 0.14 * arm),
						boxShadow: arm > 0 ? boxGlow(COLORS.orange, 0.35 * arm + 0.9 * flash) : undefined,
						color: keyColor,
						fontFamily: FONTS.mono,
						fontSize: 24,
						fontWeight: 500,
						letterSpacing: '0.14em',
						opacity: keyIn,
						transform: `translateY(${press ? 2 : 0}px) scale(${keyScale})`,
					}}
				>
					<EnterIcon color={keyColor} />
					<span style={{marginRight: '-0.14em'}}>INVIO</span>
				</div>
			</div>
			{frame >= T.boxIn + 1 && curGone < 1 && blinkOn ? (
				<div
					style={{
						position: 'absolute',
						left: cur.cx - (CW * cur.scale) / 2 + 1,
						top: cur.cy - curH / 2,
						width: curW,
						height: curH,
						borderRadius: 2,
						background: mixHex(COLORS.orange, COLORS.white, flash),
						boxShadow: `0 0 18px ${COLORS.orange}, 0 0 ${40 + 50 * flash}px ${alpha(COLORS.orange, 0.5)}`,
						opacity: enter,
						transform: `scaleY(${1 - curGone})`,
					}}
				/>
			) : null}
		</>
	);
};
