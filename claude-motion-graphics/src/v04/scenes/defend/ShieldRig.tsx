import React from 'react';
import {Shield, SHIELD_PATH} from '../../components/Shield';
import {a4, C4} from '../../theme';
import {SHIELD_SIZE, type Pose} from '../finale/handoff';

/**
 * Scudo condiviso (components/Shield) montato su un "rig": posa (x, y, scala, schiacciamento sx/sy),
 * alone extra per gli impulsi, banda di scansione interna ritagliata sulla sagoma, scie di movimento.
 */
export const ShieldRig: React.FC<{
	id: string;
	pose: Pose;
	draw?: number;
	fill?: number;
	check?: number;
	glow?: number;
	pulse?: number; // 0..1 impulso (alone + anello)
	scan?: number; // posizione 0..1 della banda di scansione (fuori range = nascosta)
	opacity?: number;
	trail?: number; // 0..1 scia verticale (colpo veloce)
	trailDir?: number; // +1 = si muove verso il basso
}> = ({id, pose, draw = 1, fill = 1, check = 1, glow = 1, pulse = 0, scan = -1, opacity = 1, trail = 0, trailDir = 1}) => {
	const size = SHIELD_SIZE;
	const w = (size * 200) / 240;
	const sx = pose.s * (pose.sx ?? 1);
	const sy = pose.s * (pose.sy ?? 1);
	const scanOn = scan > -0.1 && scan < 1.1;
	return (
		<div style={{position: 'absolute', left: 0, top: 0, width: 0, height: 0, transform: `translate(${pose.x}px, ${pose.y}px) scale(${sx}, ${sy})`, opacity}}>
			{/* alone dell'impulso */}
			{pulse > 0.01 ? (
				<div
					style={{
						position: 'absolute',
						left: -size * 0.95,
						top: -size * 0.95,
						width: size * 1.9,
						height: size * 1.9,
						borderRadius: '50%',
						background: `radial-gradient(closest-side, ${a4(C4.greenBright, 0.32 * pulse)} 0%, ${a4(C4.green, 0.12 * pulse)} 45%, ${a4(C4.green, 0)} 100%)`,
					}}
				/>
			) : null}
			{/* scie (copie sfasate lungo la direzione del moto) */}
			{trail > 0.02
				? [1, 2, 3].map((k) => (
						<div key={k} style={{position: 'absolute', left: 0, top: 0, transform: `translateY(${-trailDir * k * 70 * trail}px)`, opacity: 0.32 * trail * (1 - k * 0.25)}}>
							<Shield x={0} y={0} size={size} draw={draw} fill={fill * 0.5} check={0} glow={glow * 0.6} />
						</div>
					))
				: null}
			<Shield x={0} y={0} size={size} draw={draw} fill={fill} check={check} glow={glow} />
			{/* banda di scansione dentro la sagoma */}
			{scanOn ? (
				<svg viewBox="0 0 200 240" width={w} height={size} style={{position: 'absolute', left: -w / 2, top: -size / 2, overflow: 'visible'}}>
					<defs>
						<clipPath id={`${id}-clip`}>
							<path d={SHIELD_PATH} />
						</clipPath>
						<linearGradient id={`${id}-scan`} x1="0" y1="0" x2="0" y2="1">
							<stop offset="0" stopColor={C4.greenBright} stopOpacity="0" />
							<stop offset="0.82" stopColor={C4.greenBright} stopOpacity="0.28" />
							<stop offset="0.97" stopColor={C4.greenHot} stopOpacity="0.9" />
							<stop offset="1" stopColor={C4.greenHot} stopOpacity="0" />
						</linearGradient>
					</defs>
					<g clipPath={`url(#${id}-clip)`}>
						<rect x="0" y={-60 + scan * 300 - 60} width="200" height="60" fill={`url(#${id}-scan)`} />
					</g>
				</svg>
			) : null}
		</div>
	);
};
