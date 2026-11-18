import React from 'react';
import {clamp, ease, hit, prog} from '../../../lib/math';
import {FONTS} from '../../../theme';
import {a4, C4} from '../../theme';
import {STACK} from './timing';

const ROW_H = 64;
const FIELD_X = 236;
const CODE = '482913';

/** Etichetta mono maiuscola del fattore ("1 · PASSWORD", "2 · CODICE"). */
const FactorLabel: React.FC<{n: number; text: string; color: string}> = ({n, text, color}) => (
	<div style={{position: 'absolute', left: 20, top: 0, height: ROW_H, display: 'flex', alignItems: 'center', gap: 10, fontFamily: FONTS.mono, fontSize: 24, fontWeight: 700, letterSpacing: '0.14em', color}}>
		<span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: `2px solid ${color}`, fontSize: 20, letterSpacing: 0}}>{n}</span>
		{text}
	</div>
);

/**
 * Autenticazione a più fattori: 1° fattore = la password (solo pallini, marcata come "rubata"),
 * 2° fattore = codice a 6 cifre (482 913) che arriva sul TUO telefono e si compone cifra per cifra.
 * Messaggio: anche con la password rubata, senza il secondo codice non si entra.
 */
export const MfaCode: React.FC<{f: number; at: number; top: number}> = ({f, at, top}) => {
	const W = STACK.width - STACK.pad * 2;
	const r1 = prog(f, at + 1, 6, ease.outCubic);
	const r2 = prog(f, at + 5, 6, ease.outCubic);
	const stolen = clamp((f - (at + 8)) / 5);
	const stolenHit = hit(f, at + 8, 9);
	const digitsAt = at + 14; // una cifra ogni 2 frame
	const done = at + 27;
	const doneP = clamp((f - done) / 6);
	const doneHit = hit(f, done, 10);
	return (
		<div style={{position: 'absolute', left: STACK.pad, top, width: W, height: ROW_H * 2 + 12}}>
			{/* 1° fattore: password */}
			<div
				style={{
					position: 'absolute',
					left: 0,
					top: 0,
					width: W,
					height: ROW_H,
					borderRadius: 16,
					background: a4(C4.white, 0.035),
					border: `1.5px solid ${a4(stolen > 0 ? C4.red : C4.white, 0.14 + 0.3 * stolen)}`,
					transform: `translateX(${(1 - r1) * 40}px)`,
					opacity: r1,
				}}
			>
				<FactorLabel n={1} text="PASSWORD" color={C4.gray} />
				<div style={{position: 'absolute', left: FIELD_X, top: 0, height: ROW_H, display: 'flex', alignItems: 'center', fontFamily: FONTS.body, fontSize: 34, letterSpacing: '0.12em', color: a4(C4.white, 0.75)}}>
					••••••••
				</div>
				<div
					style={{
						position: 'absolute',
						right: 14,
						top: 12,
						height: 40,
						padding: '0 14px',
						borderRadius: 10,
						display: 'flex',
						alignItems: 'center',
						fontFamily: FONTS.mono,
						fontSize: 24,
						fontWeight: 700,
						letterSpacing: '0.14em',
						color: C4.redHot,
						background: a4(C4.red, 0.25),
						border: `1.5px solid ${a4(C4.redBright, 0.8)}`,
						boxShadow: `0 0 ${10 + 16 * stolenHit}px ${a4(C4.red, 0.5)}`,
						opacity: stolen,
						transform: `scale(${0.8 + 0.2 * ease.outBack(stolen)})`,
					}}
				>
					RUBATA
				</div>
			</div>
			{/* 2° fattore: codice sul telefono */}
			<div
				style={{
					position: 'absolute',
					left: 0,
					top: ROW_H + 12,
					width: W,
					height: ROW_H,
					borderRadius: 16,
					background: a4(C4.green, 0.06 + 0.04 * doneHit),
					border: `1.5px solid ${a4(C4.green, 0.4 + 0.4 * doneP)}`,
					boxShadow: `0 0 ${16 + 22 * doneHit}px ${a4(C4.green, 0.12 + 0.3 * doneHit)}`,
					transform: `translateX(${(1 - r2) * 40}px)`,
					opacity: r2,
				}}
			>
				<FactorLabel n={2} text="CODICE" color={C4.greenBright} />
				<div style={{position: 'absolute', left: FIELD_X, top: 9, display: 'flex', gap: 8}}>
					{CODE.split('').map((d, i) => {
						const t = digitsAt + i * 2;
						const on = f >= t;
						const pop = hit(f, t, 6);
						return (
							<div
								key={i}
								style={{
									width: 44,
									height: 46,
									marginLeft: i === 3 ? 16 : 0,
									borderRadius: 10,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									fontFamily: FONTS.mono,
									fontSize: 32,
									fontWeight: 700,
									color: C4.greenHot,
									background: a4(C4.green, on ? 0.16 : 0.05),
									border: `1.5px solid ${a4(C4.green, on ? 0.75 : 0.3)}`,
									boxShadow: on ? `0 0 ${8 + 14 * pop}px ${a4(C4.green, 0.4 + 0.4 * pop)}` : 'none',
									transform: `translateY(${-6 * pop}px)`,
									textShadow: `0 0 12px ${a4(C4.green, 0.8)}`,
								}}
							>
								{on ? d : ''}
							</div>
						);
					})}
				</div>
				{/* telefono + esito */}
				<svg width={30} height={44} viewBox="0 0 30 44" style={{position: 'absolute', right: 70, top: 10}}>
					<rect x="2" y="2" width="26" height="40" rx="6" fill="none" stroke={C4.greenBright} strokeWidth="2.6" />
					<path d="M11 7 H19" stroke={C4.greenBright} strokeWidth="2.2" strokeLinecap="round" />
				</svg>
				<svg width={40} height={40} viewBox="0 0 40 40" style={{position: 'absolute', right: 14, top: 12, overflow: 'visible', opacity: clamp(doneP * 3), transform: `scale(${(0.6 + 0.4 * ease.outBack(doneP)) * (1 + 0.15 * doneHit)})`}}>
					<circle cx="20" cy="20" r="18" fill={C4.green} style={{filter: `drop-shadow(0 0 ${8 + 12 * doneHit}px ${a4(C4.green, 0.9)})`}} />
					<path d="M11 21 L17.5 27.5 L29 14" fill="none" stroke={C4.black} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - clamp(doneP * 1.4)} />
				</svg>
			</div>
		</div>
	);
};
