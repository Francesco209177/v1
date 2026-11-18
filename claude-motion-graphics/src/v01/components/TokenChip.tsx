import React from 'react';
import {alpha, COLORS, FONTS} from '../../theme';

/** Larghezza stimata di un token (JetBrains Mono: 0.6 em per carattere) + padding. */
export const tokenWidth = (text: string, size = 44): number => text.replace(/^ /, '·').length * size * 0.6 + size * 0.9;

/**
 * Token luminoso: blocco arrotondato con testo mono. Lo spazio iniziale (tipico dei tokenizer) è reso con "·".
 * - glow 0..1.5: intensità della luce · id: numero mostrato sotto (opzionale) · active: bordo acceso.
 * Posizionato con il CENTRO in (x, y).
 */
export const TokenChip: React.FC<{
	text: string;
	x: number;
	y: number;
	size?: number;
	glow?: number;
	opacity?: number;
	scale?: number;
	rotate?: number;
	id?: number | null;
	idOpacity?: number;
	active?: boolean;
	color?: string;
}> = ({text, x, y, size = 44, glow = 1, opacity = 1, scale = 1, rotate = 0, id = null, idOpacity = 1, active = false, color = COLORS.orange}) => {
	if (opacity <= 0.003) return null;
	const w = tokenWidth(text, size);
	const h = size * 1.55;
	const shown = text.replace(/^ /, '·');
	return (
		<div
			style={{
				position: 'absolute',
				left: x - w / 2,
				top: y - h / 2,
				width: w,
				height: h,
				opacity,
				transform: `scale(${scale}) rotate(${rotate}deg)`,
			}}
		>
			<div
				style={{
					position: 'absolute',
					inset: 0,
					borderRadius: size * 0.32,
					background: `linear-gradient(180deg, ${alpha(color, 0.26)}, ${alpha(COLORS.orangeDeep, 0.2)})`,
					border: `2px solid ${alpha(active ? COLORS.orangeHot : color, active ? 0.95 : 0.6)}`,
					boxShadow: `0 0 ${18 * glow}px ${alpha(color, 0.45 * glow)}, 0 0 ${48 * glow}px ${alpha(color, 0.22 * glow)}, inset 0 1px 0 rgba(255,255,255,0.12)`,
				}}
			/>
			<div
				style={{
					position: 'absolute',
					inset: 0,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					fontFamily: FONTS.mono,
					fontWeight: 500,
					fontSize: size,
					color: COLORS.white,
					whiteSpace: 'pre',
					textShadow: `0 0 ${14 * glow}px ${alpha(COLORS.orangeHot, 0.5 * glow)}`,
				}}
			>
				{shown.split('').map((ch, i) => (
					<span key={i} style={{color: ch === '·' ? alpha(COLORS.orangeBright, 0.8) : COLORS.white}}>
						{ch}
					</span>
				))}
			</div>
			{id !== null && idOpacity > 0.01 ? (
				<div
					style={{
						position: 'absolute',
						left: -40,
						right: -40,
						top: h + size * 0.25,
						textAlign: 'center',
						fontFamily: FONTS.mono,
						fontSize: Math.max(24, size * 0.56),
						color: alpha(COLORS.gray, idOpacity),
						letterSpacing: '0.04em',
					}}
				>
					{id}
				</div>
			) : null}
		</div>
	);
};
