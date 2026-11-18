import React from 'react';
import {clamp, hash} from '../../../lib/math';
import {alpha, COLORS, FONTS} from '../../../theme';

/**
 * Componenti hardware stilizzati (flat-3D): package scuri estrusi, die arancione luminoso, pin, contatti.
 * Coordinate del piano del diagramma; tutte le intensità arrivano dal genitore (funzioni pure del frame).
 */

const PKG_BG = 'linear-gradient(155deg, #2B2724 0%, #1A1816 48%, #0E0D0C 100%)';
const PCB_BG = 'linear-gradient(160deg, #1E1A17 0%, #141210 60%, #0D0C0B 100%)';

/** Estrusione (spessore) + ombra portata + bagliore caldo. */
const depth = (glow: number, lift = 1): string =>
	[
		'inset 0 1px 0 rgba(255,255,255,0.09)',
		'inset 0 -1px 0 rgba(0,0,0,0.5)',
		`0 ${2 * lift}px 0 #0E0D0C`,
		`0 ${4 * lift}px 0 #0B0A09`,
		`0 ${7 * lift}px 0 #080707`,
		`0 ${18 * lift}px 34px rgba(0,0,0,0.75)`,
		`0 0 ${30 + 40 * glow}px ${alpha(COLORS.orange, 0.06 + 0.32 * glow)}`,
	].join(', ');

type Pop = {pop: number; on: number};

/** Contenitore posizionato col centro in (x, y), comparsa a scala con overshoot. */
const Place: React.FC<{x: number; y: number; w: number; h: number; pop: number; children: React.ReactNode; style?: React.CSSProperties}> = ({
	x,
	y,
	w,
	h,
	pop,
	children,
	style,
}) => (
	<div
		style={{
			position: 'absolute',
			left: x - w / 2,
			top: y - h / 2,
			width: w,
			height: h,
			opacity: clamp(pop * 1.6),
			transform: `translateY(${(1 - clamp(pop)) * 18}px) scale(${0.82 + 0.18 * pop})`,
			...style,
		}}
	>
		{children}
	</div>
);

/** Fila di pin su un lato del package. */
const Pins: React.FC<{side: 'top' | 'bottom' | 'left' | 'right'; inset: number; len?: number; color?: string}> = ({side, inset, len = 9, color = alpha(COLORS.gray, 0.42)}) => {
	const horiz = side === 'top' || side === 'bottom';
	const s: React.CSSProperties = {
		position: 'absolute',
		background: `repeating-linear-gradient(${horiz ? 90 : 0}deg, ${color} 0 4px, transparent 4px 11px)`,
	};
	if (horiz) Object.assign(s, {left: inset, right: inset, height: len, [side]: -len - 1});
	else Object.assign(s, {top: inset, bottom: inset, width: len, [side]: -len - 1});
	return <div style={s} />;
};

/** Etichetta mono del componente (+ riga secondaria opzionale). */
export const ChipLabel: React.FC<{x: number; y: number; text: string; sub?: React.ReactNode; on: number; hot?: number}> = ({x, y, text, sub, on, hot = 0}) => (
	<div
		style={{
			position: 'absolute',
			left: x - 260,
			top: y,
			width: 520,
			display: 'flex',
			flexDirection: 'column',
			alignItems: 'center',
			gap: 6,
			opacity: on,
			transform: `translateY(${(1 - on) * 10}px)`,
			fontFamily: FONTS.mono,
			textTransform: 'uppercase',
			letterSpacing: '0.14em',
		}}
	>
		<div style={{display: 'flex', alignItems: 'center', gap: 12, fontSize: 26, fontWeight: 500, color: COLORS.white}}>
			<span style={{width: 10, height: 10, borderRadius: 2, background: COLORS.orange, boxShadow: `0 0 ${8 + 14 * hot}px ${alpha(COLORS.orange, 0.5 + 0.5 * hot)}`}} />
			<span style={{textShadow: hot > 0.05 ? `0 0 ${18 * hot}px ${alpha(COLORS.orange, 0.6 * hot)}` : undefined}}>{text}</span>
		</div>
		{sub ? <div style={{fontSize: 24, color: COLORS.gray, letterSpacing: '0.06em'}}>{sub}</div> : null}
	</div>
);

// ------------------------------------------------------------------ SSD (M.2)

export const SSD: React.FC<{x: number; y: number; w: number; h: number; read: number; scan: number} & Pop> = ({x, y, w, h, pop, on, read, scan}) => {
	const nand = (i: number) => {
		// lettura: una banda luminosa scorre sui chip NAND
		const ph = (((scan * 2.2 - i * 0.55) % 1.1) + 1.1) % 1.1 - 0.3;
		const band = Math.exp(-(ph * ph) / 0.02);
		return clamp(read * (0.35 + 0.65 * band));
	};
	return (
		<Place x={x} y={y} w={w} h={h} pop={pop}>
			<div style={{position: 'absolute', inset: 0, borderRadius: 10, background: PCB_BG, border: `1px solid ${alpha(COLORS.white, 0.12)}`, boxShadow: depth(read * on, 0.8)}}>
				{/* foro della vite */}
				<div style={{position: 'absolute', left: -1, top: h / 2 - 13, width: 14, height: 26, borderRadius: '0 13px 13px 0', background: COLORS.black, borderRight: `1px solid ${alpha(COLORS.white, 0.12)}`}} />
				{/* contatti dorati (lato bus) */}
				<div style={{position: 'absolute', right: -1, top: 10, bottom: 10, width: 16, borderRadius: '0 6px 6px 0', background: `repeating-linear-gradient(0deg, ${alpha(COLORS.orangeDeep, 0.95)} 0 5px, transparent 5px 8px)`, opacity: 0.55 + 0.45 * read}} />
				{/* chip NAND + controller */}
				{[0, 1].map((i) => {
					const k = nand(i);
					return (
						<div
							key={i}
							style={{
								position: 'absolute',
								left: 30 + i * 100,
								top: 16,
								width: 88,
								height: h - 32,
								borderRadius: 5,
								background: PKG_BG,
								border: `1px solid ${alpha(COLORS.orange, 0.15 + 0.6 * k)}`,
								boxShadow: `inset 0 0 ${10 + 24 * k}px ${alpha(COLORS.orange, 0.12 + 0.55 * k)}, 0 0 ${18 * k}px ${alpha(COLORS.orange, 0.5 * k)}`,
							}}
						>
							{/* strisce dei dati */}
							<div style={{position: 'absolute', left: 10, right: 10, top: 12, bottom: 12, background: `repeating-linear-gradient(0deg, ${alpha(COLORS.orangeBright, 0.08 + 0.5 * k)} 0 2px, transparent 2px 7px)`, borderRadius: 2}} />
						</div>
					);
				})}
				<div
					style={{
						position: 'absolute',
						left: 236,
						top: h / 2 - 25,
						width: 50,
						height: 50,
						borderRadius: 5,
						background: PKG_BG,
						border: `1px solid ${alpha(COLORS.orange, 0.2 + 0.5 * read)}`,
						boxShadow: `inset 0 0 ${8 + 16 * read}px ${alpha(COLORS.orange, 0.15 + 0.5 * read)}`,
					}}
				>
					<div style={{position: 'absolute', inset: 14, borderRadius: 3, background: alpha(COLORS.orange, 0.2 + 0.7 * read), boxShadow: `0 0 ${14 * read}px ${alpha(COLORS.orangeBright, 0.8 * read)}`}} />
				</div>
			</div>
		</Place>
	);
};

// ------------------------------------------------------------------ RAM (2 moduli)

export const RAM: React.FC<{x: number; y: number; w: number; h: number; usedGB: number; access: number} & Pop> = ({x, y, w, h, pop, on, usedGB, access}) => {
	const stickH = (h - 14) / 2;
	return (
		<Place x={x} y={y} w={w} h={h} pop={pop}>
			{[0, 1].map((s) => (
				<div
					key={s}
					style={{
						position: 'absolute',
						left: s * 8,
						right: (1 - s) * 8,
						top: s * (stickH + 14),
						height: stickH,
						borderRadius: 6,
						background: PCB_BG,
						border: `1px solid ${alpha(COLORS.white, 0.12)}`,
						boxShadow: depth(0.25 * on + 0.4 * access, 0.7),
					}}
				>
					{/* contatti */}
					<div style={{position: 'absolute', left: 16, right: 16, bottom: 3, height: 7, background: `repeating-linear-gradient(90deg, ${alpha(COLORS.orangeDeep, 0.9)} 0 4px, transparent 4px 7px)`, opacity: 0.6}} />
					{Array.from({length: 8}, (_, i) => {
						const gi = s * 8 + i;
						const fill = clamp(usedGB - gi);
						const sys = gi < 1;
						const blink = access * (0.5 + 0.5 * Math.sin(gi * 2.3 + access * 0)) * (hash(gi, 3) > 0.4 ? 1 : 0.5);
						const k = clamp(fill * (sys ? 0.35 : 1));
						return (
							<div
								key={i}
								style={{
									position: 'absolute',
									left: 14 + i * ((w - 8 - 28) / 8),
									top: 7,
									width: (w - 8 - 28) / 8 - 6,
									height: stickH - 20,
									borderRadius: 3,
									background: PKG_BG,
									border: `1px solid ${alpha(sys ? COLORS.gray : COLORS.orange, 0.14 + 0.55 * k)}`,
									overflow: 'hidden',
								}}
							>
								<div
									style={{
										position: 'absolute',
										left: 0,
										right: 0,
										bottom: 0,
										height: `${fill * 100}%`,
										background: sys
											? alpha(COLORS.gray, 0.32)
											: `linear-gradient(0deg, ${alpha(COLORS.orange, 0.55 + 0.3 * blink)} 0%, ${alpha(COLORS.orangeBright, 0.85 + 0.15 * blink)} 100%)`,
										boxShadow: sys ? undefined : `0 0 14px ${alpha(COLORS.orangeBright, 0.7 * k)}`,
									}}
								/>
							</div>
						);
					})}
				</div>
			))}
		</Place>
	);
};

// ------------------------------------------------------------------ CPU

export const CPU: React.FC<{x: number; y: number; w: number; h: number; cores: number[]; heat: number} & Pop> = ({x, y, w, h, pop, on, cores, heat}) => {
	const die = 116;
	return (
		<Place x={x} y={y} w={w} h={h} pop={pop}>
			<Pins side="top" inset={20} />
			<Pins side="bottom" inset={20} />
			<Pins side="left" inset={20} />
			<Pins side="right" inset={20} />
			<div style={{position: 'absolute', inset: 0, borderRadius: 16, background: PKG_BG, border: `1px solid ${alpha(COLORS.white, 0.13)}`, boxShadow: depth(heat * on)}}>
				{/* pin 1 */}
				<div style={{position: 'absolute', left: 14, top: 14, width: 9, height: 9, borderRadius: 5, background: alpha(COLORS.gray, 0.45)}} />
				{/* die */}
				<div
					style={{
						position: 'absolute',
						left: (w - die) / 2,
						top: (h - die) / 2,
						width: die,
						height: die,
						borderRadius: 8,
						background: `radial-gradient(circle at 50% 50%, ${alpha(COLORS.orangeHot, 0.08 + 0.3 * heat)} 0%, ${alpha(COLORS.orange, 0.12 + 0.35 * heat)} 45%, ${alpha(COLORS.orangeDeep, 0.25)} 100%)`,
						border: `1px solid ${alpha(COLORS.orange, 0.3 + 0.6 * heat)}`,
						boxShadow: `0 0 ${16 + 40 * heat}px ${alpha(COLORS.orange, 0.15 + 0.5 * heat)}, inset 0 0 18px rgba(0,0,0,0.6)`,
						display: 'grid',
						gridTemplateColumns: 'repeat(2, 1fr)',
						gridTemplateRows: 'repeat(4, 1fr)',
						gap: 6,
						padding: 10,
					}}
				>
					{cores.map((c, i) => (
						<div
							key={i}
							style={{
								borderRadius: 3,
								background: alpha(c > 0.5 ? COLORS.orangeHot : COLORS.orangeBright, 0.12 + 0.85 * c),
								boxShadow: c > 0.05 ? `0 0 ${12 * c}px ${alpha(COLORS.orangeBright, 0.8 * c)}` : undefined,
							}}
						/>
					))}
				</div>
			</div>
		</Place>
	);
};

// ------------------------------------------------------------------ GPU (+ VRAM)

export const GPU_COLS = 12;
export const GPU_ROWS = 8;

export const GPU: React.FC<{x: number; y: number; w: number; h: number; cell: (c: number, r: number) => number; heat: number; vram: number} & Pop> = ({
	x,
	y,
	w,
	h,
	pop,
	on,
	cell,
	heat,
	vram,
}) => {
	const dieW = 128;
	const dieH = 96;
	const cw = (dieW - 16 - (GPU_COLS - 1) * 2) / GPU_COLS;
	const ch = (dieH - 16 - (GPU_ROWS - 1) * 2) / GPU_ROWS;
	return (
		<Place x={x} y={y} w={w} h={h} pop={pop}>
			<Pins side="top" inset={26} />
			<Pins side="bottom" inset={26} />
			<div style={{position: 'absolute', inset: 0, borderRadius: 16, background: PCB_BG, border: `1px solid ${alpha(COLORS.white, 0.13)}`, boxShadow: depth(heat * on)}}>
				{/* VRAM: 2 chip per lato, si riempiono durante il caricamento */}
				{[0, 1, 2, 3].map((i) => {
					const left = i < 2;
					const fill = clamp(vram * 4 - (i % 2 ? 2 : 0) - (left ? 0 : 1));
					const k = clamp(fill + 0.3 * heat * fill);
					return (
						<div
							key={i}
							style={{
								position: 'absolute',
								left: left ? 12 : undefined,
								right: left ? undefined : 12,
								top: i % 2 ? h / 2 + 6 : h / 2 - 6 - 60,
								width: 30,
								height: 60,
								borderRadius: 4,
								background: PKG_BG,
								border: `1px solid ${alpha(COLORS.orange, 0.15 + 0.5 * k)}`,
								overflow: 'hidden',
							}}
						>
							<div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: `${fill * 100}%`, background: `linear-gradient(0deg, ${alpha(COLORS.orange, 0.5)} 0%, ${alpha(COLORS.orangeBright, 0.9)} 100%)`, boxShadow: `0 0 12px ${alpha(COLORS.orangeBright, 0.6 * k)}`}} />
						</div>
					);
				})}
				{/* die con la griglia dei core (calcolo parallelo) */}
				<div
					style={{
						position: 'absolute',
						left: (w - dieW) / 2,
						top: (h - dieH) / 2,
						width: dieW,
						height: dieH,
						borderRadius: 7,
						background: `radial-gradient(circle at 50% 50%, ${alpha(COLORS.orange, 0.1 + 0.3 * heat)} 0%, ${alpha(COLORS.orangeDeep, 0.22)} 100%)`,
						border: `1px solid ${alpha(COLORS.orange, 0.3 + 0.6 * heat)}`,
						boxShadow: `0 0 ${16 + 46 * heat}px ${alpha(COLORS.orange, 0.15 + 0.55 * heat)}, inset 0 0 14px rgba(0,0,0,0.6)`,
					}}
				>
					{Array.from({length: GPU_COLS * GPU_ROWS}, (_, i) => {
						const c = i % GPU_COLS;
						const r = Math.floor(i / GPU_COLS);
						const v = cell(c, r);
						return (
							<div
								key={i}
								style={{
									position: 'absolute',
									left: 8 + c * (cw + 2),
									top: 8 + r * (ch + 2),
									width: cw,
									height: ch,
									borderRadius: 1.5,
									background: v > 0.6 ? alpha(COLORS.orangeHot, 0.5 + 0.5 * v) : alpha(COLORS.orangeBright, 0.1 + 0.8 * v),
								}}
							/>
						);
					})}
				</div>
			</div>
		</Place>
	);
};
