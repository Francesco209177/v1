import React from 'react';
import {clamp} from '../../../lib/math';
import {a4, C4} from '../../theme';

/** Silhouette del dito (punta in (0,0), il dito si allunga verso +y). */
const BODY =
	'M -63,94 C -65,36 -37,0 0,0 C 37,0 65,36 63,94 L 70,560 C 72,720 76,960 82,1500 L -82,1500 C -76,960 -72,720 -70,560 Z';
const RIM_L = 'M -70,640 L -63,94 C -65,36 -37,0 0,0';
const RIM_R = 'M 70,640 L 63,94 C 65,36 37,0 0,0';
const NAIL = 'M -33,44 C -33,20 -18,10 0,10 C 18,10 33,20 33,44 L 31,116 C 31,128 22,134 0,134 C -22,134 -31,128 -31,116 Z';

const Svg: React.FC<{children: React.ReactNode}> = ({children}) => (
	<svg width={200} height={1520} viewBox="-100 -20 200 1520" style={{position: 'absolute', left: -100, top: -20, overflow: 'visible'}}>
		{children}
	</svg>
);

/**
 * Polpastrello stilizzato ed elegante (SVG): silhouette grigio-bianca con ombreggiatura cilindrica, unghia appena
 * accennata, luce di contorno e riflesso rosso del pulsante quando si avvicina. L'ombra sul vetro converge
 * verso la punta mentre il dito scende (h = altezza sopra lo schermo, 0 = contatto).
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
	const k = (1 + 0.1 * hh) * (1 - 0.015 * press);
	const shadowBlur = 3 + 26 * hh;
	return (
		<>
			{/* ombra proiettata sul vetro: la luce arriva dall'alto a sinistra */}
			<div
				style={{
					position: 'absolute',
					left: x + 46 * hh + 4,
					top: y + 70 * hh + 6,
					width: 0,
					height: 0,
					opacity: opacity * (0.75 - 0.25 * hh),
					filter: `blur(${shadowBlur}px)`,
					transform: `rotate(${angle}deg) scale(${k * 0.98})`,
					transformOrigin: '0 0',
				}}
			>
				<Svg>
					<path d={BODY} fill="rgba(0,0,0,0.85)" />
				</Svg>
			</div>
			<div style={{position: 'absolute', left: x, top: y, width: 0, height: 0, opacity, transform: `rotate(${angle}deg) scale(${k}, ${k * (1 - 0.02 * press)})`, transformOrigin: '0 0'}}>
				<Svg>
					<defs>
						<linearGradient id="fgShade" gradientUnits="userSpaceOnUse" x1="-84" y1="0" x2="84" y2="0">
							<stop offset="0" stopColor="#2B3230" />
							<stop offset="0.13" stopColor="#6B7572" />
							<stop offset="0.35" stopColor="#D5DCD9" />
							<stop offset="0.5" stopColor="#ECF0EE" />
							<stop offset="0.68" stopColor="#C2CAC6" />
							<stop offset="0.88" stopColor="#626C69" />
							<stop offset="1" stopColor="#262C2A" />
						</linearGradient>
						<linearGradient id="fgFade" gradientUnits="userSpaceOnUse" x1="0" y1="380" x2="0" y2="1250">
							<stop offset="0" stopColor="#040506" stopOpacity="0" />
							<stop offset="1" stopColor="#040506" stopOpacity="0.9" />
						</linearGradient>
						<radialGradient id="fgRed" gradientUnits="userSpaceOnUse" cx="0" cy="-10" r="190">
							<stop offset="0" stopColor={C4.redBright} stopOpacity={0.75 * prox} />
							<stop offset="0.5" stopColor={C4.red} stopOpacity={0.3 * prox} />
							<stop offset="1" stopColor={C4.red} stopOpacity="0" />
						</radialGradient>
						<radialGradient id="fgTip" gradientUnits="userSpaceOnUse" cx="-12" cy="46" r="80">
							<stop offset="0" stopColor="#FFFFFF" stopOpacity="0.38" />
							<stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
						</radialGradient>
						<linearGradient id="fgNail" gradientUnits="userSpaceOnUse" x1="-33" y1="0" x2="33" y2="0">
							<stop offset="0" stopColor="#C9D1CE" />
							<stop offset="0.45" stopColor="#F6F9F8" />
							<stop offset="1" stopColor="#B4BDB9" />
						</linearGradient>
						<linearGradient id="fgRim" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="640">
							<stop offset="0" stopColor="#FFFFFF" stopOpacity="0.85" />
							<stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
						</linearGradient>
						<clipPath id="fgClip">
							<path d={BODY} />
						</clipPath>
					</defs>
					<path d={BODY} fill="url(#fgShade)" />
					<g clipPath="url(#fgClip)">
						<rect x="-100" y="-20" width="200" height="1520" fill="url(#fgTip)" />
						{/* pieghe dell'articolazione */}
						<path d="M -42,318 Q 0,302 42,318" fill="none" stroke="rgba(40,46,44,0.32)" strokeWidth="3" strokeLinecap="round" />
						<path d="M -30,338 Q 0,326 30,338" fill="none" stroke="rgba(40,46,44,0.22)" strokeWidth="2.4" strokeLinecap="round" />
						<path d="M -50,330 Q 0,316 50,330" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="2" strokeLinecap="round" />
						{/* unghia */}
						<path d={NAIL} fill="url(#fgNail)" opacity="0.5" stroke="rgba(255,255,255,0.4)" strokeWidth="1.4" />
						<path d="M -26,26 C -16,16 16,16 26,26" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2.2" strokeLinecap="round" />
						<rect x="-100" y="-20" width="200" height="1520" fill="url(#fgFade)" />
						<rect x="-100" y="-20" width="200" height="1520" fill="url(#fgRed)" style={{mixBlendMode: 'screen'}} />
					</g>
					{/* luce di contorno */}
					<path d={RIM_L} fill="none" stroke="url(#fgRim)" strokeWidth="2.4" />
					<path d={RIM_R} fill="none" stroke="url(#fgRim)" strokeWidth="1.6" opacity="0.45" />
					{prox > 0.02 ? <path d={RIM_R} fill="none" stroke={a4(C4.redBright, 0.75 * prox)} strokeWidth="2.6" /> : null}
				</Svg>
			</div>
		</>
	);
};
