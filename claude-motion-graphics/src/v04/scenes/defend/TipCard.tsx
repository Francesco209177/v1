import React from 'react';
import {clamp, ease, hit, prog} from '../../../lib/math';
import {FONTS} from '../../../theme';
import {a4, C4} from '../../theme';
import {CheckBadge} from './icons';
import {STACK} from './timing';

export const TITLE_SIZE = 42;
export const TITLE_LH = 50;
const QUAL_LH = 32;

/** Altezza dell'intestazione (titolo su 1 o 2 righe) e inizio dell'area visiva della card. */
export const headerH = (titleLines: number): number => 24 + titleLines * TITLE_LH;
export const qualTop = (titleLines: number): number => headerH(titleLines) + 6;
export const visualTop = (titleLines: number, qualLines: number): number => qualTop(titleLines) + qualLines * QUAL_LH + 22;

/**
 * Card di un comportamento di difesa: icona + titolo (Space Grotesk) + qualificatore (mono) + area visiva,
 * casella di spunta a destra. Entra con uno scatto che ATTERRA esattamente sul cue `at`; poi, quando arriva
 * la successiva, si comprime (`collapse` 0..1) in una riga della checklist. `absorb` 0..1 = risucchiata dallo scudo.
 */
export const TipCard: React.FC<{
	f: number;
	at: number;
	checkAt: number;
	icon: (lit: number) => React.ReactNode;
	title: string;
	titleLines?: number;
	qualifier: string;
	qualLines?: number;
	top: number;
	height: number;
	collapse: number;
	absorb?: number;
	absorbTo?: {x: number; y: number};
	glowAll?: number;
	children?: React.ReactNode;
}> = ({f, at, checkAt, icon, title, titleLines = 1, qualifier, qualLines = 1, top, height, collapse, absorb = 0, absorbTo = {x: 540, y: 400}, glowAll = 0, children}) => {
	if (f < at - 8) return null;
	const enter = prog(f, at - 7, 7, ease.outCubic);
	const land = hit(f, at, 9);
	const checkGlow = hit(f, checkAt, 12);
	const sweep = prog(f, at - 1, 14, ease.inOutSine);
	const contentA = clamp(1 - collapse * 1.6);
	const W = STACK.width;
	// risucchio verso lo scudo
	const cy = top + height / 2;
	const ab = ease.inCubic(absorb);
	const dx = (absorbTo.x - (STACK.left + W / 2)) * ab;
	const dy = (absorbTo.y - cy) * ab;
	const lit = clamp(land + 0.6 * checkGlow + glowAll);
	return (
		<div
			style={{
				position: 'absolute',
				left: STACK.left,
				top,
				width: W,
				height,
				transform: `translate(${dx}px, ${dy + (1 - enter) * 90}px) scale(${(0.94 + 0.06 * enter) * (1 - 0.88 * ab)}, ${(0.94 + 0.06 * enter) * (1 - 0.92 * ab)})`,
				opacity: clamp(enter * 1.4) * (1 - ease.inQuad(absorb)),
			}}
		>
			{/* corpo della card (vetro scuro) */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					borderRadius: 26,
					overflow: 'hidden',
					background: `linear-gradient(180deg, rgba(24,29,31,${0.93 - 0.1 * collapse}) 0%, rgba(13,16,18,0.95) 100%)`,
					border: `1.5px solid ${a4(C4.green, 0.2 + 0.55 * lit - 0.06 * collapse)}`,
					boxShadow: `0 26px 70px rgba(0,0,0,0.55), 0 0 ${30 + 50 * lit}px ${a4(C4.green, 0.08 + 0.28 * lit)}, inset 0 1px 0 rgba(255,255,255,0.06)`,
				}}
			>
				{/* barra d'accento a sinistra (card attiva) */}
				<div style={{position: 'absolute', left: 0, top: 18, bottom: 18, width: 4, borderRadius: 2, background: C4.green, opacity: 0.85 * (1 - collapse), boxShadow: `0 0 14px ${a4(C4.green, 0.8)}`}} />
				{/* lama di luce all'atterraggio */}
				{sweep > 0 && sweep < 1 ? (
					<div
						style={{
							position: 'absolute',
							top: 0,
							bottom: 0,
							left: -300 + sweep * (W + 600),
							width: 220,
							background: `linear-gradient(100deg, ${a4(C4.greenBright, 0)} 0%, ${a4(C4.greenBright, 0.16)} 50%, ${a4(C4.greenBright, 0)} 100%)`,
						}}
					/>
				) : null}
				{/* area visiva */}
				<div style={{position: 'absolute', left: 0, top: 0, width: W, height: 2000, opacity: contentA}}>{children}</div>
			</div>
			{/* intestazione: icona + titolo + spunta (non si muove durante la compressione) */}
			<div style={{position: 'absolute', left: STACK.pad, top: 16}}>{icon(clamp(land + checkGlow))}</div>
			<div
				style={{
					position: 'absolute',
					left: 112,
					top: 23,
					width: W - 112 - 100,
					fontFamily: FONTS.display,
					fontWeight: 600,
					fontSize: TITLE_SIZE,
					lineHeight: `${TITLE_LH}px`,
					letterSpacing: '-0.012em',
					color: C4.white,
					opacity: 1 - 0.12 * collapse,
					textShadow: '0 2px 18px rgba(0,0,0,0.6)',
				}}
			>
				{title}
			</div>
			<div
				style={{
					position: 'absolute',
					left: 112,
					top: qualTop(titleLines),
					width: W - 112 - STACK.pad,
					fontFamily: FONTS.mono,
					fontSize: 24,
					lineHeight: `${QUAL_LH}px`,
					color: C4.gray,
					opacity: contentA,
				}}
			>
				<span style={{color: C4.green}}>› </span>
				{qualifier}
			</div>
			<div style={{position: 'absolute', left: W - STACK.pad - 52, top: 22}}>
				<CheckBadge f={f} at={checkAt} glowAll={glowAll} />
			</div>
		</div>
	);
};
