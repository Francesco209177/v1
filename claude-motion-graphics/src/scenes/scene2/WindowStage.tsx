import React from 'react';
import {TerminalWindow} from '../../components/TerminalWindow';
import {clamp, ease, hit} from '../../lib/math';
import {COLORS, boxGlow} from '../../theme';
import {WINDOW_RECT} from '../../timeline';
import {settle, T} from './timing';

const R = WINDOW_RECT;
const CY = R.y + R.h / 2;
const HALF = R.h / 2;
/** Margine oltre il bordo per non tagliare ombra e alone della finestra a fine apertura. */
const SHADOW = 300;

/** Linea di luce orizzontale (nucleo bianco caldo, estremità che sfumano). */
const LightLine: React.FC<{y: number; width: number; opacity: number; power?: number}> = ({y, width, opacity, power = 1}) =>
	opacity <= 0.003 || width <= 0.5 ? null : (
		<div
			style={{
				position: 'absolute',
				left: R.x + R.w / 2 - width / 2,
				top: y - 2,
				width,
				height: 4,
				borderRadius: 2,
				opacity,
				background: `linear-gradient(90deg, rgba(217,119,87,0) 0%, ${COLORS.orangeBright} 14%, ${COLORS.white} 50%, ${COLORS.orangeBright} 86%, rgba(217,119,87,0) 100%)`,
				boxShadow: boxGlow(COLORS.orange, power),
			}}
		/>
	);

/**
 * La finestra di Claude Code e la sua entrata: una linea di luce si disegna dal centro (4–9),
 * poi si divide in due bordi luminosi che scorrono verso l'alto e il basso aprendo la finestra (9–21),
 * con una leggera inclinazione 3D che si assesta perfettamente piatta. Da T.unfold+14 in poi è
 * la <TerminalWindow> condivisa senza alcuna trasformazione.
 */
export const WindowStage: React.FC<{frame: number; children?: React.ReactNode}> = ({frame, children}) => {
	if (frame < T.lineIn) return null;
	const t = frame - T.unfold;
	const open = ease.outQuint(clamp(t / T.unfoldLen));
	const half = HALF * open;
	const unfolding = t < 14;
	// la maschera segue i bordi luminosi, poi si allarga per liberare ombra e alone
	const ext = SHADOW * ease.inOutSine(clamp((t - 5) / 9));
	const inset = HALF - half - ext;
	const tilt = 11 * (1 - ease.outCubic(clamp(t / 13)));
	const lineW = R.w * ease.outExpo(clamp((frame - T.lineIn) / (T.unfold - T.lineIn)));
	const edge = Math.pow(1 - open, 0.55);
	// alone: piena accensione all'apertura, poi un'ondata sull'INVIO
	const glow = 1 + 2.2 * (1 - ease.outCubic(clamp(t / 15))) + 1.3 * hit(frame, T.submit, 16) * settle(frame);
	return (
		<div
			style={{
				position: 'absolute',
				inset: 0,
				transformOrigin: `${R.x + R.w / 2}px ${CY}px`,
				transform: tilt > 0.001 ? `perspective(1500px) rotateX(${tilt}deg)` : undefined,
			}}
		>
			{t > 0 ? (
				<TerminalWindow glow={glow} style={unfolding ? {clipPath: `inset(${inset}px ${-SHADOW}px ${inset}px ${-SHADOW}px)`} : undefined}>
					{children}
				</TerminalWindow>
			) : null}
			{t <= 0 ? <LightLine y={CY} width={lineW} opacity={1} power={0.6 + 0.6 * clamp((frame - T.lineIn) / 3)} /> : null}
			{t > 0 && unfolding ? (
				<>
					<LightLine y={CY - half} width={R.w} opacity={edge} power={0.5 + edge} />
					<LightLine y={CY + half} width={R.w} opacity={edge} power={0.5 + edge} />
				</>
			) : null}
		</div>
	);
};
