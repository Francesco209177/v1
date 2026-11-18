import React from 'react';
import {FONTS} from '../../theme';
import {a4, C4} from '../theme';

/** Dimensioni dello smartphone (px, prima della scala). Schermo 9:19,5 circa. */
export const PHONE = {w: 520, h: 1080, radius: 78, bezel: 18} as const;
export const PHONE_SCREEN = {w: PHONE.w - PHONE.bezel * 2, h: PHONE.h - PHONE.bezel * 2} as const;

/**
 * Smartphone 3D in CSS: scocca con bordo metallico, isola della fotocamera, schermo con riflesso.
 * (x, y) = centro dello SCHERMO. children = contenuto dello schermo (PHONE_SCREEN, origine in alto a sinistra).
 * `alarm` 0..1 tinge lo schermo di rosso (allarme), `glowColor` la luce che il telefono proietta.
 */
export const Phone: React.FC<{
	x: number;
	y: number;
	scale?: number;
	rotX?: number;
	rotY?: number;
	rotZ?: number;
	opacity?: number;
	alarm?: number;
	glow?: number;
	glowColor?: string;
	children?: React.ReactNode;
}> = ({x, y, scale = 1, rotX = 6, rotY = -10, rotZ = 0, opacity = 1, alarm = 0, glow = 1, glowColor = C4.green, children}) => {
	const S = PHONE_SCREEN;
	const lit = alarm > 0 ? C4.red : glowColor;
	return (
		<div style={{position: 'absolute', left: x, top: y, width: 0, height: 0, perspective: 2200, opacity}}>
			<div
				style={{
					position: 'absolute',
					left: -PHONE.w / 2,
					top: -PHONE.h / 2,
					width: PHONE.w,
					height: PHONE.h,
					transform: `scale(${scale}) rotateX(${rotX}deg) rotateY(${rotY}deg) rotateZ(${rotZ}deg)`,
				}}
			>
				{/* luce proiettata */}
				<div
					style={{
						position: 'absolute',
						left: -PHONE.w * 0.5,
						top: -PHONE.h * 0.2,
						width: PHONE.w * 2,
						height: PHONE.h * 1.4,
						borderRadius: '50%',
						background: `radial-gradient(closest-side, ${a4(lit, 0.16 * glow + 0.22 * alarm)} 0%, ${a4(lit, 0)} 100%)`,
					}}
				/>
				{/* scocca */}
				<div
					style={{
						position: 'absolute',
						inset: 0,
						borderRadius: PHONE.radius,
						background: 'linear-gradient(135deg, #3A4144 0%, #1A1E20 35%, #0E1112 65%, #2A3033 100%)',
						boxShadow: `inset 0 0 0 2px rgba(235,242,238,0.16), inset 0 0 0 6px #0A0C0D, 0 40px 110px rgba(0,0,0,0.75), 0 0 ${60 * glow}px ${a4(lit, 0.18 * glow + 0.3 * alarm)}`,
					}}
				/>
				{/* tasti laterali */}
				<div style={{position: 'absolute', right: -5, top: 230, width: 6, height: 110, borderRadius: 3, background: '#2A3033'}} />
				<div style={{position: 'absolute', left: -5, top: 200, width: 6, height: 70, borderRadius: 3, background: '#2A3033'}} />
				<div style={{position: 'absolute', left: -5, top: 290, width: 6, height: 70, borderRadius: 3, background: '#2A3033'}} />
				{/* schermo */}
				<div
					style={{
						position: 'absolute',
						left: PHONE.bezel,
						top: PHONE.bezel,
						width: S.w,
						height: S.h,
						borderRadius: PHONE.radius - PHONE.bezel,
						overflow: 'hidden',
						background: `linear-gradient(180deg, #0F1416 0%, #0A0D0E 100%)`,
						fontFamily: FONTS.body,
					}}
				>
					{children}
					{/* tinta di allarme */}
					{alarm > 0.003 ? (
						<div style={{position: 'absolute', inset: 0, background: `radial-gradient(120% 80% at 50% 40%, ${a4(C4.red, 0.55 * alarm)} 0%, ${a4(C4.redDeep, 0.75 * alarm)} 100%)`, mixBlendMode: 'screen'}} />
					) : null}
					{/* isola fotocamera */}
					<div style={{position: 'absolute', left: S.w / 2 - 62, top: 18, width: 124, height: 36, borderRadius: 18, background: '#000'}} />
					{/* riflesso del vetro */}
					<div style={{position: 'absolute', inset: 0, background: 'linear-gradient(120deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 35%)', pointerEvents: 'none'}} />
				</div>
			</div>
		</div>
	);
};
