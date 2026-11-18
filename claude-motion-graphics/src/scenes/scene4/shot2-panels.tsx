import React from 'react';
import {clamp, ease, lerp} from '../../lib/math';
import {COLORS} from '../../theme';

/** Schermo dello shot 2: rettangolo arrotondato centrato sul palco (coordinate interne 900x700). */
export const SCREEN = {x: 90, y: 460, w: 900, h: 700, r: 30} as const;
const CX = SCREEN.w / 2;
const CY = SCREEN.h / 2;

const INK = COLORS.bg; // quasi-nero usato per le forme sui pannelli chiari
const DARK = '#1B1816';

export type PanelId = 0 | 1 | 2 | 3 | 4 | 5;

/** Fondi dei sei pannelli: scuro / arancione / bianco caldo alternati. */
export const PANEL_BG: Record<PanelId, string> = {
	0: DARK,
	1: COLORS.orange,
	2: COLORS.white,
	3: DARK,
	4: COLORS.orange,
	5: COLORS.white,
};

const centered = (size: number): React.CSSProperties => ({
	position: 'absolute',
	left: CX - size / 2,
	top: CY - size / 2,
	width: size,
	height: size,
});

/** Forma del pannello: `t` = frame trascorsi dal colpo che lo rivela (può essere negativo o frazionario). */
const Shape: React.FC<{id: PanelId; t: number}> = ({id, t}) => {
	const pop = ease.outBack(clamp((t + 1) / 7)); // entrata con piccolo rimbalzo
	const settle = ease.outQuint(clamp((t + 1) / 9));
	const drift = Math.max(0, t) * 0.004; // deriva lenta: la forma non è mai ferma
	switch (id) {
		case 0: // cerchio pieno + anello sottile
			return (
				<>
					<div style={{...centered(470), borderRadius: '50%', border: `3px solid ${COLORS.lineStrong}`, transform: `scale(${lerp(0.7, 1, settle) + drift * 2})`}} />
					<div style={{...centered(290), borderRadius: '50%', background: COLORS.white, transform: `scale(${pop + drift})`}} />
				</>
			);
		case 1: // triangolo che ruota in posizione
			return (
				<svg viewBox="-200 -200 400 400" style={{...centered(400), overflow: 'visible', transform: `rotate(${lerp(-70, 0, settle) + t * 0.6}deg) scale(${lerp(0.6, 1, pop)})`}}>
					<polygon points="0,-176 164,108 -164,108" fill={INK} stroke={INK} strokeWidth={26} strokeLinejoin="round" />
				</svg>
			);
		case 2: // anello: si stringe mentre l'iride si apre
			return (
				<div
					style={{
						...centered(330),
						borderRadius: '50%',
						border: `60px solid ${COLORS.orange}`,
						boxSizing: 'border-box',
						transform: `scale(${lerp(1.9, 1, settle) + drift})`,
					}}
				/>
			);
		case 3: // rombo
			return (
				<div
					style={{
						...centered(250),
						borderRadius: 28,
						background: COLORS.orange,
						transform: `rotate(${lerp(-45, 45, settle) + t * 0.5}deg) scale(${lerp(0.7, 1, pop)})`,
					}}
				/>
			);
		case 4: // cerchio = il "foro" attraverso cui passa lo zoom finale
			return <div style={{...centered(250), borderRadius: '50%', background: COLORS.white, transform: `scale(${lerp(0.55, 1, pop)})`}} />;
		case 5: {
			// croce che ruota in posizione
			const bar: React.CSSProperties = {position: 'absolute', left: CX - 155, top: CY - 44, width: 310, height: 88, borderRadius: 26, background: COLORS.orange};
			const tr = `rotate(${lerp(-135, 0, settle)}deg) scale(${lerp(0.2, 1, pop)})`;
			return (
				<div style={{position: 'absolute', inset: 0, transform: tr, transformOrigin: `${CX}px ${CY}px`}}>
					<div style={bar} />
					<div style={{...bar, transform: 'rotate(90deg)'}} />
				</div>
			);
		}
	}
};

/**
 * Un pannello a tutto schermo (fondo pieno + forma + leggera ombreggiatura per dare materia).
 * `shiftX` trasla solo la forma: parallasse durante la spinta laterale.
 */
export const Panel: React.FC<{id: PanelId; t: number; shiftX?: number; style?: React.CSSProperties}> = ({id, t, shiftX = 0, style}) => (
	<div style={{position: 'absolute', left: 0, top: 0, width: SCREEN.w, height: SCREEN.h, background: PANEL_BG[id], overflow: 'hidden', ...style}}>
		<div style={{position: 'absolute', inset: 0, transform: shiftX ? `translateX(${shiftX}px)` : undefined}}>
			<Shape id={id} t={t} />
		</div>
		<div
			style={{
				position: 'absolute',
				inset: 0,
				background: 'linear-gradient(155deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 42%, rgba(0,0,0,0.14) 100%)',
			}}
		/>
	</div>
);
