import React from 'react';
import {clamp, ease, hash, hit, prog} from '../../../lib/math';
import {FONTS} from '../../../theme';
import {FakeMessage} from '../../components/FakeMessage';
import {a4, C4} from '../../theme';
import {MSG, MSG_BOX} from '../finale/handoff';
import {D} from './timing';

/** Glitch controllato: attivo solo in alcuni frame prima dell'impatto, ampiezza crescente. */
const glitchAt = (f: number): number => {
	if (f < D.glitch) return 0;
	const on = [0, 2, 3, 5, 7, 8].includes(f - D.glitch);
	return on ? 0.45 + 0.55 * clamp((f - D.glitch) / 8) : 0;
};

/** Il messaggio fraudolento così come appare nei frame finali (riusato identico nel finale per la continuità). */
export const ThreatMessage: React.FC<{opacity?: number; rotX?: number; dy?: number}> = ({opacity = 1, rotX = 0, dy = 0}) => (
	<FakeMessage x={MSG.x} y={MSG.y + dy} width={MSG.width} rotX={rotX} opacity={opacity} linkReveal={1} suspicious={1} />
);

/** Angoli del mirino (4 squadre verdi) attorno al riquadro. */
const Brackets: React.FC<{pad: number; opacity: number; pulse: number}> = ({pad, opacity, pulse}) => {
	const L = 56;
	const box = {l: MSG_BOX.left - pad, t: MSG_BOX.top - pad, r: MSG_BOX.right + pad, b: MSG_BOX.bottom + pad};
	const corner = (x: number, y: number, sx: number, sy: number, k: number) => (
		<path key={k} d={`M${x + sx * L} ${y} H${x} V${y + sy * L}`} fill="none" stroke={C4.greenBright} strokeWidth={5} strokeLinecap="round" />
	);
	return (
		<svg width={1080} height={1920} style={{position: 'absolute', left: 0, top: 0, opacity, filter: `drop-shadow(0 0 ${8 + 14 * pulse}px ${a4(C4.green, 0.9)})`}}>
			{corner(box.l, box.t, 1, 1, 0)}
			{corner(box.r, box.t, -1, 1, 1)}
			{corner(box.l, box.b, 1, -1, 2)}
			{corner(box.r, box.b, -1, -1, 3)}
		</svg>
	);
};

/**
 * Fine della DIFESA: il messaggio fraudolento rientra dal basso (rosso, sospetto), lo scudo lo aggancia
 * con il mirino (sul beat 705) e lo segnala come minaccia; glitch controllato appena prima dell'impatto (720).
 */
export const Threat: React.FC<{f: number}> = ({f}) => {
	if (f < D.threat - 1) return null;
	const enter = prog(f, D.threat, 13, ease.outQuart);
	const rotX = 28 * (1 - enter);
	const dy = (1 - enter) * 420;
	const lock = prog(f, D.lock - 7, 7, ease.inOutCubic);
	const lockHit = hit(f, D.lock, 10);
	const g = glitchAt(f);
	const label = prog(f, D.lock - 2, 6, ease.outCubic);
	// fette orizzontali spostate (solo nei frame di glitch)
	const slices =
		g > 0
			? [0, 1, 2].map((k) => {
					const y0 = MSG_BOX.top + hash(f, k * 7 + 1) * MSG.h * 0.85;
					const h = 18 + hash(f, k * 7 + 2) * 60;
					const dx = (hash(f, k * 7 + 3) - 0.5) * 70 * g;
					return {y0, h, dx};
				})
			: [];
	return (
		<>
			{/* alone rosso della minaccia */}
			<div
				style={{
					position: 'absolute',
					left: MSG.x - 620,
					top: MSG.y + dy - 420,
					width: 1240,
					height: 840,
					borderRadius: '50%',
					background: `radial-gradient(closest-side, ${a4(C4.red, 0.2 * enter)} 0%, ${a4(C4.redDeep, 0.08 * enter)} 55%, ${a4(C4.red, 0)} 100%)`,
				}}
			/>
			{/* separazione RGB dei contorni (rosso / verde) */}
			{g > 0 ? (
				<>
					<div style={{position: 'absolute', left: MSG_BOX.left - 14 * g, top: MSG_BOX.top, width: MSG.width, height: MSG.h, borderRadius: 34, border: `3px solid ${a4(C4.red, 0.8)}`, mixBlendMode: 'screen'}} />
					<div style={{position: 'absolute', left: MSG_BOX.left + 12 * g, top: MSG_BOX.top + 3, width: MSG.width, height: MSG.h, borderRadius: 34, border: `3px solid ${a4(C4.greenBright, 0.6)}`, mixBlendMode: 'screen'}} />
				</>
			) : null}
			<ThreatMessage opacity={clamp(enter * 1.6)} rotX={rotX} dy={dy} />
			{slices.map((s, k) => (
				<div key={k} style={{position: 'absolute', inset: 0, clipPath: `inset(${s.y0}px 0 ${1920 - s.y0 - s.h}px 0)`, transform: `translateX(${s.dx}px)`}}>
					<ThreatMessage />
				</div>
			))}
			{/* mirino che si chiude sul messaggio */}
			{lock > 0 ? <Brackets pad={26 + 110 * (1 - lock)} opacity={lock} pulse={lockHit} /> : null}
			{/* etichetta */}
			<div
				style={{
					position: 'absolute',
					left: MSG_BOX.left,
					top: MSG_BOX.top - 78,
					display: 'flex',
					alignItems: 'center',
					gap: 12,
					fontFamily: FONTS.mono,
					fontSize: 26,
					fontWeight: 700,
					letterSpacing: '0.14em',
					color: C4.redBright,
					textShadow: `0 0 16px ${a4(C4.red, 0.7)}`,
					opacity: label * (g > 0.7 ? 0.5 : 1),
					transform: `translateY(${(1 - label) * 12}px)`,
				}}
			>
				<span style={{width: 14, height: 14, borderRadius: 7, background: C4.red, boxShadow: `0 0 12px ${C4.red}`}} />
				MINACCIA RILEVATA
			</div>
		</>
	);
};
