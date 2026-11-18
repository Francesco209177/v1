import React from 'react';
import {clamp, ease, hit, lerp, prog} from '../../../lib/math';
import {alpha, COLORS, FONTS, textGlow} from '../../../theme';
import {Keyword} from './Keyword';
import {CX, Y} from './layout';

/** Valori indicativi e plausibili (modelli quantizzati a 4 bit): dimensione del file e RAM consigliata. */
const MODELS = [
	{name: 'Modello 3B', spec: '≈ 2 GB · RAM 8 GB+', bars: 1},
	{name: 'Modello 8B', spec: '≈ 5 GB · RAM 16 GB+', bars: 2},
	{name: 'Modello 14B', spec: '≈ 9 GB · RAM 32 GB+', bars: 3},
] as const;
const SEL = 1;
const CARD = {w: 700, h: 120, gap: 16, extra: 58} as const;
const CLICK = 15; // clic sul beat (assoluto 675)
const BEAT2 = 30; // secondo accento (assoluto 690)

/** Altezze e posizioni delle card (la selezionata si espande, lo stack resta centrato sull'icona). */
const layout = (expand: number) => {
	const hs = MODELS.map((_, i) => CARD.h + (i === SEL ? CARD.extra * expand : 0));
	const total = hs.reduce((a, b) => a + b, 0) + CARD.gap * (MODELS.length - 1);
	let y = Y.icon - total / 2;
	return hs.map((h) => {
		const top = y;
		y += h + CARD.gap;
		return {top, h, mid: top + CARD.h / 2};
	});
};

const Cursor: React.FC<{x: number; y: number; press: number; opacity: number}> = ({x, y, press, opacity}) => (
	<svg
		width={44}
		height={56}
		viewBox="-2 -2 32 44"
		style={{
			position: 'absolute',
			left: x - 6,
			top: y - 4,
			opacity,
			transform: `scale(${1.25 - 0.22 * press})`,
			transformOrigin: '6px 4px',
			filter: `drop-shadow(0 0 10px ${alpha(COLORS.orange, 0.7)}) drop-shadow(0 6px 10px rgba(0,0,0,0.6))`,
		}}
	>
		<path d="M0 0 L0 33 L8.5 25.5 L14.5 39 L20.5 36.5 L14.5 23.5 L26 23.5 Z" fill={COLORS.white} stroke={COLORS.black} strokeWidth={2} strokeLinejoin="round" />
	</svg>
);

export const ControlIcon: React.FC<{f: number}> = ({f}) => {
	const expand = prog(f, CLICK, 10, ease.outBack);
	const sel = prog(f, CLICK, 4, ease.outCubic);
	const click = hit(f, CLICK, 12);
	const beat2 = hit(f, BEAT2, 10);
	const entry = hit(f, 0, 10);
	const L = layout(expand);
	// cursore: entra sulla prima card, scende sulla seconda, clic sul beat
	const move = prog(f, 6, 8, ease.inOutCubic);
	const curX = lerp(CX + 150, CX + 120, move) + (1 - prog(f, 0, 8, ease.outCubic)) * 120;
	const curY = lerp(L[0].mid + 8, L[1].mid + 8, move);
	const press = clamp(1 - Math.abs(f - CLICK) / 2.5);
	const hoverY = lerp(L[0].top, L[1].top, move);
	const hoverH = lerp(L[0].h, L[1].h, move);
	const ripple = prog(f, CLICK, 14, ease.outCubic);
	const x0 = CX - CARD.w / 2;

	return (
		<>
			{/* evidenziatore "hover" che scorre tra le card */}
			<div
				style={{
					position: 'absolute',
					left: x0 - 10,
					top: hoverY - 10,
					width: CARD.w + 20,
					height: hoverH + 20,
					borderRadius: 30,
					boxShadow: `0 0 0 2px ${alpha(COLORS.orangeBright, 0.35 * (1 - sel) * prog(f, 2, 6))}`,
				}}
			/>
			{MODELS.map((m, i) => {
				const p = prog(f, -3 + i * 2, 11, ease.outQuint);
				const isSel = i === SEL;
				const s = isSel ? sel : 0;
				const dim = isSel ? 0 : sel * 0.5;
				const pulse = isSel ? 0.6 * click + 0.5 * beat2 : 0;
				const {top, h} = L[i];
				const bump = isSel ? 1 + 0.035 * click : 1;
				return (
					<div
						key={m.name}
						style={{
							position: 'absolute',
							left: x0,
							top,
							width: CARD.w,
							height: h,
							borderRadius: 22,
							overflow: 'hidden',
							opacity: clamp(p * 1.4) * (1 - dim),
							transform: `translateY(${(1 - p) * (70 + i * 30)}px) scale(${(0.9 + 0.1 * p) * bump})`,
							background: `linear-gradient(160deg, ${isSel ? `rgba(60,34,24,${0.55 + 0.45 * s})` : COLORS.surface2}, ${COLORS.surface})`,
							boxShadow: [
								`inset 0 0 0 ${1.5 + 1.5 * s}px ${s > 0 ? alpha(COLORS.orangeBright, 0.25 + 0.65 * s) : COLORS.lineStrong}`,
								`0 0 ${30 + 50 * pulse}px ${alpha(COLORS.orange, 0.25 * s + 0.35 * pulse + 0.25 * entry)}`,
								'0 18px 40px rgba(0,0,0,0.5)',
							].join(', '),
						}}
					>
						{/* radio */}
						<div
							style={{
								position: 'absolute',
								left: 34,
								top: CARD.h / 2 - 15,
								width: 30,
								height: 30,
								borderRadius: 15,
								boxShadow: `inset 0 0 0 2.5px ${s > 0 ? COLORS.orangeBright : COLORS.grayDim}`,
							}}
						>
							<div style={{position: 'absolute', left: 7, top: 7, width: 16, height: 16, borderRadius: 8, background: COLORS.orangeHot, transform: `scale(${s})`, boxShadow: `0 0 12px ${COLORS.orange}`}} />
						</div>
						<div style={{position: 'absolute', left: 88, top: 17, fontFamily: FONTS.display, fontWeight: 600, fontSize: 42, lineHeight: '48px', color: COLORS.white}}>{m.name}</div>
						<div style={{position: 'absolute', left: 88, top: 70, fontFamily: FONTS.mono, fontSize: 25, lineHeight: '30px', color: COLORS.gray, letterSpacing: '0.02em'}}>{m.spec}</div>
						{/* indicatore di "peso" del modello */}
						<div style={{position: 'absolute', right: 36, top: CARD.h / 2 - 22, height: 44, display: 'flex', alignItems: 'flex-end', gap: 7}}>
							{[0, 1, 2].map((b) => {
								const on = b < m.bars;
								return (
									<div
										key={b}
										style={{
											width: 11,
											height: 18 + b * 13,
											borderRadius: 3,
											background: on ? (isSel ? COLORS.orangeBright : COLORS.orange) : COLORS.grayDark,
											boxShadow: on && isSel ? `0 0 ${10 + 16 * pulse}px ${alpha(COLORS.orange, 0.6)}` : undefined,
										}}
									/>
								);
							})}
						</div>
						{isSel ? <FitBadge f={f} /> : null}
					</div>
				);
			})}
			{/* onda del clic */}
			{ripple > 0 && ripple < 1 ? (
				<div
					style={{
						position: 'absolute',
						left: curX - 70 * ripple - 6,
						top: curY - 70 * ripple - 6,
						width: 140 * ripple + 12,
						height: 140 * ripple + 12,
						borderRadius: '50%',
						boxShadow: `0 0 0 ${3 * (1 - ripple) + 1}px ${alpha(COLORS.orangeHot, 0.9 * (1 - ripple))}`,
					}}
				/>
			) : null}
			<Cursor x={curX} y={curY} press={press} opacity={prog(f, 1, 5)} />
		</>
	);
};

/** Riga extra della card selezionata: spunta che si traccia + "ADATTO AL TUO HARDWARE". */
const FitBadge: React.FC<{f: number}> = ({f}) => {
	const check = prog(f, CLICK + 3, 6, ease.outCubic);
	const text = prog(f, CLICK + 5, 10, ease.outCubic);
	return (
		<div style={{position: 'absolute', left: 88, top: CARD.h + 2, height: 40, display: 'flex', alignItems: 'center', gap: 12, opacity: prog(f, CLICK + 2, 4)}}>
			<svg width={26} height={26} viewBox="0 0 26 26">
				<path d="M4 13.5 L10.5 20 L22 6.5" fill="none" stroke={COLORS.orangeHot} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - check} />
			</svg>
			<div
				style={{
					fontFamily: FONTS.mono,
					fontWeight: 500,
					fontSize: 24,
					letterSpacing: '0.12em',
					color: COLORS.orangeBright,
					textShadow: textGlow(COLORS.orange, 0.4),
					whiteSpace: 'nowrap',
					clipPath: `inset(0 ${(1 - text) * 100}% 0 0)`,
				}}
			>
				ADATTO AL TUO HARDWARE
			</div>
		</div>
	);
};

/** Sequenza 03 · CONTROLLO (f = frame relativo, 0 = assoluto 660). */
export const ControlSeq: React.FC<{f: number}> = ({f}) => (
	<>
		<div style={{position: 'absolute', inset: 0, transform: `translateY(${-f * 0.12}px)`}}>
			<ControlIcon f={f} />
		</div>
		<Keyword f={f} word="CONTROLLO" qualifier="scegli tu quale modello usare" highlight={['scegli', 'tu']} />
	</>
);
