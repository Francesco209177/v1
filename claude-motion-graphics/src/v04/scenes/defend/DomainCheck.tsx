import React from 'react';
import {clamp, ease, hit, prog} from '../../../lib/math';
import {FONTS} from '../../../theme';
import {a4, C4} from '../../theme';
import {V4_FAKE} from '../../timeline';
import {STACK} from './timing';

const ROW_H = 64;
const FS = 30; // JetBrains Mono: avanzamento 0,6 em = 18 px
const TEXT_X = 66;

/** Simbolo a sinistra della barra: lucchetto (ufficiale) o triangolo d'allarme (falso). */
const StatusGlyph: React.FC<{ok: boolean}> = ({ok}) => (
	<svg width={30} height={30} viewBox="0 0 30 30" style={{overflow: 'visible'}}>
		{ok ? (
			<g fill="none" stroke={C4.greenBright} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
				<rect x="6" y="13" width="18" height="13" rx="3" />
				<path d="M10 13 V9.5 a5 5 0 0 1 10 0 V13" />
			</g>
		) : (
			<g fill="none" stroke={C4.redBright} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
				<path d="M15 4 L27 25 H3 Z" />
				<path d="M15 12 V17" />
				<circle cx="15" cy="21" r="0.6" fill={C4.redBright} />
			</g>
		)}
	</svg>
);

/** Esito a destra: cerchio verde con spunta o rosso con croce. */
const Verdict: React.FC<{ok: boolean; p: number; pop: number}> = ({ok, p, pop}) => {
	const col = ok ? C4.green : C4.red;
	return (
		<svg width={40} height={40} viewBox="0 0 40 40" style={{overflow: 'visible', transform: `scale(${(0.6 + 0.4 * ease.outBack(clamp(p))) * (1 + 0.15 * pop)})`, opacity: clamp(p * 3)}}>
			<circle cx="20" cy="20" r="18" fill={a4(col, 0.9)} style={{filter: `drop-shadow(0 0 ${8 + 12 * pop}px ${a4(col, 0.9)})`}} />
			{ok ? (
				<path d="M11 21 L17.5 27.5 L29 14" fill="none" stroke={C4.black} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - clamp(p * 1.4)} />
			) : (
				<g stroke={C4.white} strokeWidth="4" strokeLinecap="round" opacity={clamp(p * 2)}>
					<path d="M13 13 L27 27" />
					<path d="M27 13 L13 27" />
				</g>
			)}
		</svg>
	);
};

type Seg = {t: string; mark?: 'zero' | 'extra' | 'o'};

/**
 * Confronto fra due barre degli indirizzi: quella ufficiale (account.orbyx.example, spunta verde) e quella
 * falsa (0rbyx-verifica.example, croce rossa). Una lama di scansione passa sulle barre e accende le differenze:
 * lo zero al posto della "o" (riquadro rosso, sul beat) e la parola in più "-verifica" (sottolineatura tratteggiata).
 */
export const DomainCheck: React.FC<{f: number; at: number; top: number}> = ({f, at, top}) => {
	const W = STACK.width - STACK.pad * 2;
	const rows: {ok: boolean; segs: Seg[]; label: string; typeAt: number; verdictAt: number}[] = [
		{ok: true, segs: [{t: 'account.'}, {t: 'o', mark: 'o'}, {t: 'rbyx.example'}], label: 'UFFICIALE', typeAt: at + 1, verdictAt: at + 25},
		{ok: false, segs: [{t: '0', mark: 'zero'}, {t: 'rbyx'}, {t: '-verifica', mark: 'extra'}, {t: '.example'}], label: 'FALSO', typeAt: at + 4, verdictAt: at + 27},
	];
	// lama di scansione: attraversa le barre e passa sullo zero esattamente sul beat (at + 15)
	const scanX = -40 + (f - (at + 13)) * 56;
	const scanOn = f >= at + 12 && scanX < W + 60;
	const zeroAt = at + 15;
	const extraAt = at + 17;
	return (
		<div style={{position: 'absolute', left: STACK.pad, top, width: W, height: ROW_H * 2 + 12}}>
			{rows.map((row, ri) => {
				const enter = prog(f, row.typeAt - 3, 6, ease.outCubic);
				const full = row.segs.map((s) => s.t).join('');
				const typed = Math.floor(clamp((f - row.typeAt) / 6) * full.length + 0.001);
				const vp = clamp((f - row.verdictAt) / 6);
				const vpop = hit(f, row.verdictAt, 8);
				const col = row.ok ? C4.green : C4.red;
				const judged = f >= row.verdictAt;
				let ci = 0;
				return (
					<div
						key={ri}
						style={{
							position: 'absolute',
							left: 0,
							top: ri * (ROW_H + 12),
							width: W,
							height: ROW_H,
							borderRadius: 16,
							background: a4(judged ? col : C4.white, judged ? 0.07 : 0.04),
							border: `1.5px solid ${a4(judged ? col : C4.white, judged ? 0.55 : 0.14)}`,
							boxShadow: judged ? `0 0 ${18 + 20 * vpop}px ${a4(col, 0.18 + 0.3 * vpop)}` : 'none',
							transform: `translateX(${(1 - enter) * 40}px)`,
							opacity: enter,
						}}
					>
						<div style={{position: 'absolute', left: 20, top: 17}}>
							<StatusGlyph ok={row.ok} />
						</div>
						<div style={{position: 'absolute', left: TEXT_X, top: 0, height: ROW_H, display: 'flex', alignItems: 'center', fontFamily: FONTS.mono, fontSize: FS, fontWeight: 500, whiteSpace: 'pre', color: C4.white}}>
							{row.segs.map((s, si) => {
								const chars = s.t.split('').map((ch) => {
									const idx = ci++;
									return (
										<span key={idx} style={{visibility: idx < typed ? 'visible' : 'hidden'}}>
											{ch}
										</span>
									);
								});
								// differenze accese dal passaggio della scansione
								const markAt = s.mark === 'zero' || s.mark === 'o' ? zeroAt : extraAt;
								const m = s.mark ? clamp((f - markAt) / 4) : 0;
								const mp = s.mark ? hit(f, markAt, 10) : 0;
								if (s.mark === 'zero') {
									return (
										<span
											key={si}
											style={{
												position: 'relative',
												color: C4.white,
												borderRadius: 6,
												background: a4(C4.red, 0.75 * m),
												boxShadow: m > 0 ? `0 0 0 ${2 + 3 * mp}px ${a4(C4.redBright, 0.9 * m)}, 0 0 ${16 + 20 * mp}px ${a4(C4.red, 0.8 * m)}` : 'none',
												transform: `scale(${1 + 0.35 * mp})`,
												display: 'inline-block',
											}}
										>
											{chars}
										</span>
									);
								}
								if (s.mark === 'o') {
									return (
										<span key={si} style={{position: 'relative', display: 'inline-block', color: m > 0.3 ? C4.greenHot : C4.white}}>
											{chars}
											<span style={{position: 'absolute', left: 1, right: 1, bottom: -3, height: 3, borderRadius: 2, background: C4.green, opacity: m, boxShadow: `0 0 10px ${a4(C4.green, 0.8)}`}} />
										</span>
									);
								}
								if (s.mark === 'extra') {
									return (
										<span key={si} style={{position: 'relative', display: 'inline-block', color: m > 0.3 ? C4.redHot : C4.white}}>
											{chars}
											<span style={{position: 'absolute', left: 0, width: `${100 * m}%`, bottom: -4, height: 0, borderBottom: `3px dashed ${C4.redBright}`}} />
										</span>
									);
								}
								return <span key={si}>{chars}</span>;
							})}
						</div>
						<div
							style={{
								position: 'absolute',
								right: 70,
								top: 0,
								height: ROW_H,
								display: 'flex',
								alignItems: 'center',
								fontFamily: FONTS.mono,
								fontSize: 24,
								fontWeight: 700,
								letterSpacing: '0.14em',
								color: row.ok ? C4.greenBright : C4.redBright,
								opacity: clamp(vp * 2),
								transform: `translateX(${(1 - ease.outCubic(vp)) * 16}px)`,
							}}
						>
							{row.label}
						</div>
						<div style={{position: 'absolute', right: 12, top: 12}}>
							<Verdict ok={row.ok} p={vp} pop={vpop} />
						</div>
					</div>
				);
			})}
			{/* lama di scansione */}
			{scanOn ? (
				<div
					style={{
						position: 'absolute',
						left: scanX - 70,
						top: -10,
						width: 80,
						height: ROW_H * 2 + 32,
						background: `linear-gradient(90deg, ${a4(C4.greenBright, 0)} 0%, ${a4(C4.greenBright, 0.14)} 80%, ${a4(C4.greenHot, 0.85)} 97%, ${a4(C4.greenHot, 0)} 100%)`,
						mixBlendMode: 'screen',
					}}
				/>
			) : null}
		</div>
	);
};
