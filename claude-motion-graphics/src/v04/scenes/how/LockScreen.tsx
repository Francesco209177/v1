import React from 'react';
import {FONTS} from '../../../theme';
import {OrbyxIcon} from '../../components/FakeMessage';
import {PHONE_SCREEN} from '../../components/Phone';
import {a4, C4} from '../../theme';
import {V4_FAKE} from '../../timeline';

/** Notifica sulla schermata di blocco (coordinate dello schermo del telefono, 484×1044). */
export const NOTIF = {x: 18, y: 318, w: PHONE_SCREEN.w - 36, h: 356, pad: 26, btnH: 78} as const;
/** Centro del pulsante "Verifica subito" (coordinate dello schermo del telefono): il punto del tocco. */
export const TAP_PHONE = {x: PHONE_SCREEN.w / 2, y: NOTIF.y + NOTIF.h - NOTIF.pad - NOTIF.btnH / 2} as const;

/**
 * Schermata di blocco con la notifica FITTIZIA di "Orbyx" (testi ≥ 32 px: sullo schermo restano ≥ 24 px).
 * arrive 0..1 = discesa della notifica; press 0..1 = pulsante premuto; ring 0..1 = alone d'allarme.
 */
export const LockScreen: React.FC<{arrive: number; press: number; ring: number; drift: number}> = ({arrive, press, ring, drift}) => {
	const S = PHONE_SCREEN;
	return (
		<div style={{position: 'absolute', inset: 0}}>
			{/* sfondo */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					background: `radial-gradient(90% 55% at 50% 92%, ${a4(C4.red, 0.28)} 0%, ${a4(C4.redDeep, 0.12)} 45%, rgba(0,0,0,0) 100%), linear-gradient(180deg, #151A1C 0%, #0B0E0F 100%)`,
				}}
			/>
			{/* ora */}
			<div
				style={{
					position: 'absolute',
					left: 0,
					width: S.w,
					top: 112 + drift,
					textAlign: 'center',
					fontFamily: FONTS.display,
					fontWeight: 300,
					fontSize: 136,
					letterSpacing: '-0.03em',
					color: a4(C4.white, 0.92),
					lineHeight: 1,
				}}
			>
				10:24
			</div>
			{/* notifica */}
			<div
				style={{
					position: 'absolute',
					left: NOTIF.x,
					top: NOTIF.y,
					width: NOTIF.w,
					height: NOTIF.h,
					borderRadius: 30,
					padding: NOTIF.pad,
					boxSizing: 'border-box',
					background: 'linear-gradient(180deg, rgba(34,40,43,0.97) 0%, rgba(22,26,28,0.98) 100%)',
					border: `2px solid ${a4(C4.red, 0.25 + 0.45 * ring)}`,
					boxShadow: `0 24px 60px rgba(0,0,0,0.6), 0 0 ${30 + 60 * ring}px ${a4(C4.red, 0.18 + 0.4 * ring)}`,
					transform: `translateY(${-110 * (1 - arrive)}px) scale(${0.9 + 0.1 * arrive})`,
					opacity: Math.min(1, arrive * 1.6),
					color: C4.white,
					fontFamily: FONTS.body,
				}}
			>
				<div style={{display: 'flex', alignItems: 'center', gap: 14}}>
					<OrbyxIcon size={50} />
					<div style={{fontWeight: 600, fontSize: 32, whiteSpace: 'nowrap'}}>{V4_FAKE.notifTitle}</div>
				</div>
				<div style={{marginTop: 16, fontSize: 35, fontWeight: 600, lineHeight: 1.22}}>{V4_FAKE.notifText}</div>
				<div
					style={{
						position: 'absolute',
						left: NOTIF.pad,
						right: NOTIF.pad,
						bottom: NOTIF.pad,
						height: NOTIF.btnH,
						borderRadius: 18,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						fontWeight: 600,
						fontSize: 34,
						background: `linear-gradient(180deg, ${a4(C4.red, 0.95 - 0.3 * press)}, ${a4(C4.redDeep, 0.95)})`,
						boxShadow: `0 0 ${24 + 50 * press}px ${a4(C4.red, 0.4 + 0.5 * press)}, inset 0 1px 0 rgba(255,255,255,0.2)`,
						transform: `scale(${1 - 0.05 * press})`,
					}}
				>
					{V4_FAKE.cta}
				</div>
			</div>
			{/* barra home */}
			<div style={{position: 'absolute', left: S.w / 2 - 70, bottom: 16, width: 140, height: 6, borderRadius: 3, background: a4(C4.white, 0.35)}} />
		</div>
	);
};

/** Indicatore del tocco (polpastrello): disco luminoso; press 0..1 lo schiaccia. Coordinate schermo. */
export const TouchPoint: React.FC<{x: number; y: number; scale: number; opacity: number}> = ({x, y, scale, opacity}) => {
	if (opacity <= 0.01) return null;
	const D = 84;
	return (
		<div
			style={{
				position: 'absolute',
				left: x - D / 2,
				top: y - D / 2,
				width: D,
				height: D,
				borderRadius: '50%',
				opacity,
				transform: `scale(${scale})`,
				background: `radial-gradient(circle at 50% 45%, rgba(255,255,255,0.95) 0%, rgba(242,246,244,0.75) 48%, rgba(242,246,244,0.25) 72%, rgba(242,246,244,0) 100%)`,
				border: `2px solid ${a4(C4.white, 0.85)}`,
				boxShadow: `0 18px 40px rgba(0,0,0,0.55), 0 0 30px ${a4(C4.white, 0.35)}`,
			}}
		/>
	);
};
