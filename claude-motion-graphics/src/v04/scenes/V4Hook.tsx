import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {Phone} from '../components/Phone';
import {C4} from '../theme';
import {DiveStreaks, GlitchStack, RedVeil, RoomAlarm, TensionVignette} from './hook/AlarmFX';
import {Finger} from './hook/Finger';
import {LockScreen} from './hook/LockScreen';
import {alarmP, diveP, fingerState, H, phonePose, projectPhone, TAP_POINT, zoomSpeed} from './hook/pose';

/**
 * HOOK (0–89): smartphone vicino, schermata di blocco. A 6 cade la notifica fittizia "Orbyx · Sicurezza"
 * (lo schermo si accende); il dito si avvicina lento, esita, poi preme deciso "Verifica subito": a 60 il contatto,
 * increspatura, onda rossa d'allarme, glitch controllato e scossa. Da 73 la camera si tuffa nella card:
 * a 89 lo schermo rosso riempie il quadro e il TRAP riparte dal messaggio.
 */
export const V4Hook: React.FC = () => {
	const f = useCurrentFrame();
	const pose = phonePose(f);
	const al = alarmP(f);
	const finger = fingerState(f, pose);
	const tap = projectPhone(pose, TAP_POINT.x, TAP_POINT.y);
	const blur = Math.min(13, zoomSpeed(f) * 50) + 10 * diveP(f) ** 2 + 14 * diveP(f) ** 4; // motion blur del tuffo
	const wake = f >= H.notif ? Math.exp(-(f - H.notif) / 6) : 0;
	const phone = (
		<>
			<Phone
				{...pose}
				alarm={0.18 * al}
				glow={f < H.tap ? 0.55 + 0.6 * wake : 1.1 + 0.5 * Math.exp(-(f - H.tap) / 5)}
				glowColor={f < H.tap ? '#C9D6D0' : C4.red}
			>
				<LockScreen f={f} />
			</Phone>
			<Finger {...finger} />
		</>
	);
	return (
		<AbsoluteFill>
			<RoomAlarm f={f} x={tap.x} y={tap.y} />
			<AbsoluteFill style={{filter: blur > 0.4 ? `blur(${blur.toFixed(2)}px)` : undefined}}>
				<GlitchStack f={f}>{phone}</GlitchStack>
			</AbsoluteFill>
			<TensionVignette f={f} />
			<DiveStreaks f={f} />
			<RedVeil f={f} />
		</AbsoluteFill>
	);
};
