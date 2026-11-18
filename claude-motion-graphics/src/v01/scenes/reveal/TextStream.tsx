import React from 'react';
import {FrameCanvas} from '../../../components/FrameCanvas';
import {drawGlow, withAlpha} from '../../../lib/canvas';
import {clamp, ease, hit, prog, TAU} from '../../../lib/math';
import {COLORS} from '../../../theme';
import {ARM_R, ARMS, armAngle, DUST, FRAGS, LAYOUT, R, SWIRL} from './data';

/**
 * Flusso di ADDESTRAMENTO: frammenti di testo (illustrativi) che scorrono in 7 "fiumi" a spirale dentro la rete.
 * Profondità di campo: i vicini sono grandi e sfocati e si mettono a fuoco avvicinandosi; vicino al centro
 * si tingono d'arancio e vengono assorbiti (scintilla). Sprite di testo pre-renderizzati in cache.
 */
const MONO = "'JetBrains Mono', 'DejaVu Sans Mono', monospace";
const SANS = "'Inter', system-ui, sans-serif";
const W = COLORS.white;
const O = COLORS.orangeBright;

const cache = new Map<string, HTMLCanvasElement>();
const sprite = (text: string, mono: boolean, px: number, color: string, blur: number): HTMLCanvasElement => {
	const key = `${text}|${mono ? 1 : 0}|${px}|${color}|${blur}`;
	const cached = cache.get(key);
	if (cached) return cached;
	const font = `500 ${px}px ${mono ? MONO : SANS}`;
	const c = document.createElement('canvas');
	const g = c.getContext('2d')!;
	g.font = font;
	const w = g.measureText(text).width;
	const pad = Math.ceil(blur * 2.5 + 4);
	c.width = Math.ceil(w + pad * 2);
	c.height = Math.ceil(px * 1.35 + pad * 2);
	g.font = font;
	g.textBaseline = 'middle';
	g.fillStyle = color;
	if (blur > 0) g.filter = `blur(${blur}px)`;
	g.fillText(text, pad, c.height / 2);
	// in cache solo a font caricati (altrimenti resterebbe il font di riserva)
	if (document.fonts.check(font)) cache.set(key, c);
	return c;
};

const put = (ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, y: number, k: number, rot: number, a: number): void => {
	if (a <= 0.004) return;
	ctx.globalAlpha = Math.min(1, a);
	const c = Math.cos(rot) * k;
	const s = Math.sin(rot) * k;
	ctx.setTransform(c, s, -s, c, x, y);
	ctx.drawImage(img, -img.width / 2, -img.height / 2);
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.globalAlpha = 1;
};

/** Progresso effettivo nella spirale: dopo `condense` tutto viene risucchiato entro il titolo. */
const flowT = (f: number, birth: number, life: number): number => {
	const t = (f - birth) / life;
	if (t <= 0) return t;
	const suck = prog(f, R.condense, R.title - R.condense, ease.inCubic);
	return t + (1 - t) * suck;
};

/** Posizione sulla spirale (ellisse verticale: il reel è alto). */
const spiral = (cx: number, cy: number, a0: number, R0: number, swirl: number, t: number, core: number) => {
	const e = ease.inQuad(clamp(t));
	const r = R0 * (1 - e) + core * (1 - 0.5 * e);
	const th = a0 + swirl * t * t;
	return {x: cx + Math.cos(th) * r, y: cy + Math.sin(th) * r * 1.3};
};

/** Attenuazione nelle zone riservate: etichetta in alto e fascia dei sottotitoli. */
const safeFade = (x: number, y: number): number => {
	const label = clamp(1 - Math.abs(x - 540) / 420) > 0 && y > LAYOUT.labelY - 70 && y < LAYOUT.labelY + 70 ? 0.15 : 1;
	const subs = y > 1270 && y < 1510 ? 0.35 : 1;
	return label * subs;
};

/** Rotazione lungo il moto, sempre leggibile (mai capovolta), smorzata. */
const flowRot = (dx: number, dy: number, k: number): number => {
	let a = Math.atan2(dy, dx);
	if (a > Math.PI / 2) a -= Math.PI;
	if (a < -Math.PI / 2) a += Math.PI;
	return a * k;
};

export const TextStream: React.FC<{f: number; cx: number; cy: number; netScale: number}> = ({f, cx, cy, netScale}) => {
	const draw = (ctx: CanvasRenderingContext2D): void => {
		if (f > R.title + 2) return;
		const core = 34 * netScale;
		const live = 1 - prog(f, R.condense, R.title - R.condense, ease.inCubic);

		ctx.globalCompositeOperation = 'lighter';
		// punto di luce del taglio da cui nasce tutto
		const born = hit(f, 0, 12);
		if (born > 0.01) {
			drawGlow(ctx, 540, 760, 40 + 50 * (1 - born), COLORS.orange, born, COLORS.orangeHot);
			drawGlow(ctx, 540, 760, 12, COLORS.orangeHot, born, COLORS.white);
		}

		// i 7 fiumi: scie luminose a spirale con trattini che scorrono verso il centro
		const lanes = prog(f, 0, 18) * live;
		if (lanes > 0.01) {
			for (let k = 0; k < ARMS; k++) {
				const a0 = armAngle(k);
				const n = 40;
				ctx.lineWidth = 2;
				ctx.strokeStyle = withAlpha(COLORS.orange, 0.13 * lanes);
				ctx.beginPath();
				for (let j = 0; j <= n; j++) {
					const p = spiral(cx, cy, a0, ARM_R, SWIRL, j / n, core);
					if (j === 0) ctx.moveTo(p.x, p.y);
					else ctx.lineTo(p.x, p.y);
				}
				ctx.stroke();
				// impulsi lungo il fiume
				for (let m = 0; m < 6; m++) {
					const t = ((f / 30 + m / 6 + k * 0.13) % 1 + 1) % 1;
					const p = spiral(cx, cy, a0, ARM_R, SWIRL, t, core);
					drawGlow(ctx, p.x, p.y, 3 + 4 * t, COLORS.orange, 0.5 * lanes * Math.sin(Math.PI * t), COLORS.orangeHot);
				}
			}
		}

		// polvere di caratteri
		for (let i = 0; i < DUST.length; i++) {
			const d = DUST[i];
			const t = flowT(f, d.birth, d.life);
			if (t <= 0 || t >= 1) continue;
			const p = spiral(cx, cy, d.a0, d.R0, d.swirl, t, core);
			const a = prog(t, 0, 0.15) * (1 - prog(t, 0.8, 0.2)) * 0.5 * safeFade(p.x, p.y);
			put(ctx, sprite(d.ch, true, 26, t > 0.55 ? O : W, 0), p.x, p.y, (d.size / 26) * (0.45 + 0.55 * (1 - t)), 0, a);
		}

		// frammenti: dal lontano al vicino
		for (const layer of [2, 1, 0] as const) {
			for (let i = 0; i < FRAGS.length; i++) {
				const q = FRAGS[i];
				if (q.layer !== layer) continue;
				const t = flowT(f, q.birth, q.life);
				if (t <= 0 || t >= 1) continue;
				const p = spiral(cx, cy, q.a0, q.R0, q.swirl, t, core);
				const p2 = spiral(cx, cy, q.a0, q.R0, q.swirl, t + 0.02, core);
				const rot = flowRot(p2.x - p.x, p2.y - p.y, layer === 1 ? 0.45 : 0.7);
				const e = ease.inQuad(t);
				// prospettiva: si rimpiccioliscono entrando nella rete
				const k = Math.max(0.05, layer === 0 ? 1.15 - 0.95 * ease.inCubic(t) - 0.2 * t : 1 - 0.8 * e);
				const px = Math.round(q.size);
				const fin = prog(t, 0, layer === 0 ? 0.1 : 0.14);
				const fout = 1 - prog(t, 0.8, 0.2);
				const base = layer === 2 ? 0.3 : layer === 1 ? 0.85 : 0.62;
				const a = fin * fout * base * safeFade(p.x, p.y);
				const ok = q.fb ? 1 : prog(t, 0.42, 0.4);
				const col = q.fb ? COLORS.orangeHot : W;
				const colIn = q.fb ? COLORS.orangeHot : O;
				ctx.globalCompositeOperation = 'lighter';
				// scia di movimento (copie fantasma lungo il percorso)
				if (layer !== 2) {
					for (let g = 1; g <= 3; g++) {
						const pg = spiral(cx, cy, q.a0, q.R0, q.swirl, t - g * 0.022, core);
						put(ctx, sprite(q.text, q.mono, px, colIn, layer === 0 ? 9 : 2), pg.x, pg.y, k * (1 + 0.03 * g), rot, (a * 0.16) / g);
					}
				}
				if (layer === 0) {
					// messa a fuoco: sfocato lontano dalla rete, nitido avvicinandosi
					const focus = prog(t, 0.25, 0.45, ease.inOutSine);
					put(ctx, sprite(q.text, q.mono, px, W, 9), p.x, p.y, k, rot, a * (1 - focus));
					put(ctx, sprite(q.text, q.mono, px, W, 0), p.x, p.y, k, rot, a * focus * (1 - ok));
					put(ctx, sprite(q.text, q.mono, px, O, 0), p.x, p.y, k, rot, a * focus * ok);
				} else {
					const soft = layer === 2 ? 1 : 0;
					put(ctx, sprite(q.text, q.mono, px, col, soft), p.x, p.y, k, rot, a * (1 - ok));
					put(ctx, sprite(q.text, q.mono, px, colIn, soft), p.x, p.y, k, rot, a * ok);
				}
				// scintilla di assorbimento
				if (t > 0.84) {
					const s = prog(t, 0.84, 0.16);
					drawGlow(ctx, p.x, p.y, (layer === 2 ? 4 : 8) * (1 - s * 0.5), COLORS.orange, 0.75 * Math.sin(Math.PI * s), COLORS.orangeHot);
				}
			}
		}

		// condensazione: anello che si stringe sulla rete + nucleo che si carica
		const suck = prog(f, R.condense - 2, R.title - R.condense + 2, ease.inCubic);
		if (suck > 0 && f < R.title) {
			const rr = 560 * (1 - suck) + 50;
			ctx.strokeStyle = withAlpha(COLORS.orange, 0.22 * suck);
			ctx.lineWidth = 12;
			ctx.beginPath();
			ctx.ellipse(cx, cy, rr, rr * 1.1, 0, 0, TAU);
			ctx.stroke();
			ctx.strokeStyle = withAlpha(COLORS.orangeHot, 0.55 * suck);
			ctx.lineWidth = 2.5;
			ctx.stroke();
			drawGlow(ctx, cx, cy, 30 + 50 * suck, COLORS.orange, 0.7 * suck, COLORS.orangeHot);
		}
		// colpo del titolo: il nucleo esplode
		const h = hit(f, R.title, 8);
		if (h > 0.01) drawGlow(ctx, cx, cy, 60 + 70 * (1 - h), COLORS.orangeHot, h, COLORS.white);
		ctx.globalCompositeOperation = 'source-over';
	};
	return <FrameCanvas frame={f} additive draw={draw} />;
};
