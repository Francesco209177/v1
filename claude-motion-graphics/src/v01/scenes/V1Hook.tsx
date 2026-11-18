import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {useAbsFrame} from '../../lib/frame';
import {clamp, ease, invLerp} from '../../lib/math';
import {alpha, COLORS} from '../../theme';
import {DiveDust} from './hook/Dust';
import {glassOpacity, Monitor, passGlow} from './hook/Monitor';
import {FOCUS, hookCam, VP, zoomSpeed} from './hook/timing';

/**
 * HOOK (0–89): schermo scuro e cinematografico, un input di chat generico. La domanda viene digitata
 * velocemente (completa a 45, accento di invio), da 60 la camera spinge verso lo schermo con accelerazione:
 * il testo cresce, appare la griglia di pixel, e a 89 abbiamo attraversato il vetro nel buio (continua in TOKENS).
 */
export const V1Hook: React.FC = () => {
	const f = useCurrentFrame();
	const abs = useAbsFrame();
	const cam = hookCam(f);
	const blur = cam.s < 9 ? Math.min(5, Math.max(0, zoomSpeed(f) - 0.03) * 30) : 0;
	const glass = glassOpacity(cam.s);
	const tf = `translate(${cam.px}px, ${cam.py}px) perspective(1700px) rotateX(${cam.rx}deg) rotateY(${cam.ry}deg) scale(${cam.s}) translate(${-FOCUS.x}px, ${-FOCUS.y}px)`;
	const flat = cam.rx === 0 && cam.ry === 0;
	const pg = passGlow(cam.s);
	// buio "dietro" il vetro: la vignettatura si chiude mentre lo attraversiamo
	const dark = ease.inOutSine(invLerp(70, 89, f));
	return (
		<AbsoluteFill style={{overflow: 'hidden'}}>
			{glass > 0.003 ? (
				<div style={{position: 'absolute', inset: 0, overflow: 'hidden', opacity: glass, filter: blur > 0.3 ? `blur(${blur.toFixed(2)}px)` : undefined}}>
					<div
						style={{
							position: 'absolute',
							left: 0,
							top: 0,
							width: 1080,
							height: 1920,
							transformOrigin: '0 0',
							transform: flat ? `translate(${cam.px}px, ${cam.py}px) scale(${cam.s}) translate(${-FOCUS.x}px, ${-FOCUS.y}px)` : tf,
						}}
					>
						<Monitor f={f} s={cam.s} />
					</div>
				</div>
			) : null}
			{/* bagliore caldo del vetro attraversato (morbido, mai un lampo) */}
			{pg > 0.003 ? (
				<div
					style={{
						position: 'absolute',
						inset: 0,
						pointerEvents: 'none',
						background: `radial-gradient(60% 40% at ${VP.x}px ${VP.y}px, ${alpha(COLORS.orange, 0.1 * pg)} 0%, ${alpha(COLORS.orangeDeep, 0.04 * pg)} 50%, rgba(0,0,0,0) 100%)`,
					}}
				/>
			) : null}
			<DiveDust abs={abs} />
			{/* vignettatura che concentra lo sguardo e chiude verso il buio */}
			<AbsoluteFill
				style={{
					pointerEvents: 'none',
					background: `radial-gradient(80% 58% at 50% 40%, rgba(5,5,5,0) ${lerpPct(55, 30, dark)}%, rgba(5,5,5,${0.35 + 0.4 * clamp(dark)}) 100%)`,
				}}
			/>
		</AbsoluteFill>
	);
};

const lerpPct = (a: number, b: number, t: number): number => a + (b - a) * clamp(t);
