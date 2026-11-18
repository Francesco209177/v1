import React from 'react';
import {a4, C4} from '../../theme';

/** Triangolo di avviso disegnato in SVG (niente emoji: resa identica su ogni macchina). */
export const WarnGlyph: React.FC<{size?: number; color?: string; stroke?: number; fill?: string}> = ({size = 28, color = C4.redBright, stroke = 2.6, fill}) => (
	<svg width={size} height={size} viewBox="0 0 32 32" style={{display: 'block', overflow: 'visible'}}>
		<path d="M16 3.5 L29.5 27.5 Q30 28.5 28.8 28.5 L3.2 28.5 Q2 28.5 2.5 27.5 Z" fill={fill ?? a4(color, 0.16)} stroke={color} strokeWidth={stroke} strokeLinejoin="round" />
		<line x1="16" y1="11.5" x2="16" y2="19.5" stroke={color} strokeWidth={stroke * 1.15} strokeLinecap="round" />
		<circle cx="16" cy="24" r={stroke * 0.75} fill={color} />
	</svg>
);

/** Lucchetto della schermata di blocco. */
export const LockGlyph: React.FC<{size?: number; color?: string}> = ({size = 26, color = C4.white}) => (
	<svg width={size} height={size} viewBox="0 0 26 26" style={{display: 'block'}}>
		<path d="M8 11 V8 a5 5 0 0 1 10 0 V11" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
		<rect x="5" y="11" width="16" height="12" rx="3.2" fill={color} />
	</svg>
);

/** Icone di stato (segnale + batteria), puramente decorative. */
export const StatusIcons: React.FC<{color?: string}> = ({color = C4.white}) => (
	<svg width="78" height="20" viewBox="0 0 78 20" style={{display: 'block'}}>
		{[0, 1, 2, 3].map((i) => (
			<rect key={i} x={i * 7} y={14 - i * 3.6} width="4.6" height={5 + i * 3.6} rx="1.2" fill={color} opacity={i < 3 ? 1 : 0.45} />
		))}
		<rect x="38" y="3" width="32" height="14" rx="4" fill="none" stroke={color} strokeWidth="1.6" opacity="0.7" />
		<rect x="40.5" y="5.5" width="20" height="9" rx="2.2" fill={color} />
		<rect x="71.5" y="7.5" width="2.5" height="5" rx="1" fill={color} opacity="0.7" />
	</svg>
);
