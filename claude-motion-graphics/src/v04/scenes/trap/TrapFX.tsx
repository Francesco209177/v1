import React from 'react';
import {AbsoluteFill} from 'remotion';
import {FrameCanvas} from '../../../components/FrameCanvas';
import {drawGlow} from '../../../lib/canvas';
import {clamp, ease, hash, invLerp, TAU} from '../../../lib/math';
import {FONTS} from '../../../theme';
import {a4, C4} from '../../theme';
import {T, zoomP} from './timing';

/** Residuo rosso dell'allarme dell'HOOK che si dissolve mentre arriva il messaggio (continuità sul taglio 90). */
export const IntroVeil: React.FC<{a: number}> = ({a}) => {
	const k = 1 - ease.outCubic(invLerp(T.start, T.start + 13, a));
	if (k < 0.005) return null;
	return (
		<AbsoluteFill
			style={{
				pointerEvents: 'none',
				background: `radial-gradient(85% 60% at 50% 42%, ${a4(C4.red, 0.42 * k)} 0%, ${a4(C4.redDeep, 0.6 * k)} 65%, rgba(30,4,6,${0.8 * k}) 100%)`,
			}}
		/>
	);
};

/** Onda d'urto all'atterraggio del messaggio (105). */
export const ShockRing: React.FC<{a: number; x: number; y: number}> = ({a, x, y}) => {
	const t = a - T.message;
	if (t < 0 || t > 18) return null;
	const u = ease.outCubic(t / 18);
	const w = 980 + 620 * u;
	const h = 1000 + 640 * u;
	return (
		<AbsoluteFill style={{pointerEvents: 'none', mixBlendMode: 'screen'}}>
			<div
				style={{
					position: 'absolute',
					left: x - w / 2,
					top: y - h / 2,
					width: w,
					height: h,
					borderRadius: 60 + 200 * u,
					border: `${3 - 2 * u}px solid ${a4(C4.redBright, 0.75 * (1 - u))}`,
					boxShadow: `0 0 40px ${a4(C4.red, 0.5 * (1 - u))}, inset 0 0 40px ${a4(C4.red, 0.35 * (1 - u))}`,
				}}
			/>
			<AbsoluteFill style={{background: `radial-gradient(50% 32% at ${(x / 1080) * 100}% ${(y / 1920) * 100}%, ${a4(C4.red, 0.3 * (1 - u))} 0%, ${a4(C4.red, 0)} 100%)`}} />
		</AbsoluteFill>
	);
};

/** Riflettore durante lo zoom: il resto del quadro si scurisce attorno a pulsante e indirizzo. */
export const Spotlight: React.FC<{a: number; x: number; y: number; extra: number}> = ({a, x, y, extra}) => {
	const k = Math.max(zoomP(a) * 0.55, extra);
	if (k < 0.01) return null;
	return (
		<AbsoluteFill
			style={{
				pointerEvents: 'none',
				background: `radial-gradient(48% 22% at ${(x / 1080) * 100}% ${(y / 1920) * 100}%, rgba(4,5,6,0) 0%, rgba(4,5,6,${0.25 * k}) 55%, rgba(4,5,6,${0.85 * k}) 100%)`,
			}}
		/>
	);
};

const GLYPHS = ['0x3F', 'A9', '••', '0F', 'C2', '7E', '0x1B', 'D4', '5A', '••••', 'E1', '9C'];

/** Pulviscolo di dati: frammenti esadecimali astratti che salgono lentamente (solo texture, mai codice reale). */
export const CodeDust: React.FC<{a: number; k: number}> = ({a, k}) => {
	if (k < 0.01) return null;
	return (
		<FrameCanvas
			frame={a}
			draw={(ctx) => {
				ctx.font = `500 22px ${FONTS.mono}`;
				ctx.textAlign = 'center';
				for (let i = 0; i < 34; i++) {
					const z = 0.4 + 0.6 * hash(i, 3);
					const x = hash(i, 1) * 1080 + Math.sin(a / 40 + i) * 14;
					const y = ((((hash(i, 2) * 2100 - a * (0.9 + 1.4 * z)) % 2100) + 2100) % 2100) - 90;
					const tw = 0.5 + 0.5 * Math.sin(a / 13 + hash(i, 4) * TAU);
					const al = k * (0.05 + 0.12 * tw) * z;
					ctx.globalAlpha = al;
					ctx.fillStyle = hash(i, 5) < 0.7 ? C4.red : C4.gray;
					ctx.fillText(GLYPHS[i % GLYPHS.length], x, y);
					ctx.globalAlpha = 1;
					if (hash(i, 6) < 0.4) drawGlow(ctx, x, y + 14, 1.4 * z, C4.red, al * 1.6, '#FFD0D2');
				}
			}}
		/>
	);
};

/** Pulizia finale: una linea di scansione rossa scende e porta via la composizione (verso il taglio 270). */
export const ExitWipe: React.FC<{a: number}> = ({a}) => {
	const u = invLerp(T.exit + 6, T.end, a);
	if (u <= 0 || u >= 1) return null;
	const y = 180 + 1500 * ease.inOutCubic(u);
	const k = Math.sin(Math.PI * clamp(u * 1.1));
	return (
		<AbsoluteFill style={{pointerEvents: 'none', mixBlendMode: 'screen'}}>
			<div style={{position: 'absolute', left: 0, right: 0, top: y - 160, height: 160, background: `linear-gradient(180deg, ${a4(C4.red, 0)} 0%, ${a4(C4.red, 0.12 * k)} 100%)`}} />
			<div style={{position: 'absolute', left: 0, right: 0, top: y - 1.5, height: 3, background: `rgba(255,214,215,${0.8 * k})`, boxShadow: `0 0 24px ${a4(C4.red, 0.9 * k)}, 0 0 60px ${a4(C4.red, 0.5 * k)}`}} />
		</AbsoluteFill>
	);
};
