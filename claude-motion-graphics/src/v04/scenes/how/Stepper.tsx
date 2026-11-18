import React from 'react';
import {beatPulse, clamp, ease, hash, hit, lerp, prog} from '../../../lib/math';
import {FONTS} from '../../../theme';
import {a4, C4, glow4} from '../../theme';
import {CUE, stepAt, STEPS} from './timing';

/** HUD in alto: 5 nodi numerati uniti da una linea che si riempie di rosso, ed etichetta del passo attivo. */
const NX = [156, 348, 540, 732, 924] as const;
const NY = 262;
const LABEL_Y = 340;
const GLYPHS = 'ABCDEFGHKMNPRSTUVZ0123456789#/<>';

/** Riempimento in "unità nodo": avanza piano durante il passo e accelera fino a toccare il nodo successivo sul cue. */
const fillAt = (f: number): number => {
	let u = 0;
	for (let k = 0; k < CUE.length - 1; k++) {
		if (f < CUE[k]) break;
		const seg = 0.2 * prog(f, CUE[k] + 4, 30, ease.inOutSine) + 0.8 * prog(f, CUE[k + 1] - 9, 9, ease.inCubic);
		u = k + seg;
	}
	return u;
};

export const Stepper: React.FC<{f: number; abs: number}> = ({f, abs}) => {
	const build = prog(f, 0, 12, ease.outCubic);
	const idx = stepAt(f);
	const fill = fillAt(f);
	const fillX = NX[0] + (NX[1] - NX[0]) * fill;
	const charging = clamp(fill - Math.floor(fill)) > 0.21 && fill < 4;
	const beat = beatPulse(abs, 5);

	// etichetta: decodifica dei caratteri dopo il cue, uscita 4 frame prima del cue successivo
	const cue = CUE[idx];
	const next = idx < 4 ? CUE[idx + 1] : 9999;
	const step = STEPS[idx];
	const full = `${step.n} · ${step.text}`;
	const resolved = Math.floor(full.length * prog(f, cue, 7, ease.linear)) + (f >= cue + 7 ? 99 : 0);
	const enter = prog(f, cue, 8, ease.outCubic);
	const exit = prog(f, next - 4, 4, ease.inCubic);
	const chars = full.split('').map((ch, i) => {
		if (i < resolved || ch === ' ' || ch === '·') return ch;
		return GLYPHS[Math.floor(hash(i * 13 + idx, f) * GLYPHS.length)];
	});
	const pillHit = hit(f, cue, 10);

	return (
		<div style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
			{/* binario */}
			<div style={{position: 'absolute', left: NX[0], top: NY - 1, width: (NX[4] - NX[0]) * build, height: 2, background: a4(C4.white, 0.16)}} />
			{/* riempimento rosso */}
			<div
				style={{
					position: 'absolute',
					left: NX[0],
					top: NY - 2,
					width: Math.max(0, fillX - NX[0]),
					height: 4,
					background: `linear-gradient(90deg, ${a4(C4.red, 0.7)}, ${C4.redBright})`,
					boxShadow: `0 0 14px ${a4(C4.red, 0.8)}`,
				}}
			/>
			{charging ? (
				<div
					style={{
						position: 'absolute',
						left: fillX - 30,
						top: NY - 30,
						width: 60,
						height: 60,
						borderRadius: '50%',
						background: `radial-gradient(closest-side, ${a4(C4.redHot, 0.9)} 0%, ${a4(C4.red, 0.5)} 30%, ${a4(C4.red, 0)} 100%)`,
					}}
				/>
			) : null}
			{/* nodi */}
			{NX.map((x, i) => {
				const pop = prog(f, i * 2, 9, ease.outBack);
				const done = i < idx;
				const active = i === idx;
				const h = hit(f, CUE[i], 9);
				const s = pop * (1 + 0.32 * h + (active ? 0.05 * beat : 0));
				const R = 27;
				return (
					<div
						key={i}
						style={{
							position: 'absolute',
							left: x - R,
							top: NY - R,
							width: R * 2,
							height: R * 2,
							borderRadius: '50%',
							boxSizing: 'border-box',
							transform: `scale(${s})`,
							opacity: clamp(pop * 1.4),
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							fontFamily: FONTS.mono,
							fontWeight: 700,
							fontSize: 24,
							background: active ? `radial-gradient(circle at 50% 40%, ${C4.redBright}, ${C4.red} 60%, ${C4.redDeep})` : done ? a4(C4.red, 0.2) : '#0B0E0F',
							border: `2px solid ${active ? C4.redHot : done ? a4(C4.redBright, 0.85) : a4(C4.white, 0.22)}`,
							color: active ? C4.white : done ? C4.redHot : C4.grayDim,
							boxShadow: active ? `0 0 ${26 + 40 * h}px ${a4(C4.red, 0.7 + 0.3 * h)}` : done ? `0 0 14px ${a4(C4.red, 0.35)}` : 'none',
						}}
					>
						{STEPS[i].n}
					</div>
				);
			})}
			{/* etichetta del passo */}
			<div style={{position: 'absolute', left: 0, width: 1080, top: LABEL_Y - 29, display: 'flex', justifyContent: 'center'}}>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						height: 58,
						padding: '0 26px',
						borderRadius: 14,
						background: 'linear-gradient(180deg, rgba(20,24,26,0.88), rgba(10,12,13,0.88))',
						border: `1.5px solid ${a4(C4.red, 0.28 + 0.5 * pillHit)}`,
						boxShadow: `0 12px 40px rgba(0,0,0,0.55), 0 0 ${30 * pillHit}px ${a4(C4.red, 0.5 * pillHit)}`,
						opacity: enter * (1 - exit) * build,
						transform: `translateY(${lerp(16, 0, enter) - 14 * exit}px)`,
						whiteSpace: 'pre',
						fontFamily: FONTS.mono,
						fontWeight: 700,
						fontSize: 28,
						letterSpacing: '0.14em',
					}}
				>
					{chars.map((ch, i) => {
						const isNum = i < 2;
						const ok = i < resolved || ch === ' ';
						const color = !ok ? a4(C4.red, 0.75) : isNum ? C4.redBright : ch === '·' ? C4.grayDim : C4.white;
						return (
							<span key={i} style={{color, textShadow: isNum && ok ? glow4(C4.red, 0.6) : 'none'}}>
								{ch}
							</span>
						);
					})}
				</div>
			</div>
		</div>
	);
};
