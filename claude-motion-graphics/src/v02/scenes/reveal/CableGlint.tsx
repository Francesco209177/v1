import React from 'react';
import {LAPTOP} from '../../components/Laptop';
import {alpha, COLORS} from '../../../theme';

type Pose = {x: number; y: number; scale: number; rotX: number; rotY: number};

const PERSP = 2400;
const D2R = Math.PI / 180;

/** Proiezione di un punto del gruppo 3D del laptop (stesse trasformazioni CSS del componente condiviso). */
const project = (pose: Pose, p: {x: number; y: number; z: number}) => {
	const ay = pose.rotY * D2R;
	const ax = pose.rotX * D2R;
	const x1 = p.x * Math.cos(ay) + p.z * Math.sin(ay);
	const z1 = -p.x * Math.sin(ay) + p.z * Math.cos(ay);
	const y2 = p.y * Math.cos(ax) - z1 * Math.sin(ax);
	const z2 = p.y * Math.sin(ax) + z1 * Math.cos(ax);
	const k = PERSP / (PERSP - z2);
	return {x: pose.x + x1 * pose.scale * k, y: pose.y + y2 * pose.scale * k};
};

/** Punto sul piano della base (coordinate locali del div della base). */
const onBase = (bx: number, by: number) => {
	const t = LAPTOP.baseTilt * D2R;
	return {x: -LAPTOP.baseW / 2 + bx, y: LAPTOP.lidH / 2 - 6 + by * Math.cos(t), z: by * Math.sin(t)};
};

/**
 * Riflesso caldo sul cavo staccato (il cavo del componente è scuro e sparirebbe sul fondo nero):
 * una linea di luce sul bordo superiore del cavo che sfuma verso destra + un punto di luce sul connettore.
 */
export const CableGlint: React.FC<{pose: Pose; plugOut: number; k?: number}> = ({pose, plugOut, k = 1}) => {
	const x0 = LAPTOP.baseW - 6 + plugOut;
	const a = project(pose, onBase(x0 + 64, 164));
	const b = project(pose, onBase(x0 + 700, 164));
	const tip = project(pose, onBase(x0 + 6, 172));
	return (
		<svg width={1080} height={1920} style={{position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none'}}>
			<defs>
				<linearGradient id="rv-cable" gradientUnits="userSpaceOnUse" x1={a.x} y1={a.y} x2={b.x} y2={b.y}>
					<stop offset="0%" stopColor={COLORS.orangeHot} stopOpacity={0.75 * k} />
					<stop offset="35%" stopColor={COLORS.orange} stopOpacity={0.4 * k} />
					<stop offset="100%" stopColor={COLORS.orange} stopOpacity={0} />
				</linearGradient>
				<radialGradient id="rv-tip">
					<stop offset="0%" stopColor={COLORS.orangeHot} stopOpacity={0.55 * k} />
					<stop offset="100%" stopColor={COLORS.orange} stopOpacity={0} />
				</radialGradient>
			</defs>
			<line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="url(#rv-cable)" strokeWidth={2.2 * pose.scale} strokeLinecap="round" />
			<line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="url(#rv-cable)" strokeWidth={9 * pose.scale} strokeLinecap="round" opacity={0.25} />
			<circle cx={tip.x} cy={tip.y} r={34 * pose.scale} fill="url(#rv-tip)" />
			<circle cx={tip.x} cy={tip.y} r={3} fill={alpha(COLORS.orangeHot, 0.6 * k)} />
		</svg>
	);
};
