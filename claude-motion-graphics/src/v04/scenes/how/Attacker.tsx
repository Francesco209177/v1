import React from 'react';
import {clamp, hash} from '../../../lib/math';
import {FONTS} from '../../../theme';
import {a4, C4} from '../../theme';
import {IconWarn} from './icons';

/** Geometria dell'attaccante (relativa al suo centro, px prima della scala). */
export const ATK = {silY: -150, silSize: 400, panelY: 50, panelH: 290, panelW: 700, slot1: 168, slot2: 262, slotH: 74} as const;

/** Sagoma incappucciata (viewBox 200×200): cappuccio + spalle, volto vuoto. Nessun teschio, nessun cartoon. */
const HOOD = 'M100 14 C60 14 40 50 40 90 C40 110 46 124 54 134 C32 142 16 162 10 200 L190 200 C184 162 168 142 146 134 C154 124 160 110 160 90 C160 50 140 14 100 14 Z';
const FACE = 'M100 50 C80 50 68 70 68 94 C68 116 82 132 100 132 C118 132 132 116 132 94 C132 70 120 50 100 50 Z';

/**
 * L'attaccante, astratto: figura incappucciata in controluce rossa, anelli di "ricezione", colonne di esadecimali
 * casuali (decorative, nessun codice reale) e il pannello dove arrivano i dati rubati.
 * (x, y) = centro sullo schermo; z = scala della camera; show 0..1; hitK = lampo all'arrivo dei dati; dark = accento scuro.
 */
export const Attacker: React.FC<{f: number; x: number; y: number; z: number; show: number; hitK: number; dark: number; docked: number}> = ({
	f,
	x,
	y,
	z,
	show,
	hitK,
	dark,
	docked,
}) => {
	if (show <= 0.01) return null;
	const S = ATK.silSize;
	const halo = 0.55 + 0.45 * hitK + 0.08 * Math.sin(f / 5);
	const rows = 7;
	const hex = (col: number): string[] =>
		Array.from({length: rows}, (_, r) => {
			const k = Math.floor(f / 3) + r;
			return [0, 1, 2].map((j) => Math.floor(hash(col * 97 + k, j) * 256).toString(16).toUpperCase().padStart(2, '0')).join(' ');
		});
	return (
		<div style={{position: 'absolute', left: x, top: y, width: 0, height: 0, opacity: show}}>
			<div style={{position: 'absolute', left: 0, top: 0, transform: `scale(${z})`}}>
				{/* controluce rossa */}
				<div
					style={{
						position: 'absolute',
						left: -420,
						top: ATK.silY - 420,
						width: 840,
						height: 840,
						borderRadius: '50%',
						background: `radial-gradient(closest-side, ${a4(C4.red, 0.42 * halo)} 0%, ${a4(C4.redDeep, 0.3 * halo)} 38%, ${a4(C4.redDeep, 0)} 100%)`,
					}}
				/>
				{/* anelli */}
				<svg width={600} height={600} viewBox="-300 -300 600 600" style={{position: 'absolute', left: -300, top: ATK.silY - 300, overflow: 'visible'}}>
					<circle r="214" fill="none" stroke={a4(C4.red, 0.45)} strokeWidth="2" strokeDasharray="6 14" transform={`rotate(${f * 0.8})`} />
					<circle r="258" fill="none" stroke={a4(C4.red, 0.22)} strokeWidth="2" strokeDasharray="120 40 8 40" transform={`rotate(${-f * 0.5})`} />
					<circle r={180 + 90 * (1 - hitK)} fill="none" stroke={a4(C4.redBright, 0.6 * hitK)} strokeWidth={3} />
				</svg>
				{/* colonne esadecimali decorative */}
				{[-1, 1].map((side) => (
					<div
						key={side}
						style={{
							position: 'absolute',
							left: side < 0 ? -350 : 228,
							top: ATK.silY - 170,
							width: 122,
							fontFamily: FONTS.mono,
							fontSize: 24,
							lineHeight: '36px',
							color: a4(C4.red, 0.32),
							textAlign: side < 0 ? 'right' : 'left',
							WebkitMaskImage: 'linear-gradient(180deg, transparent, #000 30%, #000 70%, transparent)',
							maskImage: 'linear-gradient(180deg, transparent, #000 30%, #000 70%, transparent)',
							whiteSpace: 'pre',
						}}
					>
						{hex(side < 0 ? 1 : 2).join('\n')}
					</div>
				))}
				{/* sagoma */}
				<svg width={S} height={S} viewBox="0 0 200 200" style={{position: 'absolute', left: -S / 2, top: ATK.silY - S / 2, overflow: 'visible'}}>
					<defs>
						<linearGradient id="how-hood" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0" stopColor="#1C2123" />
							<stop offset="0.55" stopColor="#0B0D0E" />
							<stop offset="1" stopColor="#050606" />
						</linearGradient>
						<radialGradient id="how-face" cx="0.5" cy="0.35" r="0.7">
							<stop offset="0" stopColor="#000" />
							<stop offset="1" stopColor="#020303" />
						</radialGradient>
					</defs>
					<path d={HOOD} fill="none" stroke={a4(C4.red, 0.75 * halo)} strokeWidth="8" style={{filter: 'blur(5px)'}} />
					<path d={HOOD} fill="url(#how-hood)" stroke={a4(C4.redBright, 0.55)} strokeWidth="1.6" />
					<path d={FACE} fill="url(#how-face)" stroke={a4(C4.red, 0.25)} strokeWidth="1" />
					<path d="M78 70 C86 60 96 57 104 57" fill="none" stroke={a4(C4.redBright, 0.35)} strokeWidth="1.4" strokeLinecap="round" />
				</svg>
				{/* accento scuro sulla sagoma */}
				<div
					style={{
						position: 'absolute',
						left: -500,
						top: ATK.silY - 500,
						width: 1000,
						height: 1000,
						borderRadius: '50%',
						background: `radial-gradient(closest-side, rgba(0,0,0,0) 30%, rgba(0,0,0,${0.5 * dark}) 100%)`,
					}}
				/>
				{/* pannello di ricezione */}
				<div
					style={{
						position: 'absolute',
						left: -ATK.panelW / 2,
						top: ATK.panelY,
						width: ATK.panelW,
						height: ATK.panelH,
						borderRadius: 26,
						background: 'linear-gradient(180deg, rgba(22,10,11,0.94) 0%, rgba(8,9,10,0.96) 100%)',
						border: `2px solid ${a4(C4.red, 0.35 + 0.4 * hitK)}`,
						boxShadow: `0 40px 110px rgba(0,0,0,0.8), 0 0 ${50 + 60 * hitK}px ${a4(C4.red, 0.22 + 0.3 * hitK)}`,
					}}
				>
					<div
						style={{
							position: 'absolute',
							left: 30,
							top: 26,
							display: 'flex',
							alignItems: 'center',
							gap: 12,
							fontFamily: FONTS.mono,
							fontWeight: 700,
							fontSize: 24,
							letterSpacing: '0.14em',
							color: C4.redBright,
						}}
					>
						<IconWarn size={26} color={C4.redBright} />
						DATI RICEVUTI
					</div>
					<div
						style={{
							position: 'absolute',
							right: 30,
							top: 26,
							fontFamily: FONTS.mono,
							fontWeight: 700,
							fontSize: 24,
							letterSpacing: '0.14em',
							color: docked > 0.5 ? C4.redHot : C4.grayDim,
						}}
					>
						{Math.round(clamp(docked) * 2)}/2
					</div>
					{[ATK.slot1, ATK.slot2].map((sy, i) => (
						<div
							key={i}
							style={{
								position: 'absolute',
								left: 30,
								right: 30,
								top: sy - ATK.panelY - ATK.slotH / 2,
								height: ATK.slotH,
								borderRadius: 16,
								border: `2px dashed ${a4(C4.red, 0.3)}`,
								background: a4(C4.red, 0.04),
							}}
						/>
					))}
				</div>
			</div>
		</div>
	);
};
