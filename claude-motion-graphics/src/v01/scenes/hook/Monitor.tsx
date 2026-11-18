import React from 'react';
import {clamp, ease, lerp} from '../../../lib/math';
import {alpha, COLORS} from '../../../theme';
import {ChatInput} from './ChatInput';
import {sBand} from './timing';

/** Schermo "di vetro" (coordinate del frame a scala 1). */
export const MON = {x: 38, y: 296, w: 1004, h: 888, r: 50, bezel: 20} as const;
const SCR = {x: MON.x + MON.bezel, y: MON.y + MON.bezel, w: MON.w - 2 * MON.bezel, h: MON.h - 2 * MON.bezel, r: 30};
/** Passo della griglia di pixel (px a scala 1): invisibile da lontano, evidente nel tuffo. */
const PITCH = 5;

/**
 * Monitor generico: cornice scura con filo di luce, vetro con scanline, griglia di pixel (sub-pixel in toni caldi),
 * riflesso diagonale e un riflesso mobile; dentro, l'input di chat. Tutto disegnato in coordinate del frame:
 * la camera (scala/inclinazione) è applicata dal genitore.
 */
export const Monitor: React.FC<{f: number; s: number}> = ({f, s}) => {
	const grid = sBand(s, 2.1, 5);
	const scan = 1 - sBand(s, 1.4, 2.6);
	const chrome = 1 - sBand(s, 2.6, 5.2);
	const cheap = s > 3.2;
	const sheen = lerp(-0.5, 1.5, ease.inOutSine(clamp(f / 56)));
	return (
		<>
			{/* ombra e alone sullo "studio" */}
			{!cheap ? (
				<div
					style={{
						position: 'absolute',
						left: MON.x,
						top: MON.y,
						width: MON.w,
						height: MON.h,
						borderRadius: MON.r,
						boxShadow: `0 50px 140px rgba(0,0,0,0.85), 0 0 120px ${alpha(COLORS.orange, 0.07)}`,
					}}
				/>
			) : null}
			{/* luce dello schermo sul piano sotto il monitor (riflesso caldo e morbido) */}
			{!cheap ? (
				<div
					style={{
						position: 'absolute',
						left: MON.x - 60,
						top: MON.y + MON.h - 40,
						width: MON.w + 120,
						height: 260,
						background: `radial-gradient(50% 50% at 50% 30%, ${alpha(COLORS.orange, 0.09)} 0%, ${alpha(COLORS.orangeDeep, 0.04)} 45%, rgba(0,0,0,0) 100%)`,
					}}
				/>
			) : null}
			{/* cornice */}
			<div
				style={{
					position: 'absolute',
					left: MON.x,
					top: MON.y,
					width: MON.w,
					height: MON.h,
					borderRadius: MON.r,
					background: 'linear-gradient(165deg, #2A2623 0%, #191715 38%, #100F0E 100%)',
					boxShadow: 'inset 0 0 0 1.5px rgba(250,249,245,0.10), inset 0 2px 0 rgba(255,255,255,0.12), inset 0 -2px 0 rgba(0,0,0,0.5)',
				}}
			/>
			{/* filo di luce sul bordo superiore della cornice */}
			<div
				style={{
					position: 'absolute',
					left: MON.x + 60,
					top: MON.y,
					width: MON.w - 120,
					height: 2,
					background: `linear-gradient(90deg, rgba(255,240,228,0), rgba(255,240,228,0.32) 35%, ${alpha(COLORS.orangeHot, 0.22)} 70%, rgba(255,240,228,0))`,
				}}
			/>
			{/* LED di accensione */}
			<div
				style={{
					position: 'absolute',
					left: MON.x + MON.w / 2 - 4,
					top: MON.y + MON.h - MON.bezel / 2 - 3,
					width: 8,
					height: 6,
					borderRadius: 3,
					background: COLORS.orange,
					boxShadow: cheap ? undefined : `0 0 10px ${COLORS.orange}`,
					opacity: 0.8,
				}}
			/>
			{/* vetro */}
			<div
				style={{
					position: 'absolute',
					left: SCR.x,
					top: SCR.y,
					width: SCR.w,
					height: SCR.h,
					borderRadius: SCR.r,
					overflow: 'hidden',
					background: 'radial-gradient(120% 85% at 50% 48%, #15120F 0%, #0C0A09 58%, #070605 100%)',
				}}
			>
				{/* luce dell'input sul vetro */}
				<div
					style={{
						position: 'absolute',
						left: -200,
						top: 120,
						width: SCR.w + 400,
						height: 700,
						background: `radial-gradient(closest-side, ${alpha(COLORS.orange, 0.11)} 0%, ${alpha(COLORS.orangeDeep, 0.05)} 55%, ${alpha(COLORS.orangeDeep, 0)} 100%)`,
						opacity: 0.25 + 0.75 * chrome,
					}}
				/>
				{/* contenuto (coordinate del frame) */}
				<div style={{position: 'absolute', left: -SCR.x, top: -SCR.y, width: 1080, height: 1920}}>
					<ChatInput f={f} chrome={chrome} cheap={cheap} />
				</div>
				{/* scanline */}
				{scan > 0.01 ? (
					<div
						style={{
							position: 'absolute',
							inset: 0,
							opacity: scan,
							backgroundImage: 'repeating-linear-gradient(180deg, rgba(250,249,245,0.028) 0px, rgba(250,249,245,0.028) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 4px)',
						}}
					/>
				) : null}
				{/* griglia di pixel: sul testo (moltiplica) ogni pixel si scompone in 3 sub-pixel caldi con fessure scure */}
				{grid > 0.01 ? (
					<div
						style={{
							position: 'absolute',
							inset: 0,
							opacity: grid,
							mixBlendMode: 'multiply',
							backgroundImage: [
								'linear-gradient(0deg, rgb(10,8,7) 0 17%, rgba(0,0,0,0) 17% 100%)',
								`linear-gradient(90deg, rgb(10,8,7) 0 13%, rgb(255,150,105) 13% 40%, rgb(255,205,170) 40% 67%, rgb(255,236,220) 67% 94%, rgb(10,8,7) 94% 100%)`,
							].join(', '),
							backgroundSize: `${PITCH}px ${PITCH}px`,
						}}
					/>
				) : null}
				{/* ...e sul vetro scuro la griglia resta appena visibile (retroilluminazione) */}
				{grid > 0.01 ? (
					<div
						style={{
							position: 'absolute',
							inset: 0,
							opacity: grid * (1 - 0.5 * sBand(s, 8, 20)),
							backgroundImage: `linear-gradient(90deg, rgba(0,0,0,0) 0 13%, ${alpha(COLORS.orangeDeep, 0.07)} 13% 40%, ${alpha(COLORS.orange, 0.06)} 40% 67%, ${alpha(COLORS.orangeBright, 0.05)} 67% 94%, rgba(0,0,0,0) 94%)`,
							backgroundSize: `${PITCH}px ${PITCH}px`,
						}}
					/>
				) : null}
				{/* riflessi del vetro */}
				<div style={{position: 'absolute', inset: 0, background: 'linear-gradient(118deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.0) 34%)'}} />
				{!cheap ? (
					<div
						style={{
							position: 'absolute',
							top: -200,
							bottom: -200,
							left: `${sheen * 100}%`,
							width: 260,
							transform: 'translateX(-50%) rotate(18deg)',
							background: 'linear-gradient(90deg, rgba(255,240,228,0) 0%, rgba(255,240,228,0.045) 50%, rgba(255,240,228,0) 100%)',
						}}
					/>
				) : null}
				<div style={{position: 'absolute', inset: 0, borderRadius: SCR.r, boxShadow: `inset 0 0 ${cheap ? 0 : 60}px rgba(0,0,0,0.75)`}} />
			</div>
		</>
	);
};

/** Opacità del monitor durante l'attraversamento del vetro. */
export const glassOpacity = (s: number): number => 1 - sBand(s, 11, 34);

/** Luce del vetro che resta "addosso" mentre lo attraversiamo (0..1). */
export const passGlow = (s: number): number => clamp(sBand(s, 6, 16) * (1 - sBand(s, 18, 40)));
