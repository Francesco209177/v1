import React from 'react';
import {clamp} from '../../../lib/math';
import {a4, C4} from '../../theme';

/**
 * Mano destra vista dal dorso, indice teso (punta in (0,0), il dito si allunga verso +y).
 * +x = lato del medio (la nocca del medio piegato affiora vicino al bordo del quadro).
 */
const INDEX =
	'M -98,1500 C -96,1120 -88,820 -82,650 C -80,590 -81,548 -78,505 C -75,450 -71,390 -70,338 ' +
	'C -70,306 -73,286 -71,264 C -69,222 -66,156 -65,104 C -64,44 -38,4 0,2 C 38,4 64,44 65,104 ' +
	'C 66,156 69,222 71,264 C 73,286 70,306 70,338 C 71,390 75,450 78,505 C 81,548 80,590 84,640 ' +
	'L 96,1500 Z';
/** Nocca e dito medio piegato, dietro l'indice. */
const MIDDLE = 'M 60,600 C 96,566 158,574 190,628 C 216,676 222,780 224,900 L 236,1500 L 60,1500 Z';
const RIM_L = 'M -80,640 C -80,590 -81,548 -78,505 C -75,450 -71,390 -70,338 C -70,306 -73,286 -71,264 C -69,222 -66,156 -65,104 C -64,44 -38,4 0,2';
const RIM_R = 'M 0,2 C 38,4 64,44 65,104 C 66,156 69,222 71,264 C 73,286 70,306 70,338 C 71,390 75,450 78,505';
const RIM_M = 'M 96,586 C 130,570 170,590 190,628 C 210,664 218,740 222,820';
const NAIL = 'M -31,40 C -31,20 -17,11 0,11 C 17,11 31,20 31,40 L 30,112 C 29,126 18,134 0,134 C -18,134 -29,126 -30,112 Z';

const Svg: React.FC<{children: React.ReactNode}> = ({children}) => (
	<svg width={360} height={1540} viewBox="-120 -20 360 1540" style={{position: 'absolute', left: -120, top: -20, overflow: 'visible'}}>
		{children}
	</svg>
);

/** Pieghe della pelle sopra un'articolazione (dorso del dito). */
const Creases: React.FC<{y: number; w: number}> = ({y, w}) => (
	<g fill="none" strokeLinecap="round">
		<path d={`M ${-w},${y} Q 0,${y - 13} ${w},${y}`} stroke="rgba(38,44,42,0.30)" strokeWidth="2.6" />
		<path d={`M ${-w * 0.8},${y + 15} Q 0,${y + 4} ${w * 0.8},${y + 15}`} stroke="rgba(38,44,42,0.22)" strokeWidth="2.2" />
		<path d={`M ${-w * 0.6},${y + 29} Q 0,${y + 20} ${w * 0.6},${y + 29}`} stroke="rgba(38,44,42,0.14)" strokeWidth="2" />
		<path d={`M ${-w * 0.9},${y + 7} Q 0,${y - 5} ${w * 0.9},${y + 7}`} stroke="rgba(255,255,255,0.10)" strokeWidth="1.6" />
	</g>
);

/**
 * Dito stilizzato ed elegante (SVG): silhouette grigio-bianca morbida con modellato cilindrico, pieghe delle
 * articolazioni, unghia appena accennata, luce di contorno e riflesso rosso del pulsante quando si avvicina.
 * L'ombra sul vetro converge verso la punta mentre il dito scende (h = altezza sopra lo schermo, 0 = contatto).
 */
export const Finger: React.FC<{x: number; y: number; angle: number; h: number; prox: number; press: number; opacity: number}> = ({
	x,
	y,
	angle,
	h,
	prox,
	press,
	opacity,
}) => {
	if (opacity <= 0.002) return null;
	const hh = clamp(h);
	const k = 1.12 * (1 + 0.09 * hh) * (1 - 0.015 * press);
	const shadowBlur = 4 + 24 * hh;
	return (
		<>
			{/* ombra proiettata sul vetro: la luce arriva dall'alto a sinistra */}
			<div
				style={{
					position: 'absolute',
					left: x + 50 * hh + 6,
					top: y + 74 * hh + 8,
					width: 0,
					height: 0,
					opacity: opacity * (0.8 - 0.3 * hh),
					filter: `blur(${shadowBlur.toFixed(1)}px)`,
					transform: `rotate(${angle}deg) scale(${k * 0.98})`,
					transformOrigin: '0 0',
				}}
			>
				<Svg>
					<path d={MIDDLE} fill="rgba(0,0,0,0.8)" />
					<path d={INDEX} fill="rgba(0,0,0,0.85)" />
				</Svg>
			</div>
			<div style={{position: 'absolute', left: x, top: y, width: 0, height: 0, opacity, transform: `rotate(${angle}deg) scale(${k}, ${k * (1 - 0.02 * press)})`, transformOrigin: '0 0'}}>
				<Svg>
					<defs>
						<linearGradient id="fgShade" gradientUnits="userSpaceOnUse" x1="-92" y1="0" x2="92" y2="0">
							<stop offset="0" stopColor="#434B49" />
							<stop offset="0.14" stopColor="#7C8682" />
							<stop offset="0.34" stopColor="#C3CBC7" />
							<stop offset="0.47" stopColor="#DDE3E0" />
							<stop offset="0.64" stopColor="#C6CECA" />
							<stop offset="0.86" stopColor="#89938F" />
							<stop offset="1" stopColor="#4A5250" />
						</linearGradient>
						<linearGradient id="fgMid" gradientUnits="userSpaceOnUse" x1="60" y1="0" x2="236" y2="0">
							<stop offset="0" stopColor="#3B4341" />
							<stop offset="0.45" stopColor="#8E9894" />
							<stop offset="1" stopColor="#3A423F" />
						</linearGradient>
						<linearGradient id="fgFade" gradientUnits="userSpaceOnUse" x1="0" y1="420" x2="0" y2="1150">
							<stop offset="0" stopColor="#040506" stopOpacity="0" />
							<stop offset="1" stopColor="#040506" stopOpacity="0.92" />
						</linearGradient>
						<radialGradient id="fgRed" gradientUnits="userSpaceOnUse" cx="0" cy="-10" r="210">
							<stop offset="0" stopColor={C4.redBright} stopOpacity={0.7 * prox} />
							<stop offset="0.5" stopColor={C4.red} stopOpacity={0.28 * prox} />
							<stop offset="1" stopColor={C4.red} stopOpacity="0" />
						</radialGradient>
						<radialGradient id="fgSpec">
							<stop offset="0" stopColor="#FFFFFF" stopOpacity="0.42" />
							<stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
						</radialGradient>
						<linearGradient id="fgNail" gradientUnits="userSpaceOnUse" x1="-31" y1="0" x2="31" y2="0">
							<stop offset="0" stopColor="#AEB7B3" />
							<stop offset="0.42" stopColor="#F2F6F4" />
							<stop offset="1" stopColor="#A2ABA7" />
						</linearGradient>
						<linearGradient id="fgRim" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="660">
							<stop offset="0" stopColor="#FFFFFF" stopOpacity="0.8" />
							<stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
						</linearGradient>
						<clipPath id="fgClipI">
							<path d={INDEX} />
						</clipPath>
						<clipPath id="fgClipM">
							<path d={MIDDLE} />
						</clipPath>
					</defs>
					{/* dito medio piegato (dietro) */}
					<path d={MIDDLE} fill="url(#fgMid)" />
					<g clipPath="url(#fgClipM)">
						<ellipse cx="150" cy="660" rx="40" ry="70" fill="url(#fgSpec)" opacity="0.6" />
						<rect x="0" y="400" width="260" height="1120" fill="url(#fgFade)" />
					</g>
					<path d={RIM_M} fill="none" stroke="url(#fgRim)" strokeWidth="1.6" opacity="0.5" />
					{/* indice */}
					<path d={INDEX} fill="url(#fgShade)" />
					<g clipPath="url(#fgClipI)">
						{/* ombra di contatto tra indice e medio */}
						<path d="M 84,560 C 80,620 82,700 88,900" fill="none" stroke="rgba(10,12,12,0.45)" strokeWidth="16" />
						{/* riflessi speculari spezzati dalle articolazioni */}
						<ellipse cx="-18" cy="168" rx="20" ry="86" fill="url(#fgSpec)" />
						<ellipse cx="-20" cy="420" rx="22" ry="100" fill="url(#fgSpec)" opacity="0.75" />
						<Creases y={268} w={44} />
						<Creases y={512} w={50} />
						{/* unghia */}
						<path d={NAIL} fill="url(#fgNail)" opacity="0.55" stroke="rgba(255,255,255,0.38)" strokeWidth="1.3" />
						<path d="M -22,118 Q 0,128 22,118" fill="none" stroke="rgba(60,68,66,0.35)" strokeWidth="2" />
						<path d="M -24,26 C -14,16 14,16 24,26" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2.2" strokeLinecap="round" />
						<ellipse cx="-9" cy="64" rx="7" ry="34" fill="rgba(255,255,255,0.32)" />
						<rect x="-120" y="-20" width="360" height="1540" fill="url(#fgFade)" />
						<rect x="-120" y="-20" width="360" height="1540" fill="url(#fgRed)" style={{mixBlendMode: 'screen'}} />
					</g>
					{/* luce di contorno */}
					<path d={RIM_L} fill="none" stroke="url(#fgRim)" strokeWidth="2.4" />
					<path d={RIM_R} fill="none" stroke="url(#fgRim)" strokeWidth="1.5" opacity="0.4" />
					{prox > 0.02 ? <path d={RIM_R} fill="none" stroke={a4(C4.redBright, 0.75 * prox)} strokeWidth="2.6" /> : null}
					{prox > 0.02 ? <path d={RIM_L} fill="none" stroke={a4(C4.redBright, 0.35 * prox)} strokeWidth="2" /> : null}
				</Svg>
			</div>
		</>
	);
};
