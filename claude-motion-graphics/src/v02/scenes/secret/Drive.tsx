import React from 'react';
import {clamp, ease, invLerp, lerp, prog} from '../../../lib/math';
import {alpha, COLORS, FONTS} from '../../../theme';
import {LOADED, T} from './timing';

/** Geometria dell'SSD (coordinate del frame). La fessura è sul bordo superiore. */
export const SSD = {cx: 540, top: 1084, w: 760, h: 128} as const;
const CHIP = {w: 500, h: 112} as const;

const MONO: React.CSSProperties = {fontFamily: FONTS.mono, letterSpacing: '0.14em', textTransform: 'uppercase', whiteSpace: 'nowrap'};

/** Avanzamento dell'installazione (0..1): esattamente 1 a LOADED (assoluto 210). */
export const installProgress = (L: number): number => {
	const t = invLerp(T.progressStart, LOADED, L);
	// curva leggermente irregolare ma monotona (sembra un vero trasferimento)
	return clamp(ease.inOutSine(t) * 0.92 + t * 0.08 + 0.025 * Math.sin(t * Math.PI * 3) * t * (1 - t));
};

const FileIcon: React.FC = () => (
	<svg width={30} height={36} viewBox="0 0 30 36">
		<path d="M4 2 H19 L27 10 V34 H4 Z" fill={alpha(COLORS.orange, 0.12)} stroke={COLORS.orangeBright} strokeWidth={2.2} strokeLinejoin="round" />
		<path d="M19 2 V10 H27" fill="none" stroke={COLORS.orangeBright} strokeWidth={2.2} strokeLinejoin="round" />
		<path d="M9 18 H22 M9 23 H22 M9 28 H17" stroke={alpha(COLORS.orangeBright, 0.7)} strokeWidth={2} strokeLinecap="round" />
	</svg>
);

/** Spunta disegnata come tratto (niente emoji). */
const Check: React.FC<{p: number; size?: number}> = ({p, size = 34}) => (
	<svg width={size} height={size} viewBox="0 0 34 34">
		<circle cx={17} cy={17} r={15} fill={alpha(COLORS.orange, 0.2 * p)} stroke={COLORS.orangeBright} strokeWidth={2.4} strokeDasharray={95} strokeDashoffset={95 * (1 - ease.outCubic(clamp(p * 1.6)))} />
		<path d="M10 17.5 L15 22.5 L24.5 12" fill="none" stroke={COLORS.white} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={24} strokeDashoffset={24 * (1 - ease.outCubic(clamp(p * 1.6 - 0.5)))} />
	</svg>
);

/**
 * Il file del modello (chip) scende e si innesta nella fessura dell'SSD; la barra si completa a LOADED
 * con un "clic" luminoso e l'etichetta INSTALLATO IN LOCALE. Poi tutto esce verso il basso.
 */
export const Drive: React.FC<{L: number}> = ({L}) => {
	if (L < T.slabIn - 1 || L > T.exitEnd + 1) return null;
	const exit = ease.inCubic(invLerp(T.exitStart, T.exitEnd, L));
	const slabIn = ease.outCubic(invLerp(T.slabIn, T.slabIn + 12, L));
	const p = installProgress(L);
	const done = L >= LOADED;
	const hit = done ? Math.exp(-(L - LOADED) / 7) : 0;
	const lab = prog(L, LOADED + 1, 10, ease.outCubic);
	const slabY = SSD.top + (1 - slabIn) * 60 + exit * 90;
	const slabOp = slabIn * (1 - exit);

	// chip: comparsa sopra, discesa, innesto parziale, "clic" finale a LOADED
	const chipIn = ease.outBack(clamp((L - T.chipIn) / 12));
	const down = ease.inOutCubic(invLerp(T.chipDown, T.insert, L));
	const click = done ? ease.outCubic(clamp((L - LOADED) / 3)) : 0;
	const settle = done ? Math.sin(clamp((L - LOADED) / 6) * Math.PI) * 4 : 0;
	const chipBottom = lerp(SSD.top - 120, SSD.top + 30, down) + 26 * click - settle + (1 - chipIn) * -40 + exit * 90;
	const chipOp = clamp((L - T.chipIn) / 6) * (1 - exit);
	const pinLit = (i: number) => (L > T.insert ? 0.35 + 0.65 * Math.max(0, Math.sin((L - T.insert) * 0.5 - i * 0.7)) : 0.2);

	return (
		<div style={{position: 'absolute', inset: 0}}>
			{/* chip del modello, ritagliato alla fessura (la parte inserita sparisce nell'SSD) */}
			<div style={{position: 'absolute', left: 0, top: 0, width: 1080, height: slabY + 2, overflow: 'hidden', opacity: chipOp}}>
				<div
					style={{
						position: 'absolute',
						left: SSD.cx - CHIP.w / 2,
						top: chipBottom - CHIP.h,
						width: CHIP.w,
						height: CHIP.h,
						transform: `scale(${0.86 + 0.14 * chipIn})`,
						borderRadius: '16px 16px 6px 6px',
						background: 'linear-gradient(180deg, #2A2522 0%, #1A1715 100%)',
						border: `1.5px solid ${alpha(COLORS.orangeBright, 0.55 + 0.45 * hit)}`,
						boxShadow: `0 0 ${30 + 50 * hit}px ${alpha(COLORS.orange, 0.3 + 0.5 * hit)}, inset 0 1px 0 rgba(255,255,255,0.08)`,
						overflow: 'hidden',
					}}
				>
					<div style={{position: 'absolute', left: 22, top: 0, right: 22, height: 70, display: 'flex', alignItems: 'center', gap: 16}}>
						<FileIcon />
						<div style={{fontFamily: FONTS.mono, fontWeight: 500, fontSize: 27, color: COLORS.white, whiteSpace: 'nowrap'}}>modello-8B.gguf</div>
						<div style={{flex: 1}} />
						<div style={{fontFamily: FONTS.mono, fontWeight: 700, fontSize: 26, color: COLORS.orangeBright, whiteSpace: 'nowrap'}}>4,7 GB</div>
					</div>
					{/* contatti del connettore */}
					<div style={{position: 'absolute', left: 28, right: 28, top: 76, height: 30, display: 'flex', gap: 8}}>
						{Array.from({length: 16}, (_, i) => (
							<div key={i} style={{flex: 1, borderRadius: 3, background: alpha(COLORS.orangeBright, 0.25 + 0.6 * pinLit(i) * (done ? 0.6 : 1)), boxShadow: `0 0 8px ${alpha(COLORS.orange, 0.4 * pinLit(i))}`}} />
						))}
					</div>
				</div>
			</div>

			{/* SSD */}
			<div
				style={{
					position: 'absolute',
					left: SSD.cx - SSD.w / 2,
					top: slabY,
					width: SSD.w,
					height: SSD.h,
					opacity: slabOp,
					borderRadius: 20,
					background: 'linear-gradient(180deg, #221E1B 0%, #161412 100%)',
					border: `1.5px solid ${alpha(COLORS.orange, 0.35 + 0.5 * hit)}`,
					boxShadow: `0 30px 80px rgba(0,0,0,0.6), 0 0 ${40 + 80 * hit}px ${alpha(COLORS.orange, 0.18 + 0.45 * hit)}, inset 0 1px 0 rgba(255,255,255,0.06)`,
				}}
			>
				{/* fessura */}
				<div
					style={{
						position: 'absolute',
						left: (SSD.w - 540) / 2,
						top: -6,
						width: 540,
						height: 12,
						borderRadius: 6,
						background: '#050505',
						boxShadow: `inset 0 0 0 1.5px ${alpha(COLORS.orangeBright, 0.5 + 0.5 * hit)}, 0 0 ${16 + 40 * hit}px ${alpha(COLORS.orange, 0.5 + 0.5 * hit)}`,
					}}
				/>
				{/* riga A: SSD · barra/percentuale → INSTALLATO IN LOCALE */}
				<div style={{position: 'absolute', left: 30, right: 30, top: 22, height: 44, display: 'flex', alignItems: 'center', gap: 22}}>
					<div style={{...MONO, fontSize: 24, fontWeight: 700, color: COLORS.orangeBright, padding: '4px 10px 4px 13px', border: `1.5px solid ${alpha(COLORS.orange, 0.6)}`, borderRadius: 7}}>SSD</div>
					<div style={{position: 'relative', flex: 1, height: 44}}>
						{/* barra */}
						<div style={{position: 'absolute', left: 0, right: 92, top: 18, height: 8, borderRadius: 4, background: alpha(COLORS.white, 0.08), opacity: 1 - lab}}>
							<div
								style={{
									position: 'absolute',
									left: 0,
									top: 0,
									bottom: 0,
									width: `${p * 100}%`,
									borderRadius: 4,
									background: `linear-gradient(90deg, ${COLORS.orangeDeep}, ${COLORS.orange} 60%, ${hit > 0 ? COLORS.white : COLORS.orangeHot})`,
									boxShadow: `0 0 ${12 + 30 * hit}px ${alpha(COLORS.orangeBright, 0.7)}`,
								}}
							/>
						</div>
						<div style={{position: 'absolute', right: 0, top: 0, height: 44, display: 'flex', alignItems: 'center', fontFamily: FONTS.mono, fontWeight: 700, fontSize: 27, color: COLORS.white, opacity: 1 - lab}}>
							{`${Math.floor(p * 100)}%`.padStart(4, ' ')}
						</div>
						{/* conferma */}
						{done ? (
							<div style={{position: 'absolute', left: 0, top: 0, height: 44, display: 'flex', alignItems: 'center', gap: 14, opacity: lab, transform: `translateY(${(1 - lab) * 10}px)`}}>
								<Check p={clamp((L - LOADED) / 10)} size={40} />
								<div style={{...MONO, fontSize: 31, fontWeight: 700, color: COLORS.white, textShadow: `0 0 18px ${alpha(COLORS.orange, 0.7)}`, clipPath: `inset(0 ${100 - lab * 100}% 0 0)`}}>Installato in locale</div>
							</div>
						) : null}
					</div>
				</div>
				{/* riga B */}
				<div style={{position: 'absolute', left: 32, top: 78, ...MONO, letterSpacing: '0.06em', fontSize: 24, fontWeight: 500, color: alpha(COLORS.gray, done ? 0.55 : 0.85)}}>
					Download iniziale · una sola volta
				</div>
				{/* lampo che attraversa l'SSD al "clic" */}
				{hit > 0.02 ? (
					<div
						style={{
							position: 'absolute',
							inset: 0,
							borderRadius: 20,
							background: `linear-gradient(90deg, rgba(255,240,228,0) ${lerp(-30, 100, 1 - hit) - 20}%, rgba(255,240,228,${0.35 * hit}) ${lerp(-30, 100, 1 - hit)}%, rgba(255,240,228,0) ${lerp(-30, 100, 1 - hit) + 20}%)`,
						}}
					/>
				) : null}
			</div>
		</div>
	);
};
