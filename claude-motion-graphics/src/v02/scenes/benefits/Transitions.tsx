import React from 'react';
import {clamp, ease, hash, prog} from '../../../lib/math';
import {alpha, COLORS} from '../../../theme';
import {HEIGHT, WIDTH} from '../../../timeline';
import {IMPLODE, SLASH, TR} from './layout';

/* ------------------------------------------------------------------ WHIP (PRIVACY → OFFLINE) */

export type GroupFx = {transform: string; filter?: string; opacity: number};

/** Uscita a frusta verso sinistra, con anticipo verso destra e stiramento orizzontale (blur stirato = mosso). */
export const whipOutFx = (f: number): GroupFx => {
	const anticip = prog(f, TR.whipOut - 6, 6, ease.outCubic) * 22;
	const t = clamp((f - TR.whipOut) / (TR.whipOutEnd - TR.whipOut));
	const x = anticip * (1 - t) - 1350 * ease.inCubic(t);
	const v = t * t;
	return {
		transform: `translateX(${x}px) scaleX(${1 + 1.3 * v})`,
		filter: v > 0.02 ? `blur(${(10 * v).toFixed(2)}px)` : undefined,
		opacity: 1 - 0.4 * v,
	};
};

/** Entrata a frusta da destra: atterra (quasi ferma) sul cue. */
export const whipInFx = (f: number): GroupFx => {
	const p = prog(f, TR.whipIn, TR.whipInDur, ease.outExpo);
	const r = 1 - p;
	return {
		transform: `translateX(${1350 * r}px) scaleX(${1 + 1.3 * r * r})`,
		filter: r > 0.05 ? `blur(${(10 * r * r).toFixed(2)}px)` : undefined,
		opacity: 1,
	};
};

/** Strisce di luce orizzontali che accompagnano la frusta. */
export const WhipStreaks: React.FC<{f: number}> = ({f}) => {
	const k = clamp(1 - Math.abs(f - (TR.whipOutEnd - 1)) / 6);
	if (k <= 0.01) return null;
	return (
		<div style={{position: 'absolute', inset: 0, mixBlendMode: 'screen', pointerEvents: 'none'}}>
			{Array.from({length: 7}, (_, i) => {
				const y = 470 + hash(i, 41) * 680;
				const len = 500 + hash(i, 42) * 900;
				const x = WIDTH * (1.1 - ((f - 66 + hash(i, 43) * 6) / 12) * 2.2);
				const h = i === 0 ? 5 : 1.5 + hash(i, 44) * 2.5;
				return (
					<div
						key={i}
						style={{
							position: 'absolute',
							left: x - len / 2,
							top: (i === 0 ? 650 : y) - h / 2,
							width: len,
							height: h,
							borderRadius: h,
							background: `linear-gradient(90deg, ${alpha(COLORS.orange, 0)}, ${alpha(COLORS.orangeHot, (i === 0 ? 0.9 : 0.5) * k)}, ${alpha(COLORS.orange, 0)})`,
						}}
					/>
				);
			})}
			<div style={{position: 'absolute', left: 0, top: 650 - 260, width: WIDTH, height: 520, background: `radial-gradient(60% 50% at 50% 50%, ${alpha(COLORS.orangeHot, 0.22 * k)}, ${alpha(COLORS.orange, 0)})`, transform: 'scaleY(0.35)'}} />
		</div>
	);
};

/* ------------------------------------------------------------------ SPLIT (OFFLINE → CONTROLLO) */

const L = 3200;
const pt = (s: number, t: number) => ({x: SLASH.c.x + SLASH.d.x * t + SLASH.n.x * s, y: SLASH.c.y + SLASH.d.y * t + SLASH.n.y * s});
const poly = (pts: {x: number; y: number}[]): string => `polygon(${pts.map((p) => `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`).join(', ')})`;

/** Apertura della fenditura: 0 → oltre lo schermo. */
export const splitOpen = (f: number): number => 1500 * ease.inOutCubic(clamp((f - TR.split) / TR.splitDur));

/** Metà della scena OFFLINE da un lato della diagonale (side = +1 alto‑destra, −1 basso‑sinistra), spostata lungo la normale. */
export const halfFx = (f: number, side: 1 | -1): React.CSSProperties => {
	const s = splitOpen(f);
	const clip = poly([pt(0, -L), pt(0, L), pt(side * L, L), pt(side * L, -L)]);
	return {
		clipPath: clip,
		transform: `translate(${SLASH.n.x * s * side}px, ${SLASH.n.y * s * side}px)`,
		opacity: 1 - 0.6 * clamp(s / 900),
	};
};

/** La scena CONTROLLO è visibile solo dentro la fenditura finché questa non supera lo schermo. */
export const slitClip = (f: number): string | undefined => {
	const s = splitOpen(f);
	if (s >= 1499) return undefined;
	return poly([pt(-s, -L), pt(-s, L), pt(s, L), pt(s, -L)]);
};

const Beam: React.FC<{s: number; half: number; k: number; core?: number}> = ({s, half, k, core = 7}) => {
	const c = pt(s, 0);
	return (
		<div
			style={{
				position: 'absolute',
				left: c.x - half,
				top: c.y - 40,
				width: half * 2,
				height: 80,
				transform: 'rotate(45deg)',
				background: `linear-gradient(180deg, ${alpha(COLORS.orange, 0)} 0%, ${alpha(COLORS.orange, 0.3 * k)} 40%, ${alpha(COLORS.orangeHot, 0.95 * k)} ${50 - core / 2}%, ${alpha(COLORS.white, k)} 50%, ${alpha(COLORS.orangeHot, 0.95 * k)} ${50 + core / 2}%, ${alpha(COLORS.orange, 0.3 * k)} 60%, ${alpha(COLORS.orange, 0)} 100%)`,
			}}
		/>
	);
};

/** La barra del Wi‑Fi si allunga oltre lo schermo e diventa i due bordi luminosi della fenditura. */
export const SplitFX: React.FC<{f: number}> = ({f}) => {
	if (f < TR.slashExtend || f > TR.split + TR.splitDur + 2) return null;
	const ext = prog(f, TR.slashExtend, TR.split - TR.slashExtend, ease.inCubic);
	const half = SLASH.half + (2400 - SLASH.half) * ext;
	const s = splitOpen(f);
	const fade = 1 - clamp((s - 500) / 900);
	const slitLight = clamp(s / 200) * (1 - prog(f, 150, 8, ease.outCubic));
	return (
		<div style={{position: 'absolute', left: 0, top: 0, width: WIDTH, height: HEIGHT, mixBlendMode: 'screen', pointerEvents: 'none'}}>
			{s < 1 ? (
				<Beam s={0} half={half} k={0.75 + 0.25 * ext} />
			) : (
				<>
					{/* luce dentro la fenditura */}
					<div
						style={{
							position: 'absolute',
							left: SLASH.c.x - 2400,
							top: SLASH.c.y - s,
							width: 4800,
							height: s * 2,
							transform: 'rotate(45deg)',
							background: `linear-gradient(180deg, ${alpha(COLORS.orangeHot, 0.3 * slitLight)}, ${alpha(COLORS.orange, 0)} ${Math.min(50, 9000 / Math.max(1, s))}%, ${alpha(COLORS.orange, 0)} ${100 - Math.min(50, 9000 / Math.max(1, s))}%, ${alpha(COLORS.orangeHot, 0.3 * slitLight)})`,
						}}
					/>
					<Beam s={s} half={2400} k={fade} />
					<Beam s={-s} half={2400} k={fade} />
				</>
			)}
		</div>
	);
};

/* ------------------------------------------------------------------ IMPLOSIONE FINALE */

/** Fine scena: anticipo (leggero zoom avanti) poi tutto collassa in un punto di luce sul CutFlash di 720. */
export const implodeFx = (f: number): GroupFx => {
	const pre = prog(f, TR.implode - 4, 4, ease.outCubic) * (1 - prog(f, TR.implode, 3));
	const t = clamp((f - TR.implode) / (TR.implodeEnd - 1 - TR.implode));
	const s = (1 + 0.035 * pre) * (1 - 0.985 * ease.inExpo(t));
	return {
		transform: `translate(${IMPLODE.x}px, ${IMPLODE.y}px) scale(${s}) translate(${-IMPLODE.x}px, ${-IMPLODE.y}px)`,
		filter: t > 0.25 ? `blur(${(6 * (t - 0.25)).toFixed(2)}px)` : undefined,
		opacity: 1 - ease.inQuart(t),
	};
};

export const ImplodeFlare: React.FC<{f: number}> = ({f}) => {
	const k = prog(f, TR.implode + 6, 7, ease.inCubic);
	if (k <= 0.01) return null;
	const r = 30 + 120 * k;
	return (
		<div style={{position: 'absolute', inset: 0, mixBlendMode: 'screen', pointerEvents: 'none'}}>
			<div
				style={{
					position: 'absolute',
					left: IMPLODE.x - r,
					top: IMPLODE.y - r,
					width: r * 2,
					height: r * 2,
					borderRadius: '50%',
					background: `radial-gradient(closest-side, ${alpha(COLORS.white, 0.95 * k)}, ${alpha(COLORS.orangeHot, 0.6 * k)} 25%, ${alpha(COLORS.orange, 0.18 * k)} 60%, ${alpha(COLORS.orange, 0)})`,
				}}
			/>
			<div style={{position: 'absolute', left: -100, width: WIDTH + 200, top: IMPLODE.y - 3, height: 6, background: `linear-gradient(90deg, ${alpha(COLORS.orange, 0)}, ${alpha(COLORS.orangeHot, 0.8 * k)}, ${alpha(COLORS.orange, 0)})`, transform: `scaleX(${0.3 + 0.7 * k})`}} />
		</div>
	);
};
