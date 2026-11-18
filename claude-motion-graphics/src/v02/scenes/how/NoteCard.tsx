import React from 'react';
import {beatPulse, clamp, ease, prog} from '../../../lib/math';
import {alpha, COLORS, FONTS, textGlow} from '../../../theme';
import {T} from './timing';

/**
 * Nota di accuratezza (obbligatoria): il concetto in grande, sotto un confronto semplice e corretto
 * (modelli a 4 bit ≈ 0,5–0,6 GB per miliardo di parametri: 8B ≈ 4,7 GB, 70B ≈ 40 GB).
 * Resta leggibile per ~2 s; il diagramma dietro è attenuato (un solo punto focale).
 */
const CARD = {x: 540, y: 770, w: 920, h: 556};

const HEADING: {w: string; hi?: boolean}[][] = [
	[{w: 'Prestazioni'}, {w: 'e'}, {w: 'dimensioni'}],
	[{w: 'del'}, {w: 'modello'}, {w: 'dipendono'}],
	[{w: "dall'hardware.", hi: true}],
];

const ROWS = [
	{size: '1–3 B', text: 'PC comuni', bar: 0.08},
	{size: '7–8 B', text: '~4–5 GB (4 bit)', bar: 0.24},
	{size: '70 B', text: 'molta RAM/VRAM', bar: 1},
];

const NOTE_ROWS_AT = T.rowsIn;

export const NoteCard: React.FC<{f: number; abs: number}> = ({f, abs}) => {
	if (f < T.cardIn - 1) return null;
	const inP = prog(f, T.cardIn, 11, ease.outCubic);
	const outP = prog(f, T.collapse + 2, T.end - T.collapse - 2, ease.inQuad);
	const antic = prog(f, T.collapse - 3, 5, ease.outCubic) * (1 - outP); // piccolo respiro prima del collasso
	const energy = prog(f, NOTE_ROWS_AT, T.collapse - NOTE_ROWS_AT, ease.inQuad);
	const beat = beatPulse(abs, 5) * (0.3 + 0.7 * energy);
	const sweep = (((f - T.cardIn) / 36) * (1 + 0.6 * energy)) % 1;

	let wi = 0;
	return (
		<div
			style={{
				position: 'absolute',
				left: CARD.x - CARD.w / 2,
				top: CARD.y - CARD.h / 2,
				width: CARD.w,
				height: CARD.h,
				opacity: clamp(inP * 1.4) * (1 - outP),
				transformOrigin: '50% 45%',
				transform: `translateY(${(1 - inP) * 34 - outP * 10}px) scale(${(0.94 + 0.06 * inP + 0.025 * antic) * (1 - 0.86 * outP)}, ${(0.94 + 0.06 * inP + 0.025 * antic) * (1 - 0.97 * outP)})`,
				filter: inP < 1 || outP > 0 ? `blur(${(1 - inP) * 8 + outP * 6}px) brightness(${1 + 1.6 * outP})` : undefined,
			}}
		>
			{/* vetro scuro */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					borderRadius: 32,
					background: `linear-gradient(180deg, ${alpha(COLORS.surface2, 0.96)} 0%, ${alpha(COLORS.bgSoft, 0.97)} 100%)`,
					border: `1px solid ${alpha(COLORS.orange, 0.3 + 0.45 * beat)}`,
					boxShadow: `0 30px 80px rgba(0,0,0,0.7), 0 0 ${40 + 70 * beat}px ${alpha(COLORS.orange, 0.12 + 0.28 * beat)}, inset 0 1px 0 rgba(255,255,255,0.07)`,
				}}
			/>
			{/* filo luminoso in alto che scorre */}
			<div
				style={{
					position: 'absolute',
					left: 40,
					right: 40,
					top: 0,
					height: 2,
					background: `linear-gradient(90deg, ${alpha(COLORS.orange, 0)} 0%, ${alpha(COLORS.orange, 0.45)} ${sweep * 100 - 22}%, ${COLORS.orangeHot} ${sweep * 100}%, ${alpha(COLORS.orange, 0.45)} ${sweep * 100 + 22}%, ${alpha(COLORS.orange, 0)} 100%)`,
				}}
			/>

			{/* etichetta */}
			<div
				style={{
					position: 'absolute',
					left: 56,
					top: 44,
					display: 'flex',
					alignItems: 'center',
					gap: 14,
					fontFamily: FONTS.mono,
					fontSize: 26,
					fontWeight: 500,
					letterSpacing: '0.14em',
					color: COLORS.orange,
					opacity: prog(f, T.cardIn + 2, 6),
				}}
			>
				<span style={{width: 12, height: 12, borderRadius: 3, background: COLORS.orange, boxShadow: `0 0 12px ${COLORS.orange}`}} />
				DA SAPERE
			</div>

			{/* il concetto */}
			<div
				style={{
					position: 'absolute',
					left: 56,
					top: 96,
					fontFamily: FONTS.display,
					fontWeight: 600,
					fontSize: 54,
					lineHeight: 1.1,
					letterSpacing: '-0.02em',
					color: COLORS.white,
				}}
			>
				{HEADING.map((line, li) => (
					<div key={li} style={{display: 'flex', gap: '0 15px', overflow: 'hidden', padding: '0 4px 8px 0', marginBottom: -8}}>
						{line.map((w) => {
							const i = wi++;
							const k = prog(f, T.cardIn + 2 + i * 1.2, 8, ease.outCubic);
							return (
								<span
									key={w.w}
									style={{
										display: 'inline-block',
										transform: `translateY(${(1 - k) * 66}px)`,
										opacity: clamp(k * 1.5),
										color: w.hi ? COLORS.orange : COLORS.white,
										textShadow: w.hi ? textGlow(COLORS.orange, 0.5 + 0.4 * beat) : undefined,
									}}
								>
									{w.w}
								</span>
							);
						})}
					</div>
				))}
			</div>

			{/* separatore */}
			<div
				style={{
					position: 'absolute',
					left: 56,
					top: 312,
					width: (CARD.w - 112) * prog(f, NOTE_ROWS_AT - 4, 10, ease.outCubic),
					height: 1,
					background: `linear-gradient(90deg, ${alpha(COLORS.orange, 0.6)} 0%, ${alpha(COLORS.white, 0.12)} 100%)`,
				}}
			/>

			{/* il confronto */}
			<div style={{position: 'absolute', left: 56, right: 56, top: 336, display: 'flex', flexDirection: 'column', gap: 12}}>
				{ROWS.map((r, i) => {
					const k = prog(f, NOTE_ROWS_AT + i * 3, 9, ease.outCubic);
					const bar = prog(f, NOTE_ROWS_AT + 3 + i * 3, 14, ease.outQuart) * r.bar;
					const big = i === 2;
					const pulse = big ? beat : 0;
					return (
						<div
							key={i}
							style={{
								display: 'flex',
								alignItems: 'center',
								height: 56,
								gap: 26,
								opacity: clamp(k * 1.4),
								transform: `translateX(${(1 - k) * -30}px)`,
								fontFamily: FONTS.mono,
								fontSize: 28,
								whiteSpace: 'nowrap',
							}}
						>
							<div
								style={{
									width: 150,
									height: 50,
									flexShrink: 0,
									borderRadius: 12,
									border: `1.5px solid ${alpha(COLORS.orange, 0.7)}`,
									background: alpha(COLORS.orange, 0.1 + 0.08 * i),
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									color: COLORS.orangeHot,
									fontWeight: 700,
									letterSpacing: '0.04em',
								}}
							>
								{r.size}
							</div>
							<div style={{flex: 1, color: COLORS.white, fontWeight: 500}}>{r.text}</div>
							{/* barra: memoria necessaria (indicativa) */}
							<div style={{width: 200, height: 12, flexShrink: 0, borderRadius: 6, background: alpha(COLORS.white, 0.08), overflow: 'hidden', position: 'relative'}}>
								<div
									style={{
										position: 'absolute',
										left: 0,
										top: 0,
										bottom: 0,
										width: `${bar * 100}%`,
										borderRadius: 6,
										background: `linear-gradient(90deg, ${COLORS.orangeDeep} 0%, ${COLORS.orange} 60%, ${big ? COLORS.orangeHot : COLORS.orangeBright} 100%)`,
										boxShadow: `0 0 ${10 + 16 * pulse}px ${alpha(COLORS.orange, 0.6 + 0.4 * pulse)}`,
									}}
								/>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
};
