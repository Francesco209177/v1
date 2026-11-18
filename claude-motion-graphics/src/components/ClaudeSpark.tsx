import React, {useId} from 'react';
import {useAbsFrame} from '../lib/frame';
import {beatPulse} from '../lib/math';
import {SPARK_CENTER, SPARK_PATH, SPARK_VIEWBOX} from '../lib/spark';
import {COLORS} from '../theme';

/**
 * Il protagonista: il simbolo arancione di Claude, con glow cinematografico a strati.
 * - x, y: centro in px · size: lato del box in px · rotation in gradi.
 * - reveal 0..1: i raggi "crescono" dal mozzo verso l'esterno (maschera radiale).
 * - glow: intensità dell'alone (0 = piatto, 1 = standard, >1 = acceso).
 * - beat: ampiezza del battito sul beat musicale (usa il frame assoluto => sempre in sync).
 */
export const ClaudeSpark: React.FC<{
	x: number;
	y: number;
	size: number;
	rotation?: number;
	scale?: number;
	opacity?: number;
	reveal?: number;
	glow?: number;
	beat?: number;
	color?: string;
	halo?: boolean;
	style?: React.CSSProperties;
}> = ({
	x,
	y,
	size,
	rotation = 0,
	scale = 1,
	opacity = 1,
	reveal = 1,
	glow = 1,
	beat = 1,
	color = COLORS.orange,
	halo = true,
	style,
}) => {
	const abs = useAbsFrame();
	const id = useId().replace(/:/g, '');
	const pulse = beatPulse(abs, 4.5);
	const breathe = 1 + 0.022 * pulse * beat + 0.006 * Math.sin((abs / 90) * Math.PI * 2);
	const glowK = glow * (1 + 0.28 * pulse * beat);
	if (opacity <= 0 || size <= 0) return null;

	const masked = reveal < 0.999;
	const r = Math.max(0, reveal) * 17.5;
	const shape = (fill: string) => (
		<svg
			viewBox={`0 0 ${SPARK_VIEWBOX} ${SPARK_VIEWBOX}`}
			width={size}
			height={size}
			style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}}
		>
			{masked ? (
				<defs>
					<clipPath id={`clip-${id}`}>
						<circle cx={SPARK_CENTER.x} cy={SPARK_CENTER.y} r={r} />
					</clipPath>
				</defs>
			) : null}
			<path d={SPARK_PATH} fill={fill} clipPath={masked ? `url(#clip-${id})` : undefined} />
		</svg>
	);

	const cx = (SPARK_CENTER.x / SPARK_VIEWBOX) * 100;
	const cy = (SPARK_CENTER.y / SPARK_VIEWBOX) * 100;
	return (
		<div
			style={{
				position: 'absolute',
				left: x - size / 2,
				top: y - size / 2,
				width: size,
				height: size,
				opacity,
				transform: `rotate(${rotation}deg) scale(${scale * breathe})`,
				transformOrigin: `${cx}% ${cy}%`,
				...style,
			}}
		>
			{halo && glow > 0 ? (
				<div
					style={{
						position: 'absolute',
						left: `${cx}%`,
						top: `${cy}%`,
						width: size * 3.4,
						height: size * 3.4,
						marginLeft: -size * 1.7,
						marginTop: -size * 1.7,
						borderRadius: '50%',
						background: `radial-gradient(closest-side, rgba(217,119,87,${0.26 * Math.min(1.6, glowK) * Math.min(1, reveal * 1.4)}) 0%, rgba(217,119,87,${0.09 * Math.min(1.6, glowK) * Math.min(1, reveal * 1.4)}) 38%, rgba(217,119,87,0) 100%)`,
					}}
				/>
			) : null}
			{glow > 0 ? (
				<div style={{position: 'absolute', inset: 0, filter: `blur(${size * 0.16}px)`, opacity: Math.min(1, 0.6 * glowK)}}>
					{shape(COLORS.orangeBright)}
				</div>
			) : null}
			{glow > 0 ? (
				<div style={{position: 'absolute', inset: 0, filter: `blur(${size * 0.045}px)`, opacity: Math.min(1, 0.75 * glowK)}}>
					{shape(COLORS.orange)}
				</div>
			) : null}
			{shape(color)}
		</div>
	);
};
