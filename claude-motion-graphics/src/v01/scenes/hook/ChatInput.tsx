import React from 'react';
import {useAbsFrame} from '../../../lib/frame';
import {beatPulse, clamp, ease, hit, lerp} from '../../../lib/math';
import {alpha, COLORS, FONTS} from '../../../theme';
import {BREAK, CHAR_AT, CHARS, caretOn, fieldGrow, TYPE_END, TYPE_START, typedCount} from './timing';

/** Campo di input (coordinate del frame a scala 1): il bordo inferiore resta fermo, il campo cresce verso l'alto. */
export const FIELD = {x: 100, w: 880, bottom: 880, h1: 198, lineH: 74, padX: 44, padTop: 32} as const;
export const TEXT_SIZE = 60;

/**
 * Input di chat generico ed elegante: bordo arancione luminoso, placeholder mono, testo Inter 56 px digitato
 * velocemente con cursore arancione, pulsante di invio che si accende a 45. Nessun marchio, nessuna UI reale.
 * `chrome` (0..1) spegne bordo/pulsanti quando la camera è vicinissima; `cheap` toglie i glow costosi.
 */
export const ChatInput: React.FC<{f: number; chrome: number; cheap: boolean}> = ({f, chrome, cheap}) => {
	const abs = useAbsFrame();
	const n = typedCount(f);
	const grow = fieldGrow(f);
	const h = FIELD.h1 + FIELD.lineH * grow;
	const top = FIELD.bottom - h;
	const send = hit(f, TYPE_END, 9);
	const beat = f > TYPE_END ? 0 : 0.18 * beatPulse(abs, 5);
	const glowK = (1 + beat + 0.8 * send) * chrome;
	const active = clamp((f - TYPE_START) / 3);
	const placeholder = 1 - clamp((f - TYPE_START + 1) / 2);
	const caret = caretOn(f);
	const textTop = top + FIELD.padTop;
	const onLine2 = n > BREAK + 1;
	const ch = (i: number) => {
		const age = f - CHAR_AT[i];
		const fresh = age >= 0 ? Math.exp(-age / 3) : 0;
		return (
			<span
				key={i}
				style={{
					color: fresh > 0.05 ? `rgb(${Math.round(lerp(250, 255, fresh))},${Math.round(lerp(249, 195, fresh))},${Math.round(lerp(245, 160, fresh))})` : COLORS.white,
					textShadow: cheap ? undefined : `0 0 ${10 + 14 * fresh}px ${alpha(COLORS.orangeHot, 0.18 + 0.5 * fresh)}`,
				}}
			>
				{CHARS[i]}
			</span>
		);
	};
	const caretEl = (
		<span
			style={{
				display: 'inline-block',
				width: 5,
				height: 62,
				marginLeft: 4,
				verticalAlign: -13,
				borderRadius: 2,
				background: COLORS.orangeBright,
				opacity: caret,
				boxShadow: cheap ? undefined : `0 0 12px ${alpha(COLORS.orange, 0.9)}, 0 0 28px ${alpha(COLORS.orange, 0.5)}`,
			}}
		/>
	);
	const line1 = Array.from({length: Math.min(n, BREAK)}, (_, i) => ch(i));
	const line2 = onLine2 ? Array.from({length: n - BREAK - 1}, (_, i) => ch(BREAK + 1 + i)) : [];
	const btn = {x: FIELD.x + FIELD.w - 26 - 34, y: FIELD.bottom - 46};
	return (
		<>
			{/* etichetta sopra il campo */}
			<div
				style={{
					position: 'absolute',
					left: FIELD.x + 8,
					top: top - 62,
					fontFamily: FONTS.mono,
					fontSize: 24,
					letterSpacing: '0.14em',
					color: alpha(COLORS.gray, 0.85 * chrome),
					display: 'flex',
					alignItems: 'center',
					gap: 14,
					whiteSpace: 'nowrap',
				}}
			>
				<span style={{width: 10, height: 10, borderRadius: 5, background: COLORS.orange, boxShadow: cheap ? undefined : `0 0 10px ${COLORS.orange}`, opacity: chrome}} />
				LA TUA DOMANDA
			</div>
			{/* corpo del campo */}
			<div
				style={{
					position: 'absolute',
					left: FIELD.x,
					top,
					width: FIELD.w,
					height: h,
					borderRadius: 40,
					background: `linear-gradient(180deg, ${alpha('#1E1B19', 0.92)}, ${alpha('#141210', 0.92)})`,
					border: `2px solid ${alpha(COLORS.orange, (0.55 + 0.35 * active + 0.1 * send) * chrome)}`,
					boxShadow: cheap
						? undefined
						: `0 0 ${22 * glowK}px ${alpha(COLORS.orange, 0.42 * glowK)}, 0 0 ${70 * glowK}px ${alpha(COLORS.orange, 0.18 * glowK)}, inset 0 0 36px ${alpha(COLORS.orange, 0.07 * chrome)}, inset 0 1px 0 rgba(255,255,255,${0.1 * chrome})`,
				}}
			/>
			{/* placeholder mono */}
			{placeholder > 0.01 ? (
				<div
					style={{
						position: 'absolute',
						left: FIELD.x + FIELD.padX + 18,
						top: textTop + 14,
						fontFamily: FONTS.mono,
						fontSize: 34,
						color: alpha(COLORS.grayDim, placeholder),
						whiteSpace: 'pre',
					}}
				>
					Scrivi una domanda…
				</div>
			) : null}
			{/* testo digitato */}
			<div
				style={{
					position: 'absolute',
					left: FIELD.x + FIELD.padX,
					top: textTop,
					fontFamily: FONTS.body,
					fontWeight: 500,
					fontSize: TEXT_SIZE,
					lineHeight: `${FIELD.lineH}px`,
					letterSpacing: '-0.012em',
					whiteSpace: 'pre',
					color: COLORS.white,
				}}
			>
				<div style={{height: FIELD.lineH}}>
					{line1}
					{!onLine2 ? caretEl : null}
				</div>
				{grow > 0 ? (
					<div style={{height: FIELD.lineH}}>
						{line2}
						{onLine2 ? caretEl : null}
					</div>
				) : null}
			</div>
			{/* barra inferiore: suggerimento + invio */}
			<div
				style={{
					position: 'absolute',
					left: FIELD.x + FIELD.padX,
					top: btn.y - 16,
					fontFamily: FONTS.mono,
					fontSize: 24,
					letterSpacing: '0.14em',
					color: alpha(COLORS.grayDim, chrome),
					whiteSpace: 'nowrap',
				}}
			>
				↵ INVIO
			</div>
			<SendButton x={btn.x} y={btn.y} on={active} send={send} f={f} chrome={chrome} cheap={cheap} />
		</>
	);
};

/** Pulsante di invio: cerchio con freccia; a 45 lampo, piccolo "pop" e anello che si espande. */
const SendButton: React.FC<{x: number; y: number; on: number; send: number; f: number; chrome: number; cheap: boolean}> = ({x, y, on, send, f, chrome, cheap}) => {
	const R = 34;
	const ring = ease.outCubic(clamp((f - TYPE_END) / 14));
	const ringA = f >= TYPE_END ? (1 - ring) * 0.9 : 0;
	const pop = 1 + 0.16 * send;
	const nudge = -7 * send;
	return (
		<div style={{position: 'absolute', left: x - R, top: y - R, width: R * 2, height: R * 2, opacity: chrome}}>
			{ringA > 0.01 ? (
				<div
					style={{
						position: 'absolute',
						left: R - R * (1 + 1.6 * ring),
						top: R - R * (1 + 1.6 * ring),
						width: 2 * R * (1 + 1.6 * ring),
						height: 2 * R * (1 + 1.6 * ring),
						borderRadius: '50%',
						border: `${2.5 * (1 - ring) + 1}px solid ${alpha(COLORS.orangeHot, ringA)}`,
					}}
				/>
			) : null}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					borderRadius: '50%',
					transform: `scale(${pop})`,
					background: on > 0 ? `radial-gradient(circle at 50% 35%, ${send > 0.05 ? COLORS.orangeHot : COLORS.orangeBright}, ${COLORS.orange} 70%)` : 'transparent',
					opacity: 0.35 + 0.65 * on,
					border: `2px solid ${alpha(COLORS.orange, 0.6)}`,
					boxShadow: cheap ? undefined : `0 0 ${16 + 40 * send}px ${alpha(COLORS.orange, 0.45 + 0.45 * send)}`,
				}}
			/>
			<svg width={R * 2} height={R * 2} viewBox="0 0 68 68" style={{position: 'absolute', inset: 0, transform: `translateY(${nudge}px) scale(${pop})`}}>
				<path d="M34 47 V22 M23 32 L34 21 L45 32" fill="none" stroke={on > 0.5 ? '#1A1210' : COLORS.gray} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
			</svg>
		</div>
	);
};
