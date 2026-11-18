import React, {useMemo} from 'react';
import {useCurrentFrame} from 'remotion';
import {FrameCanvas} from '../../components/FrameCanvas';
import {drawGlow, withAlpha} from '../../lib/canvas';
import {clamp, ease, hash, hit, lerp, prog, TAU} from '../../lib/math';
import {alpha, COLORS} from '../../theme';
import {WIDTH} from '../../timeline';
import {STAGE} from './stage';

/**
 * SCENA 4 · SHOT 4 — "EFFETTI LUMINOSI" (45 frame, assoluti 615..659).
 * Esplode dal punto di luce con cui chiude lo shot 3D: light painting (nastri di Lissajous),
 * raggi volumetrici, anello al neon, onde d'urto sui beat, bokeh e flare anamorfico.
 * Beat: 0 (esplosione) · 15 (impulso) · 30 (climax). Uscita 38..44.
 */

/** Fascia di lavoro: palco + margine sfumato (niente luce forte nella zona spark o caption). */
const BAND = {top: 384, height: 862};
const CX = STAGE.cx;
const CY = STAGE.cy - BAND.top;
const FADE = `linear-gradient(to bottom, transparent 0px, #000 70px, #000 ${BAND.height - 70}px, transparent ${BAND.height}px)`;

const BEATS = [0, 15, 30];
const EXIT = 38;

type Ribbon = {a: number; b: number; phase: number; rot: number; rx: number; ry: number; speed: number; color: string; core: string};
const RIBBONS: Ribbon[] = [
	{a: 3, b: 2, phase: 0.0, rot: 0.0, rx: 400, ry: 300, speed: 0.115, color: COLORS.orange, core: COLORS.orangeHot},
	{a: 2, b: 3, phase: 1.7, rot: 0.6, rx: 360, ry: 320, speed: 0.1, color: COLORS.orangeBright, core: COLORS.white},
	{a: 1, b: 2, phase: 3.1, rot: -0.5, rx: 420, ry: 250, speed: 0.13, color: COLORS.orange, core: COLORS.orangeHot},
	{a: 3, b: 4, phase: 4.4, rot: 1.2, rx: 300, ry: 300, speed: 0.09, color: COLORS.white, core: COLORS.white},
];

/** Ampiezza globale dei nastri: nascono dal punto (0) e respirano sui beat. */
const ribbonAmp = (f: number): number => {
	const grow = prog(f, 0, 12, ease.outExpo);
	const beat = 0.06 * hit(f, 15, 10) + 0.1 * hit(f, 30, 12);
	const exit = 1 + 0.5 * prog(f, EXIT, 7, ease.inCubic);
	return grow * (1 + beat) * exit;
};

/** Punto sul nastro i al parametro u (coordinate della fascia). */
const ribbonPoint = (r: Ribbon, u: number, amp: number): {x: number; y: number} => {
	const lx = Math.sin(r.a * u + r.phase) * r.rx * amp;
	const ly = Math.sin(r.b * u) * r.ry * amp;
	const c = Math.cos(r.rot);
	const s = Math.sin(r.rot);
	return {x: CX + lx * c - ly * s * 0.55, y: CY + lx * s * 0.55 + ly * c};
};

/** Parametro della testa: accelera verso il climax. */
const headParam = (r: Ribbon, f: number): number => r.phase + r.speed * (f + 9 * prog(f, 22, 14, ease.inOutCubic));

/** Disco di bokeh colorato: bordo morbido con anello leggermente più chiaro (ottica reale). */
const bokehTiles = new Map<string, HTMLCanvasElement>();
const bokehSprite = (color: string): HTMLCanvasElement => {
	const cached = bokehTiles.get(color);
	if (cached) return cached;
	const c = document.createElement('canvas');
	c.width = c.height = 128;
	const g = c.getContext('2d')!;
	const grad = g.createRadialGradient(64, 64, 0, 64, 64, 62);
	grad.addColorStop(0, withAlpha(color, 0.5));
	grad.addColorStop(0.78, withAlpha(color, 0.68));
	grad.addColorStop(0.9, withAlpha(color, 0.95));
	grad.addColorStop(1, withAlpha(color, 0));
	g.fillStyle = grad;
	g.beginPath();
	g.arc(64, 64, 62, 0, TAU);
	g.fill();
	bokehTiles.set(color, c);
	return c;
};

/** Cerchio "al neon": più passate concentriche (alone largo + tubo + anima chiara). */
const neonCircle = (ctx: CanvasRenderingContext2D, r: number, k: number, color: string): void => {
	if (k <= 0.003 || r <= 0) return;
	const passes: [number, string, number][] = [
		[34, color, 0.07],
		[16, color, 0.18],
		[7, COLORS.orangeBright, 0.55],
		[2.6, COLORS.white, 0.95],
	];
	for (const [w, c, a] of passes) {
		ctx.strokeStyle = withAlpha(c, Math.min(1, a * k));
		ctx.lineWidth = w;
		ctx.beginPath();
		ctx.arc(CX, CY, r, 0, TAU);
		ctx.stroke();
	}
};

/** Accensione del neon con sfarfallio deterministico (frame 2..8). */
const neonPower = (f: number): number => {
	if (f < 2) return 0;
	if (f < 9) return hash(f, 77) > 0.42 ? 0.6 + 0.4 * hash(f, 78) : 0.08;
	return 1;
};

export const Shot4Light: React.FC = () => {
	const f = useCurrentFrame();
	const out = prog(f, EXIT, 6, ease.inQuad); // 0 → 1 nell'uscita (buio pieno all'ultimo frame)
	const live = 1 - out;

	const bokeh = useMemo(
		() =>
			Array.from({length: 28}, (_, i) => ({
				x: 60 + hash(i, 1) * (WIDTH - 120),
				y: 70 + hash(i, 2) * (BAND.height - 140),
				z: 0.3 + hash(i, 3) * 0.7, // profondità: più vicino = più grande e veloce
				size: 18 + hash(i, 4) * 70,
				white: hash(i, 5) > 0.72,
				ph: hash(i, 6) * TAU,
			})),
		[],
	);

	// impulsi sui beat (0 = esplosione dal punto di luce dello shot 3D)
	const flash = 0.9 * hit(f, 0, 8) + 0.45 * hit(f, 15, 9) + 1.0 * hit(f, 30, 11);
	const raysK = (0.42 + 0.35 * prog(f, 0, 24, ease.inOutCubic) + 0.5 * hit(f, 15, 10) + 0.8 * hit(f, 30, 12)) * live;
	const raysRot = 18 + f * 1.1 + 40 * prog(f, 28, 16, ease.inCubic);
	const streak = (0.35 + 0.9 * hit(f, 0, 9) + 0.55 * hit(f, 15, 9) + 1.1 * hit(f, 30, 12)) * live;
	const coreGlow = (0.5 + 0.8 * flash) * live;

	const draw = (ctx: CanvasRenderingContext2D): void => {
		ctx.globalCompositeOperation = 'lighter';

		// 1 · bokeh in profondità (dietro a tutto, molto tenue)
		for (const b of bokeh) {
			const drift = f * (0.6 + 1.6 * b.z);
			const x = b.x + Math.sin(f / 26 + b.ph) * 14 * b.z;
			const yy = (((b.y - drift) % BAND.height) + BAND.height) % BAND.height;
			const tw = 0.6 + 0.4 * Math.sin(f / 9 + b.ph * 3);
			const a = (0.05 + 0.12 * b.z) * tw * prog(f, 0, 6) * (1 - 0.6 * out) * (1 + 0.8 * flash);
			const d = b.size * (0.7 + 0.6 * b.z) * (1 + 0.15 * flash);
			ctx.globalAlpha = Math.min(1, a);
			ctx.drawImage(bokehSprite(b.white ? COLORS.white : COLORS.orangeBright), x - d / 2, yy - d / 2, d, d);
		}
		ctx.globalAlpha = 1;

		// 2 · onde d'urto al neon sui beat
		BEATS.forEach((bt, i) => {
			const p = prog(f, bt, 20, ease.outCubic);
			if (f < bt || p >= 1) return;
			const r = lerp(40, i === 2 ? 520 : 430, p);
			neonCircle(ctx, r, (1 - p) * (i === 2 ? 0.9 : 0.6), COLORS.orange);
		});

		// 3 · anello al neon centrale (si accende con sfarfallio, pulsa sui beat, si espande in uscita)
		const pw = neonPower(f) * live;
		const ringR = 150 * (1 + 0.08 * hit(f, 15, 8) + 0.12 * hit(f, 30, 10)) * (1 + 1.2 * out);
		neonCircle(ctx, ringR, pw, COLORS.orange);

		// 4 · light painting: nastri con scia (anima continua + punti luminosi)
		const amp = ribbonAmp(f);
		const N = 64;
		const span = 2.4;
		for (const r of RIBBONS) {
			const head = headParam(r, f);
			const pts = Array.from({length: N}, (_, s) => ribbonPoint(r, head - (s / (N - 1)) * span, amp));
			// alone largo + anima sottile, segmento per segmento (la coda si assottiglia e svanisce)
			for (const [w, c, a] of [
				[24, r.color, 0.1],
				[10, r.color, 0.36],
				[3.6, r.core, 0.95],
			] as [number, string, number][]) {
				for (let s = 0; s < N - 1; s++) {
					const t = 1 - s / (N - 1);
					const k = Math.pow(t, 1.6) * live;
					if (k < 0.01) continue;
					ctx.strokeStyle = withAlpha(c, a * k);
					ctx.lineWidth = w * (0.35 + 0.65 * t);
					ctx.lineCap = 'round';
					ctx.beginPath();
					ctx.moveTo(pts[s].x, pts[s].y);
					ctx.lineTo(pts[s + 1].x, pts[s + 1].y);
					ctx.stroke();
				}
			}
			// scintille lungo la scia + testa abbagliante
			for (let s = 0; s < N; s += 6) {
				const t = 1 - s / (N - 1);
				drawGlow(ctx, pts[s].x, pts[s].y, 1.5 + 2.5 * t, r.color, 0.5 * t * live, r.core);
			}
			drawGlow(ctx, pts[0].x, pts[0].y, 9 + 6 * flash, r.color, 0.95 * live, COLORS.white);
		}

		// 5 · nucleo al centro
		drawGlow(ctx, CX, CY, 26 + 30 * flash, COLORS.orange, Math.min(1, coreGlow), COLORS.white);
		ctx.globalCompositeOperation = 'source-over';
	};

	// lampo del climax: velo radiale in tutta la fascia
	const veil = clamp(0.55 * hit(f, 30, 9) + 0.35 * hit(f, 0, 6)) * live;

	return (
		<div style={{position: 'absolute', left: 0, top: BAND.top, width: WIDTH, height: BAND.height, WebkitMaskImage: FADE, maskImage: FADE}}>
			{/* raggi volumetrici: conico rotante con maschera radiale */}
			<div
				style={{
					position: 'absolute',
					left: CX - 700,
					top: CY - 700,
					width: 1400,
					height: 1400,
					opacity: Math.min(1, raysK),
					background: `repeating-conic-gradient(from ${raysRot}deg at 50% 50%, ${alpha(COLORS.orange, 0)} 0deg, ${alpha(COLORS.orangeBright, 0.34)} 4deg, ${alpha(COLORS.orange, 0)} 9deg, ${alpha(COLORS.orange, 0)} 15deg, ${alpha(COLORS.orangeHot, 0.2)} 17deg, ${alpha(COLORS.orange, 0)} 21deg, ${alpha(COLORS.orange, 0)} 30deg)`,
					WebkitMaskImage: 'radial-gradient(closest-side, #000 0%, rgba(0,0,0,0.55) 30%, transparent 100%)',
					maskImage: 'radial-gradient(closest-side, #000 0%, rgba(0,0,0,0.55) 30%, transparent 100%)',
					filter: 'blur(3px)',
					mixBlendMode: 'screen',
				}}
			/>
			{/* alone caldo dietro al nucleo */}
			<div
				style={{
					position: 'absolute',
					left: CX - 480,
					top: CY - 400,
					width: 960,
					height: 800,
					background: `radial-gradient(closest-side, ${alpha(COLORS.orange, 0.32 * coreGlow)} 0%, ${alpha(COLORS.orangeDeep, 0.12 * coreGlow)} 45%, ${alpha(COLORS.orangeDeep, 0)} 100%)`,
				}}
			/>
			<FrameCanvas frame={f} width={WIDTH} height={BAND.height} additive draw={draw} />
			{/* flare anamorfico orizzontale */}
			<div
				style={{
					position: 'absolute',
					left: CX - 900,
					top: CY - (10 + 22 * Math.min(1.4, streak)) / 2,
					width: 1800,
					height: 10 + 22 * Math.min(1.4, streak),
					opacity: Math.min(1, streak),
					background: `radial-gradient(closest-side, ${alpha(COLORS.white, 0.95)} 0%, ${alpha(COLORS.orangeHot, 0.7)} 18%, ${alpha(COLORS.orange, 0.25)} 50%, ${alpha(COLORS.orange, 0)} 100%)`,
					mixBlendMode: 'screen',
				}}
			/>
			{/* lampo del climax */}
			{veil > 0.004 ? (
				<div
					style={{
						position: 'absolute',
						inset: 0,
						opacity: veil,
						background: `radial-gradient(60% 50% at 50% ${(CY / BAND.height) * 100}%, ${alpha(COLORS.orangeHot, 0.85)} 0%, ${alpha(COLORS.orange, 0.3)} 45%, ${alpha(COLORS.orange, 0)} 100%)`,
						mixBlendMode: 'screen',
					}}
				/>
			) : null}
		</div>
	);
};
