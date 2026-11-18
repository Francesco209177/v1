import React from 'react';
import {FONTS} from '../../../theme';
import {LAPTOP} from '../../components/Laptop';
import {LaptopPose} from './pose';

/**
 * Copia 2D del coperchio del laptop condiviso (stessi stili), usata nel tuffo quando le rotazioni sono nulle:
 * con rotX = rotY = 0 il piano dello schermo (z = 0) si proietta come una semplice scala attorno a (x, y),
 * quindi il passaggio 3D → 2D è invisibile. Evita il ritaglio del coperchio di Chrome a scale molto grandi.
 */
export const ScreenProxy: React.FC<{pose: LaptopPose; children?: React.ReactNode}> = ({pose, children}) => {
	const L = LAPTOP;
	return (
		<div style={{position: 'absolute', left: pose.x, top: pose.y, width: 0, height: 0}}>
			<div
				style={{
					position: 'absolute',
					left: -L.lidW / 2,
					top: -L.lidH / 2,
					width: L.lidW,
					height: L.lidH,
					transform: `scale(${pose.scale})`,
					transformOrigin: `${L.lidW / 2}px ${L.lidH / 2}px`,
					borderRadius: 26,
					background: 'linear-gradient(180deg, #2B2724, #1A1816)',
					boxShadow: 'inset 0 0 0 2px rgba(250,249,245,0.14), inset 0 2px 0 rgba(255,255,255,0.12)',
				}}
			>
				<div
					style={{
						position: 'absolute',
						left: L.bezel,
						top: L.bezel,
						width: L.screenW,
						height: L.screenH,
						borderRadius: 10,
						overflow: 'hidden',
						background: 'radial-gradient(120% 90% at 50% 0%, #1A1715 0%, #0D0C0B 60%, #090807 100%)',
						fontFamily: FONTS.body,
					}}
				>
					{children}
					<div style={{position: 'absolute', inset: 0, background: 'linear-gradient(115deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.0) 38%)'}} />
				</div>
				<div style={{position: 'absolute', left: L.lidW / 2 - 4, top: 7, width: 8, height: 8, borderRadius: 4, background: '#0A0908', boxShadow: 'inset 0 0 0 1px rgba(250,249,245,0.12)'}} />
			</div>
		</div>
	);
};
