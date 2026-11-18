import React from 'react';

/**
 * Tratto SVG con "draw-on" (pathLength normalizzato a 1). draw = 0..1 porzione disegnata.
 * Usato due volte per ogni linea: strato glow (largo, sfocato dal filtro del gruppo) + strato nucleo.
 */
export const Stroke: React.FC<{
	d: string;
	w: number;
	color: string;
	draw?: number;
	opacity?: number;
	cap?: 'round' | 'butt';
	dash?: string;
	dashOffset?: number;
}> = ({d, w, color, draw = 1, opacity = 1, cap = 'round', dash, dashOffset}) => {
	if (draw <= 0.002 || opacity <= 0.002) return null;
	const partial = draw < 0.999;
	return (
		<path
			d={d}
			fill="none"
			stroke={color}
			strokeWidth={w}
			strokeLinecap={cap}
			strokeLinejoin="round"
			opacity={opacity}
			pathLength={partial ? 1 : undefined}
			strokeDasharray={partial ? '1 1' : dash}
			strokeDashoffset={partial ? 1 - draw : dashOffset}
		/>
	);
};

/** Filtro di sfocatura per lo strato glow (limitato al bounding box del gruppo: mai a tutto schermo). */
export const GlowFilter: React.FC<{id: string; sd: number}> = ({id, sd}) => (
	<filter id={id} x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB">
		<feGaussianBlur stdDeviation={sd} />
	</filter>
);

/** Arco di cerchio (gradi, 0 = destra, senso orario in coordinate schermo). */
export const arcPath = (cx: number, cy: number, r: number, a0: number, a1: number): string => {
	const p = (a: number) => {
		const t = (a * Math.PI) / 180;
		return `${(cx + r * Math.cos(t)).toFixed(2)} ${(cy + r * Math.sin(t)).toFixed(2)}`;
	};
	const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
	return `M ${p(a0)} A ${r} ${r} 0 ${large} 1 ${p(a1)}`;
};

/** Rettangolo arrotondato come path (per il draw-on). */
export const roundRectPath = (x: number, y: number, w: number, h: number, r: number): string =>
	`M ${x + r} ${y} H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w} ${y + r} V ${y + h - r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y + h - r} V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`;

/** Ellisse come path (parte da destra, senso orario). */
export const ellipsePath = (cx: number, cy: number, rx: number, ry: number): string =>
	`M ${cx + rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx - rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx + rx} ${cy} Z`;
