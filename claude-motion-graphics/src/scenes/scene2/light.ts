import {drawGlow, glowSprite, withAlpha} from '../../lib/canvas';
import {CODE_METRICS} from '../../lib/code';
import {TAU, bezier2, clamp, ease, hash, hit, lerp} from '../../lib/math';
import {COLORS} from '../../theme';
import {CELLS, CW, GUTTERS, HUB, ORIGIN, PROMPT_SCALE, ROWS, cursorAt, lastKeyBefore, rowY} from './layout';
import {sparkState} from './spark';
import {T} from './timing';

const M = CODE_METRICS;

/** Scintilla del flusso spark → finestra: arriva sulla sua cella nell'istante in cui il fronte la risolve. */
type Mote = {tx: number; ty: number; start: number; dur: number; side: number; size: number};

const STREAM: readonly Mote[] = Array.from({length: 130}, (_, i) => {
	const cell = CELLS[Math.floor(hash(i, 41) * CELLS.length) % CELLS.length];
	let dur = 9 + hash(i, 42) * 8;
	let start = cell.e - dur;
	if (start < T.submit) {
		// le prime partono tutte insieme sul colpo dell'INVIO
		start = T.submit + hash(i, 43) * 1.2;
		dur = cell.e - start;
	}
	return {tx: ORIGIN.x + cell.cx, ty: ORIGIN.y + cell.cy, start, dur, side: hash(i, 44) * 2 - 1, size: 1.5 + hash(i, 45) * 2.2};
});

/** Braci che schizzano dallo spark sull'INVIO. */
const EMBERS = Array.from({length: 30}, (_, i) => ({
	ang: hash(i, 51) * TAU,
	dist: 90 + hash(i, 52) * 230,
	life: 9 + hash(i, 53) * 9,
	size: 1.4 + hash(i, 54) * 2,
}));

const ring = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, width: number, a: number): void => {
	if (a <= 0.004) return;
	ctx.beginPath();
	ctx.arc(x, y, r, 0, TAU);
	ctx.strokeStyle = withAlpha(COLORS.orange, a * 0.3);
	ctx.lineWidth = width * 5;
	ctx.stroke();
	ctx.strokeStyle = withAlpha(COLORS.orangeHot, a);
	ctx.lineWidth = width;
	ctx.stroke();
};

/** Sprite radiale stirato: fasci, scie e barre di luce senza blur. */
const stretched = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, a: number, hot = false): void => {
	if (a <= 0.004) return;
	ctx.globalAlpha = Math.min(1, a);
	ctx.drawImage(glowSprite(COLORS.orange, hot ? '#FFFFFF' : COLORS.orangeHot), x - w / 2, y - h / 2, w, h);
	ctx.globalAlpha = 1;
};

/**
 * Livello di luce additiva della scena (coordinate di scena), funzione pura del frame:
 * scintille dei tasti, anelli d'urto, fascio e flusso dell'INVIO, fronti luminosi delle righe.
 */
export const drawLight = (ctx: CanvasRenderingContext2D, frame: number): void => {
	ctx.globalCompositeOperation = 'lighter';

	// ── atterraggio dello spark: anello sul beat
	{
		const u = (frame - T.land) / 13;
		if (u >= 0 && u < 1) {
			const s = sparkState(frame);
			ring(ctx, s.x, s.y, 80 + 170 * ease.outCubic(u), lerp(5, 1, u), 0.55 * Math.pow(1 - u, 2));
		}
	}

	// ── battitura: una scintilla sul carattere appena scritto
	if (frame >= T.typeStart && frame < T.submit) {
		const flick = Math.exp(-(frame - lastKeyBefore(frame)) / 1.5);
		const c = cursorAt(frame);
		const x = ORIGIN.x + c.cx - CW * c.scale * 0.8;
		const y = ORIGIN.y + c.cy;
		drawGlow(ctx, x, y, 9 * c.scale * flick, COLORS.orange, 0.55 * flick, COLORS.orangeHot);
		stretched(ctx, x, y, 150 * c.scale * flick, 26 * c.scale, 0.28 * flick);
	}

	if (frame < T.submit) return;
	const t = frame - T.submit;

	// ── INVIO: anelli d'urto + fascio verticale spark → campo del prompt
	{
		const u = t / 17;
		if (u < 1) ring(ctx, HUB.x, HUB.y, 86 + 300 * ease.outQuart(u), lerp(7, 1, u), 0.85 * Math.pow(1 - u, 2));
		const u2 = (t - 3) / 17;
		if (u2 >= 0 && u2 < 1) ring(ctx, HUB.x, HUB.y, 70 + 210 * ease.outQuart(u2), lerp(4, 1, u2), 0.45 * Math.pow(1 - u2, 2));
		const beam = hit(frame, T.submit, 7);
		stretched(ctx, HUB.x, HUB.y + 250, 150 * (0.5 + beam), 760, 0.75 * beam);
		stretched(ctx, HUB.x, HUB.y, 520 * beam, 520 * beam, 0.6 * beam, true);
	}

	// ── braci
	for (const e of EMBERS) {
		const u = t / e.life;
		if (u >= 1) continue;
		const k = ease.outCubic(u);
		for (let j = 0; j < 3; j++) {
			const kk = Math.max(0, k - j * 0.035);
			const r = 60 + e.dist * kk;
			drawGlow(ctx, HUB.x + Math.cos(e.ang) * r, HUB.y + Math.sin(e.ang) * r + 40 * u * u, e.size * (1 - j * 0.25), COLORS.orange, Math.pow(1 - u, 1.5) * (1 - j * 0.3), COLORS.orangeHot);
		}
	}

	// ── flusso di luce: scintille che scendono dallo spark e "scrivono" il codice
	for (const m of STREAM) {
		const u = (frame - m.start) / m.dur;
		if (u < 0 || u > 1.12) continue;
		if (u > 1) {
			// arrivo: piccolo lampo sulla cella
			drawGlow(ctx, m.tx, m.ty, m.size * 3.2 * (1.12 - u) * 8, COLORS.orange, 0.7, '#FFFFFF');
			continue;
		}
		const ctrl = {x: lerp(HUB.x, m.tx, 0.12) + m.side * 80, y: lerp(HUB.y, m.ty, 0.62)};
		const fadeIn = clamp(u * 6);
		for (let j = 0; j < 5; j++) {
			const uu = u - j * 0.035;
			if (uu <= 0) break;
			const p = bezier2(HUB, ctrl, {x: m.tx, y: m.ty}, Math.pow(uu, 1.45));
			drawGlow(ctx, p.x, p.y, m.size * (1 - j * 0.16), COLORS.orange, fadeIn * (0.95 - j * 0.19), j === 0 ? '#FFFFFF' : COLORS.orangeHot);
		}
	}

	// ── numeri di riga: lampo quando compaiono
	for (const g of GUTTERS) {
		const k = hit(frame, g.g, 4);
		if (k > 0.02) drawGlow(ctx, ORIGIN.x + g.cx, ORIGIN.y + g.cy, 10 * k, COLORS.orange, 0.6 * k, COLORS.orangeHot);
	}

	// ── fronte luminoso di ogni riga in scrittura (barra verticale + scia lungo la direzione del moto)
	for (const r of ROWS) {
		if (r.cols === 0 || frame < r.start - 1 || frame > r.end + 3) continue;
		const col = clamp((frame - r.start) * T.sweep + 1, 0, r.cols);
		const x = ORIGIN.x + M.padX + (M.gutterChars + r.indent + col) * CW;
		const y = ORIGIN.y + rowY(r.index);
		const fade = clamp(frame - r.start + 1) * (frame > r.end ? 1 - (frame - r.end) / 3 : 1);
		stretched(ctx, x - 70, y, 230, 46, 0.5 * fade);
		stretched(ctx, x, y, 16, 64, 0.95 * fade, true);
		drawGlow(ctx, x, y, 5.5, COLORS.orange, fade, '#FFFFFF');
	}
};

/** Usato dal prompt più grande: scala dei bagliori dei tasti. */
export const PROMPT_GLOW = PROMPT_SCALE;
