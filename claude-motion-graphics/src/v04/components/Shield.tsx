import React from 'react';
import {a4, C4} from '../theme';

/** Tracciato dello scudo (viewBox 0 0 200 240). */
export const SHIELD_PATH = 'M100 8 L182 40 L182 112 C182 168 146 208 100 232 C54 208 18 168 18 112 L18 40 Z';
const SHIELD_LEN = 720; // lunghezza approssimata del tracciato (per il disegno progressivo)

/**
 * Scudo digitale verde: contorno che si disegna (draw 0..1), riempimento a nido d'ape (fill 0..1), spunta (check 0..1),
 * glow pulsante. (x, y) = centro; size = altezza in px.
 */
export const Shield: React.FC<{
	x: number;
	y: number;
	size?: number;
	draw?: number;
	fill?: number;
	check?: number;
	glow?: number;
	opacity?: number;
	rotate?: number;
	scale?: number;
	color?: string;
}> = ({x, y, size = 420, draw = 1, fill = 1, check = 1, glow = 1, opacity = 1, rotate = 0, scale = 1, color = C4.green}) => {
	const w = (size * 200) / 240;
	const id = `hex-${Math.round(size)}`;
	return (
		<div style={{position: 'absolute', left: x - w / 2, top: y - size / 2, width: w, height: size, opacity, transform: `rotate(${rotate}deg) scale(${scale})`}}>
			<div style={{position: 'absolute', inset: -size * 0.4, borderRadius: '50%', background: `radial-gradient(closest-side, ${a4(color, 0.22 * glow)} 0%, ${a4(color, 0)} 100%)`}} />
			<svg viewBox="0 0 200 240" width={w} height={size} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
				<defs>
					<pattern id={id} width="16" height="27.7" patternUnits="userSpaceOnUse" patternTransform="scale(1)">
						<path d="M8 0 L16 4.6 L16 13.8 L8 18.5 L0 13.8 L0 4.6 Z" fill="none" stroke={a4(color, 0.35)} strokeWidth="1" />
					</pattern>
					<clipPath id={`${id}-clip`}>
						<path d={SHIELD_PATH} />
					</clipPath>
				</defs>
				{/* riempimento: gradiente + nido d'ape che sale dal basso */}
				<g clipPath={`url(#${id}-clip)`} opacity={fill}>
					<rect x="0" y={240 - 240 * fill} width="200" height={240 * fill} fill={a4(color, 0.12)} />
					<rect x="0" y={240 - 240 * fill} width="200" height={240 * fill} fill={`url(#${id})`} />
				</g>
				{/* contorno (alone + linea) */}
				<path d={SHIELD_PATH} fill="none" stroke={a4(color, 0.35 * glow)} strokeWidth="14" strokeLinejoin="round" strokeDasharray={SHIELD_LEN} strokeDashoffset={SHIELD_LEN * (1 - draw)} style={{filter: 'blur(6px)'}} />
				<path d={SHIELD_PATH} fill="none" stroke={color} strokeWidth="5" strokeLinejoin="round" strokeDasharray={SHIELD_LEN} strokeDashoffset={SHIELD_LEN * (1 - draw)} />
				<path d="M100 26 L166 52 L166 112" fill="none" stroke={a4(C4.white, 0.35 * draw)} strokeWidth="2" />
				{/* spunta */}
				<path d="M64 122 L92 150 L142 96" fill="none" stroke={C4.greenHot} strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="130" strokeDashoffset={130 * (1 - check)} style={{filter: `drop-shadow(0 0 10px ${a4(color, 0.9)})`}} />
			</svg>
		</div>
	);
};
