import React from 'react';
import {AbsoluteFill} from 'remotion';
import {clamp, ease, hash, hit, lerp, prog} from '../../../lib/math';
import {FONTS} from '../../../theme';
import {a4, C4} from '../../theme';
import {V4_FAKE} from '../../timeline';
import {WarnGlyph} from '../hook/glyphs';
import {PhishDomain} from './Addr';
import {T} from './timing';

/** Targa dell'indirizzo (coordinate di schermo a riposo). */
const P = {cx: 540, cy: 736, w: 940, h: 236} as const;
const PL = P.cx - P.w / 2;
const PT = P.cy - P.h / 2;
/** Metriche del mono: avanzamento 0,6 em. */
const URL_X = 30;
const HTTP_FS = 34;
const DOM_FS = 54;
const DOM_X = URL_X + 8 * 0.6 * HTTP_FS; // inizio del dominio (locale)
const ZERO = {x: DOM_X + 0.3 * DOM_FS, y: 108}; // centro dello zero (locale)
const DOM_W = V4_FAKE.phishDomain.length * 0.6 * DOM_FS;
const UNDER_Y = 140; // sottolineatura (locale)
/** Righe delle note (schermo). */
const N1_Y = PT - 132;
const N2_Y = PT + P.h + 70;

const Body: React.FC<{a: number}> = ({a}) => {
	const zk = prog(a, T.reveal - 1, 4, ease.outCubic); // lo zero è rosso già sul cue
	const ring = prog(a, T.ring, 8, ease.inOutCubic);
	const ringPulse = Math.exp(-Math.max(0, a - (T.ring + 8)) / 6) * (a >= T.ring + 8 ? 1 : 0);
	const under = prog(a, T.underline, 7, ease.outCubic);
	const C = 2 * Math.PI * 36; // perimetro (circa) dell'ellisse
	return (
		<>
			<div style={{position: 'absolute', right: 30, top: 22, display: 'flex', alignItems: 'center', gap: 10, fontFamily: FONTS.mono, fontSize: 24, letterSpacing: '0.14em', color: C4.redHot}}>
				<WarnGlyph size={24} color={C4.redBright} stroke={2.6} />
				INDIRIZZO REALE DEL LINK
			</div>
			<div style={{position: 'absolute', left: URL_X, top: 70, height: 70, display: 'flex', alignItems: 'baseline', fontFamily: FONTS.mono, whiteSpace: 'nowrap'}}>
				<span style={{fontSize: HTTP_FS, color: C4.gray}}>https://</span>
				<span style={{fontSize: DOM_FS, fontWeight: 600, color: C4.white}}>
					<PhishDomain k={zk} />
				</span>
			</div>
			<div style={{position: 'absolute', left: URL_X, top: 156, fontFamily: FONTS.mono, fontSize: 32, color: C4.gray, whiteSpace: 'nowrap'}}>{V4_FAKE.phishPath}</div>
			{/* sottolineatura rossa del dominio */}
			{under > 0.001 ? (
				<div style={{position: 'absolute', left: DOM_X, top: UNDER_Y, width: DOM_W, height: 4, borderRadius: 2, background: C4.redBright, transformOrigin: '0 50%', transform: `scaleX(${under})`, boxShadow: `0 0 14px ${a4(C4.red, 0.9)}`}} />
			) : null}
			{/* cerchio attorno allo zero */}
			{ring > 0.001 ? (
				<svg width={120} height={120} viewBox="-60 -60 120 120" style={{position: 'absolute', left: ZERO.x - 60, top: ZERO.y - 60, overflow: 'visible', transform: `scale(${1 + 0.08 * ringPulse})`}}>
					<ellipse rx="31" ry="40" fill="none" stroke={C4.redBright} strokeWidth="4" strokeDasharray={`${C * ring} ${C}`} transform="rotate(-100)" strokeLinecap="round" style={{filter: `drop-shadow(0 0 6px ${a4(C4.red, 0.9)})`}} />
				</svg>
			) : null}
		</>
	);
};

/**
 * REVEAL (180): l'indirizzo reale si stacca dal suggerimento e arriva grande, in mono: "https://0rbyx-verifica.example"
 * + percorso. Lo zero è evidenziato e cerchiato, il dominio sottolineato; due note spiegano il trucco.
 * Breve accento glitch (2 frame) all'ingresso. A 213 la targa rientra nel messaggio.
 */
export const RevealPlate: React.FC<{a: number; from: {x: number; y: number}; back: {x: number; y: number}}> = ({a, from, back}) => {
	if (a < T.reveal - 1 || a > T.retract + 14) return null;
	const pIn = prog(a, T.reveal - 1, 6, ease.outExpo);
	const pOut = prog(a, T.retract, 12, ease.inOutCubic);
	const cx = lerp(lerp(from.x, P.cx, pIn), back.x, pOut);
	const cy = lerp(lerp(from.y, P.cy, pIn), back.y, pOut);
	const sc = lerp(lerp(0.55, 1, pIn), 0.42, pOut);
	const op = clamp(pIn * 2) * (1 - prog(a, T.retract + 3, 6, ease.inQuad));
	const flash = hit(a, T.reveal, 10);
	const g = a >= T.reveal && a <= T.reveal + 2 ? [0.75, 0.4, 0.15][a - T.reveal] : 0;
	// note
	const n1 = prog(a, T.ann1, 7, ease.outCubic) * (1 - prog(a, T.retract - 3, 6));
	const n2 = prog(a, T.ann2, 7, ease.outCubic) * (1 - prog(a, T.retract - 3, 6));
	const lead1 = prog(a, T.ann1 - 2, 7, ease.inOutCubic);
	const lead2 = prog(a, T.ann2 - 2, 7, ease.inOutCubic);
	const zx = PL + ZERO.x;
	const domCx = PL + DOM_X + DOM_W / 2;
	const plateBox = (children: React.ReactNode, extra?: React.CSSProperties) => (
		<div
			style={{
				position: 'absolute',
				left: PL,
				top: PT,
				width: P.w,
				height: P.h,
				borderRadius: 26,
				...extra,
			}}
		>
			{children}
		</div>
	);
	return (
		<AbsoluteFill style={{pointerEvents: 'none'}}>
			<AbsoluteFill style={{opacity: op, transform: `translate(${cx - P.cx}px, ${cy - P.cy}px) scale(${sc})`, transformOrigin: `${P.cx}px ${P.cy}px`}}>
				{/* alone rosso dietro la targa */}
				<div style={{position: 'absolute', left: PL - 160, top: PT - 160, width: P.w + 320, height: P.h + 320, borderRadius: '50%', background: `radial-gradient(closest-side, ${a4(C4.red, 0.22 + 0.4 * flash)} 0%, ${a4(C4.red, 0)} 100%)`}} />
				{plateBox(<Body a={a} />, {
					background: 'linear-gradient(180deg, rgba(26,14,16,0.96) 0%, rgba(12,8,9,0.97) 100%)',
					border: `2px solid ${a4(C4.redBright, 0.55 + 0.4 * flash)}`,
					boxShadow: `0 40px 120px rgba(0,0,0,0.8), 0 0 ${50 + 70 * flash}px ${a4(C4.red, 0.4 + 0.3 * flash)}, inset 0 1px 0 rgba(255,255,255,0.08)`,
				})}
				{/* accento glitch: copia rossa e copia bianca sfalsate per 2 frame */}
				{g > 0 ? (
					<>
						{plateBox(
							<>
								<Body a={a} />
								<div style={{position: 'absolute', inset: 0, background: '#FF2A30', mixBlendMode: 'multiply'}} />
							</>,
							{background: '#000', mixBlendMode: 'screen', opacity: 0.8 * g, transform: `translateX(${10 * g}px)`, isolation: 'isolate', overflow: 'hidden'},
						)}
						{plateBox(<Body a={a} />, {mixBlendMode: 'screen', opacity: 0.25 * g, transform: `translateX(${-7 * g}px)`})}
						{[0, 1, 2].map((i) => (
							<div key={i} style={{position: 'absolute', left: PL - 40 + hash(a, i) * 60, top: PT + [-10, P.h + 6, P.h + 22][i] + hash(a, i + 9) * 8, width: P.w * (0.4 + 0.5 * hash(a, i + 4)), height: 2 + 3 * hash(a, i + 6), background: `rgba(255,214,215,${0.7 * g})`, boxShadow: `0 0 16px ${a4(C4.red, g)}`}} />
						))}
					</>
				) : null}
			</AbsoluteFill>
			{/* nota 1: lo zero al posto della "o" */}
			{lead1 > 0.001 && n1 > 0.001 ? (
				<div style={{position: 'absolute', left: zx - 1.5, top: N1_Y + 54, width: 3, height: (PT + ZERO.y - 44 - (N1_Y + 54)) * lead1, background: C4.redBright, opacity: n1, boxShadow: `0 0 10px ${a4(C4.red, 0.8)}`}} />
			) : null}
			{n1 > 0.001 ? (
				<div style={{position: 'absolute', left: zx - 13, top: N1_Y, opacity: n1, transform: `translateY(${(1 - n1) * 14}px)`, fontFamily: FONTS.body, fontWeight: 600, fontSize: 36, color: C4.white, whiteSpace: 'nowrap', textShadow: '0 2px 16px rgba(0,0,0,0.8)'}}>
					<span style={{fontFamily: FONTS.mono, color: C4.redBright}}>0</span>
					<span style={{color: C4.redHot}}> (zero)</span> al posto della «<span style={{fontFamily: FONTS.mono}}>o</span>»
				</div>
			) : null}
			{/* nota 2: dominio diverso */}
			{lead2 > 0.001 && n2 > 0.001 ? (
				<div style={{position: 'absolute', left: domCx - 1.5, top: PT + UNDER_Y + 10, width: 3, height: (N2_Y - (PT + UNDER_Y + 10) - 8) * lead2, background: C4.redBright, opacity: n2, boxShadow: `0 0 10px ${a4(C4.red, 0.8)}`}} />
			) : null}
			{n2 > 0.001 ? (
				<div style={{position: 'absolute', left: domCx, top: N2_Y, opacity: n2, transform: `translateX(-50%) translateY(${(1 - n2) * -12}px)`, fontFamily: FONTS.body, fontWeight: 600, fontSize: 34, color: C4.white, whiteSpace: 'nowrap', textShadow: '0 2px 16px rgba(0,0,0,0.8)'}}>
					dominio diverso da <span style={{fontFamily: FONTS.mono, fontWeight: 500, color: C4.greenBright}}>orbyx.example</span>
				</div>
			) : null}
		</AbsoluteFill>
	);
};
