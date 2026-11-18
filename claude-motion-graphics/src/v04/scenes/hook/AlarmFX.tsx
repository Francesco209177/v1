import React from 'react';
import {AbsoluteFill} from 'remotion';
import {FrameCanvas} from '../../../components/FrameCanvas';
import {drawGlow} from '../../../lib/canvas';
import {clamp, ease, hash, invLerp, TAU} from '../../../lib/math';
import {a4, C4} from '../../theme';
import {diveP, H} from './pose';

/** Intensità del glitch nei frame subito dopo il tocco (deterministica, 6 frame). */
const GLITCH = [1, 0.8, 0.3, 0.9, 0.45, 0.15];
export const glitchAt = (f: number): number => (f >= H.tap && f < H.tap + GLITCH.length ? GLITCH[f - H.tap] : 0);
/** Strappi orizzontali solo in alcuni frame. */
const TEARS: Record<number, number> = {[H.tap]: 3, [H.tap + 1]: 2, [H.tap + 3]: 3};

/**
 * Glitch controllato: separazione RGB (copia rossa e copia bianca sfalsate, in "screen") e qualche strappo
 * orizzontale. Solo per 3–6 frame al tocco, mai su testo da leggere in quel momento.
 */
export const GlitchStack: React.FC<{f: number; children: React.ReactNode}> = ({f, children}) => {
	const g = glitchAt(f);
	if (g <= 0) return <>{children}</>;
	const dx = 10 + 16 * g;
	const tears = TEARS[f] ?? 0;
	return (
		<>
			{children}
			{/* copia rossa (solo canale rosso via multiply su nero) */}
			<AbsoluteFill style={{mixBlendMode: 'screen', opacity: 0.85 * g, transform: `translateX(${dx}px)`, backgroundColor: '#000', isolation: 'isolate'}}>
				{children}
				<AbsoluteFill style={{backgroundColor: '#FF2A30', mixBlendMode: 'multiply'}} />
			</AbsoluteFill>
			{/* copia bianca, fantasma opposto */}
			<AbsoluteFill style={{mixBlendMode: 'screen', opacity: 0.3 * g, transform: `translateX(${-dx * 0.7}px)`}}>{children}</AbsoluteFill>
			{/* strappi orizzontali */}
			{Array.from({length: tears}, (_, i) => {
				const top = 260 + hash(f, i * 7 + 1) * 1100;
				const hgt = 18 + hash(f, i * 7 + 2) * 70;
				const shift = (hash(f, i * 7 + 3) - 0.5) * 140;
				return (
					<AbsoluteFill key={i} style={{clipPath: `inset(${top}px 0 ${1920 - top - hgt}px 0)`, transform: `translateX(${shift}px)`, backgroundColor: C4.black}}>
						{children}
						<AbsoluteFill style={{background: a4(C4.red, 0.18), mixBlendMode: 'screen'}} />
					</AbsoluteFill>
				);
			})}
			{/* righe di scansione brillanti */}
			<AbsoluteFill style={{pointerEvents: 'none'}}>
				{[0, 1].map((i) => (
					<div key={i} style={{position: 'absolute', left: 0, right: 0, top: 300 + hash(f, 40 + i) * 1000, height: 2 + 2 * hash(f, 50 + i), background: `rgba(255,214,215,${0.55 * g})`, boxShadow: `0 0 18px ${a4(C4.red, 0.8 * g)}`}} />
				))}
			</AbsoluteFill>
		</>
	);
};

/** Vignettatura che si stringe con la tensione (prima del tocco), poi si apre di colpo. */
export const TensionVignette: React.FC<{f: number}> = ({f}) => {
	const k = f < H.tap ? ease.inQuad(invLerp(26, H.tap, f)) : Math.exp(-(f - H.tap) / 3);
	if (k < 0.01) return null;
	return <AbsoluteFill style={{pointerEvents: 'none', background: `radial-gradient(60% 42% at 54% 44%, rgba(0,0,0,0) 45%, rgba(0,0,0,${0.5 * k}) 100%)`}} />;
};

/** Luce rossa che invade l'ambiente al tocco (lampo + bagliore che resta, pulsa sul beat 75). */
export const RoomAlarm: React.FC<{f: number; x: number; y: number}> = ({f, x, y}) => {
	if (f < H.tap) return null;
	const flash = Math.exp(-(f - H.tap) / 4);
	const hold = clamp((f - H.tap) / 6) * (0.55 + 0.25 * Math.exp(-Math.max(0, f - 75) / 6) * (f >= 75 ? 1 : 0));
	const k = 0.8 * flash + hold * 0.6;
	return (
		<AbsoluteFill style={{pointerEvents: 'none', mixBlendMode: 'screen'}}>
			<AbsoluteFill style={{background: `radial-gradient(60% 40% at ${(x / 1080) * 100}% ${(y / 1920) * 100}%, ${a4(C4.redBright, 0.42 * k)} 0%, ${a4(C4.red, 0.18 * k)} 45%, ${a4(C4.red, 0)} 100%)`}} />
		</AbsoluteFill>
	);
};

/** Velo rosso finale: lo schermo d'allarme riempie il quadro (passaggio al TRAP con il lampo rosso). */
export const RedVeil: React.FC<{f: number}> = ({f}) => {
	const k = ease.inQuad(invLerp(77, H.end, f));
	if (k < 0.005) return null;
	return (
		<AbsoluteFill
			style={{
				pointerEvents: 'none',
				background: `radial-gradient(85% 60% at 50% 42%, ${a4(C4.red, 0.42 * k)} 0%, ${a4(C4.redDeep, 0.62 * k)} 65%, rgba(30,4,6,${0.8 * k}) 100%)`,
			}}
		/>
	);
};

/** Scie radiali del tuffo nello schermo (accelerano fino al taglio). */
export const DiveStreaks: React.FC<{f: number}> = ({f}) => {
	const d = diveP(f);
	if (d <= 0.001) return null;
	return (
		<FrameCanvas
			frame={f}
			additive
			draw={(ctx) => {
				ctx.globalCompositeOperation = 'lighter';
				const cx = 540;
				const cy = 760;
				for (let i = 0; i < 90; i++) {
					const ang = hash(i, 1) * TAU;
					const ph = hash(i, 2);
					const speed = 0.6 + hash(i, 3) * 0.8;
					const r0 = 120 + ((ph * 1400 + f * 70 * speed * (0.3 + d)) % 1400);
					const len = (40 + 260 * d) * speed;
					const x0 = cx + Math.cos(ang) * r0;
					const y0 = cy + Math.sin(ang) * r0 * 1.3;
					const x1 = cx + Math.cos(ang) * (r0 + len);
					const y1 = cy + Math.sin(ang) * (r0 + len) * 1.3;
					const a = d * (0.12 + 0.3 * hash(i, 4)) * clamp(r0 / 400);
					const g = ctx.createLinearGradient(x0, y0, x1, y1);
					const col = hash(i, 5) < 0.75 ? '255,92,97' : '255,225,226';
					g.addColorStop(0, `rgba(${col},0)`);
					g.addColorStop(1, `rgba(${col},${a})`);
					ctx.strokeStyle = g;
					ctx.lineWidth = 1.5 + 2.5 * hash(i, 6);
					ctx.beginPath();
					ctx.moveTo(x0, y0);
					ctx.lineTo(x1, y1);
					ctx.stroke();
					if (hash(i, 7) < 0.25) drawGlow(ctx, x1, y1, 2 + 2 * d, C4.red, a * 1.4, '#FFE3E4');
				}
			}}
		/>
	);
};
