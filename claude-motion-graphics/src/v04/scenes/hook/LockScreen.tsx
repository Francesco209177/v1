import React from 'react';
import {clamp, ease, hash, prog} from '../../../lib/math';
import {FONTS} from '../../../theme';
import {PHONE_SCREEN} from '../../components/Phone';
import {a4, C4} from '../../theme';
import {LockGlyph, StatusIcons, WarnGlyph} from './glyphs';
import {NotificationCard} from './NotificationCard';
import {alarmP, H, LS, TAP_POINT} from './pose';

const S = PHONE_SCREEN;

/** Sfondo della schermata di blocco: nero-grafite con bagliori grigio/verdi e archi sottilissimi. */
const Wallpaper: React.FC<{f: number}> = ({f}) => (
	<div style={{position: 'absolute', inset: 0}}>
		<div style={{position: 'absolute', inset: 0, background: 'linear-gradient(180deg, #0E1315 0%, #090C0D 55%, #0A0F0D 100%)'}} />
		<div
			style={{
				position: 'absolute',
				inset: 0,
				background: `radial-gradient(75% 45% at ${22 + Math.sin(f / 40) * 3}% 84%, ${a4(C4.greenDeep, 0.42)} 0%, ${a4(C4.greenDeep, 0)} 100%), radial-gradient(60% 35% at 86% 10%, rgba(200,214,208,0.10) 0%, rgba(200,214,208,0) 100%)`,
			}}
		/>
		<svg width={S.w} height={S.h} style={{position: 'absolute', inset: 0}}>
			{Array.from({length: 8}, (_, i) => (
				<ellipse
					key={i}
					cx={40 + Math.sin(f / 50 + i) * 6}
					cy={1120}
					rx={260 + i * 96}
					ry={210 + i * 80}
					fill="none"
					stroke={i % 3 === 0 ? C4.green : C4.white}
					strokeOpacity={i % 3 === 0 ? 0.13 : 0.045}
					strokeWidth={i % 3 === 0 ? 1.6 : 1.2}
				/>
			))}
		</svg>
	</div>
);

/** Flusso esadecimale astratto (solo texture, non leggibile): mai codice reale. */
const HexStream: React.FC<{f: number; opacity: number}> = ({f, opacity}) => {
	const rows = 30;
	const lh = 38;
	const shift = (f * 3.2) % lh;
	return (
		<div style={{position: 'absolute', inset: 0, overflow: 'hidden', opacity, fontFamily: FONTS.mono, fontSize: 18, color: C4.redHot, letterSpacing: '0.12em'}}>
			{Array.from({length: rows}, (_, r) => {
				const row = r + Math.floor((f * 3.2) / lh);
				const txt = Array.from({length: 11}, (_, c) => Math.floor(hash(row, c) * 256).toString(16).toUpperCase().padStart(2, '0')).join(' ');
				return (
					<div key={r} style={{position: 'absolute', left: 14, top: (r - 1) * lh + shift, whiteSpace: 'nowrap', opacity: 0.35 + 0.65 * hash(row, 99)}}>
						{txt}
					</div>
				);
			})}
		</div>
	);
};

/** Increspatura del tocco nel punto di contatto. */
const Ripple: React.FC<{f: number}> = ({f}) => {
	if (f < H.tap || f > H.tap + 22) return null;
	const flash = Math.exp(-(f - H.tap) / 2.2);
	return (
		<>
			<div
				style={{
					position: 'absolute',
					left: TAP_POINT.x - 60,
					top: TAP_POINT.y - 60,
					width: 120,
					height: 120,
					borderRadius: '50%',
					background: `radial-gradient(closest-side, rgba(255,255,255,${0.95 * flash}) 0%, ${a4(C4.redHot, 0.6 * flash)} 45%, ${a4(C4.red, 0)} 100%)`,
				}}
			/>
			{[0, 4].map((d) => {
				const t = f - H.tap - d;
				if (t < 0 || t > 18) return null;
				const u = ease.outCubic(t / 18);
				const r = 18 + 250 * u;
				return (
					<div
						key={d}
						style={{
							position: 'absolute',
							left: TAP_POINT.x - r,
							top: TAP_POINT.y - r,
							width: r * 2,
							height: r * 2,
							borderRadius: '50%',
							border: `${4 - 3 * u}px solid ${d === 0 ? `rgba(255,255,255,${0.9 * (1 - u)})` : a4(C4.redBright, 0.8 * (1 - u))}`,
							boxShadow: `0 0 24px ${a4(C4.red, 0.5 * (1 - u))}`,
						}}
					/>
				);
			})}
		</>
	);
};

/**
 * Contenuto dello schermo del telefono nell'HOOK: schermata di blocco (ora, data, sfondo), notifica fittizia,
 * poi al tocco (60) l'allarme rosso che si propaga dal punto di contatto, il simbolo di avviso e il rumore esadecimale.
 */
export const LockScreen: React.FC<{f: number}> = ({f}) => {
	const wake = prog(f, H.notif - 1, 3, ease.outCubic); // a 6 lo schermo è già acceso
	const dim = 0.42 * (1 - wake);
	const wakeFlash = f >= H.notif ? Math.exp(-(f - H.notif) / 4) : 0;
	const al = alarmP(f);
	// propagazione rossa dal dito: raggio in coordinate schermo
	const sweepT = clamp((f - H.tap) / 7);
	const sweepR = f < H.tap ? 0 : 20 + 760 * ease.outQuad(sweepT);
	const sweepOn = f >= H.tap;
	// orologio: si spegne con un guizzo al tocco
	const clockOut = f < H.tap ? 0 : clamp((f - H.tap) / 4);
	const clockJit = f >= H.tap && f < H.tap + 4 ? (hash(f, 3) - 0.5) * 24 : 0;
	// simbolo di avviso
	const warnIn = prog(f, H.tap + 2, 9, ease.outBack);
	const warnBeat = Math.exp(-Math.max(0, f - 75) / 5) * (f >= 75 ? 1 : 0);
	return (
		<>
			<Wallpaper f={f} />
			{/* barra di stato + lucchetto */}
			<div style={{position: 'absolute', right: 30, top: 26}}>
				<StatusIcons color={sweepOn ? C4.redHot : C4.white} />
			</div>
			<div style={{position: 'absolute', left: S.w / 2 - 13, top: 76, opacity: 0.9 * (1 - clockOut)}}>
				<LockGlyph size={26} color={C4.white} />
			</div>
			{/* data e ora */}
			<div style={{position: 'absolute', left: 0, right: 0, top: 112, textAlign: 'center', fontFamily: FONTS.body, fontWeight: 500, fontSize: 24, color: a4(C4.white, 0.86), opacity: 1 - clockOut}}>
				mercoledì 18 novembre
			</div>
			<div
				style={{
					position: 'absolute',
					left: clockJit,
					right: -clockJit,
					top: 140,
					textAlign: 'center',
					fontFamily: FONTS.display,
					fontWeight: 500,
					fontSize: 142,
					lineHeight: 1,
					letterSpacing: '-0.035em',
					color: a4(C4.white, 0.95),
					opacity: 1 - clockOut,
					textShadow: `0 0 40px ${a4(C4.white, 0.12)}`,
				}}
			>
				09:41
			</div>
			{/* allarme: onda rossa dal punto di contatto (sotto la notifica, che resta leggibile) */}
			{sweepOn ? (
				<div style={{position: 'absolute', inset: 0, clipPath: `circle(${sweepR}px at ${TAP_POINT.x}px ${TAP_POINT.y}px)`}}>
					<div
						style={{
							position: 'absolute',
							inset: 0,
							background: `radial-gradient(85% 42% at 50% ${(LS.clockCY / S.h) * 100}%, rgba(186,26,33,0.92) 0%, rgba(96,11,15,0.94) 55%, rgba(30,4,6,0.96) 100%)`,
						}}
					/>
					<HexStream f={f} opacity={0.075 + 0.05 * warnBeat} />
					<div style={{position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 5px, rgba(0,0,0,0.28) 5px, rgba(0,0,0,0.28) 7px)', backgroundPosition: `0 ${(f * 2) % 7}px`}} />
					{/* fascia di scansione che scende */}
					<div style={{position: 'absolute', left: 0, right: 0, top: ((f - H.tap) * 38) % (S.h + 200) - 100, height: 90, background: `linear-gradient(180deg, ${a4(C4.redBright, 0)} 0%, ${a4(C4.redBright, 0.14)} 80%, ${a4(C4.redHot, 0.3)} 100%)`}} />
				</div>
			) : null}
			<NotificationCard f={f} alarm={al} />
			{/* indicatore home */}
			<div style={{position: 'absolute', left: S.w / 2 - 70, top: S.h - 26, width: 140, height: 5, borderRadius: 3, background: a4(sweepOn ? C4.redHot : C4.white, 0.55)}} />
			{/* schermo spento → acceso */}
			{dim > 0.003 ? <div style={{position: 'absolute', inset: 0, background: `rgba(0,0,0,${dim})`}} /> : null}
			{wakeFlash > 0.01 ? (
				<div style={{position: 'absolute', inset: 0, background: `radial-gradient(90% 30% at 50% 0%, rgba(235,242,238,${0.22 * wakeFlash}) 0%, rgba(235,242,238,0) 100%)`}} />
			) : null}
			{/* fronte d'onda luminoso */}
			{sweepOn && sweepT < 1 ? (
				<div
					style={{
						position: 'absolute',
						left: TAP_POINT.x - sweepR,
						top: TAP_POINT.y - sweepR,
						width: sweepR * 2,
						height: sweepR * 2,
						borderRadius: '50%',
						border: `3px solid rgba(255,220,221,${0.85 * (1 - sweepT)})`,
						boxShadow: `0 0 30px ${a4(C4.redBright, 0.8 * (1 - sweepT))}, inset 0 0 40px ${a4(C4.red, 0.6 * (1 - sweepT))}`,
					}}
				/>
			) : null}
			{/* simbolo di avviso al posto dell'orologio */}
			{warnIn > 0.001 ? (
				<div style={{position: 'absolute', left: S.w / 2 - 90, top: LS.clockCY - 96, width: 180, height: 180, opacity: clamp(warnIn * 1.5), transform: `scale(${(0.55 + 0.45 * warnIn) * (1 + 0.06 * warnBeat)})`}}>
					<div style={{position: 'absolute', inset: -70, borderRadius: '50%', background: `radial-gradient(closest-side, ${a4(C4.redBright, 0.55 + 0.25 * warnBeat)} 0%, ${a4(C4.red, 0)} 100%)`}} />
					<div style={{position: 'absolute', inset: 0}}>
						<WarnGlyph size={180} color="#FFE3E4" stroke={2.2} fill={a4(C4.red, 0.35)} />
					</div>
				</div>
			) : null}
			<Ripple f={f} />
			{/* bagliore generale dell'allarme sul vetro */}
			{al > 0.01 ? <div style={{position: 'absolute', inset: 0, boxShadow: `inset 0 0 90px rgba(0,0,0,${0.55 * al}), inset 0 0 ${26 + 30 * warnBeat}px ${a4(C4.redBright, (0.45 + 0.3 * warnBeat) * al)}`}} /> : null}
		</>
	);
};
