import {tokenWidth} from '../../components/TokenChip';
import {V1_ANSWER_TOKENS, V1_CANDIDATES, V1_CUES, V1_SCENES, V1_TOKENS} from '../../timeline';

/**
 * PREDICT — dati, layout e scaletta (frame RELATIVI alla scena: 0 = assoluto 480).
 * Probabilità ILLUSTRATIVE: plausibili, non misurate su un modello reale.
 */
const S0 = V1_SCENES.predict.start;

export type Cand = {t: string; p: number};

/** Distribuzione del token successivo per ogni passo della risposta (il primo è sempre il vincitore). */
export const STEPS: Cand[][] = [
	V1_CANDIDATES.map((c) => ({t: c.t, p: c.p})),
	[{t: ' imparato', p: 0.48}, {t: ' letto', p: 0.19}, {t: ' studiato', p: 0.12}, {t: ' visto', p: 0.07}],
	[{t: ' dagli', p: 0.41}, {t: ' da', p: 0.27}, {t: ' leggendo', p: 0.13}, {t: ' molto', p: 0.06}],
	[{t: ' schemi', p: 0.44}, {t: ' esempi', p: 0.27}, {t: ' esseri', p: 0.09}, {t: ' errori', p: 0.06}],
	[{t: ' di', p: 0.57}, {t: ' presenti', p: 0.17}, {t: ' nei', p: 0.09}, {t: ' del', p: 0.05}],
	[{t: ' milioni', p: 0.46}, {t: ' tanti', p: 0.22}, {t: ' miliardi', p: 0.11}, {t: ' molti', p: 0.07}],
	[{t: ' di', p: 0.86}, {t: ' e', p: 0.04}, {t: ',', p: 0.03}, {t: ' nei', p: 0.02}],
	[{t: ' testi', p: 0.53}, {t: ' pagine', p: 0.18}, {t: ' libri', p: 0.11}, {t: ' parole', p: 0.08}],
	[{t: '.', p: 0.72}, {t: ',', p: 0.11}, {t: ' scritti', p: 0.07}, {t: ' e', p: 0.04}],
];
export const ANSWER = V1_ANSWER_TOKENS;
export const N = ANSWER.length;

/** Cue (relativi). */
export const C = {
	pick: V1_CUES.pick - S0, // 45 · scelto "Ho"
	loop: V1_CUES.loop - S0, // 120 · il ciclo accelera
	end: V1_SCENES.predict.length, // 210
};

/** Istante della scelta di ogni token: i primi due lenti (leggibili), poi uno ogni 7 frame. */
export const PICK = [C.pick, 90, C.loop, 127, 134, 141, 148, 155, 162];
const slow = (s: number) => s < 2;
export const LIFT = (s: number) => (slow(s) ? 3 : 1);
export const FLY = (s: number) => (slow(s) ? 12 : 6);
export const landAt = (s: number) => PICK[s] + LIFT(s) + FLY(s);
/** Il token scelto rientra nel contesto percorrendo l'anello. */
export const loopFrom = (s: number) => landAt(s) + (slow(s) ? 1 : 0);
export const loopDur = (s: number) => (s === 0 ? 10 : slow(s) ? 8 : 5);
export const appendAt = (s: number) => loopFrom(s) + loopDur(s);
/** Quando compare la distribuzione del passo s (dopo che il contesto è cambiato). */
export const SHOW = STEPS.map((_, s) => (s === 0 ? 2 : s === 1 ? appendAt(0) + 4 : s === 2 ? appendAt(1) + 1 : PICK[s - 1] + 2));
export const GROW = (s: number) => (s === 0 ? {stagger: 3, dur: 14} : s === 1 ? {stagger: 2, dur: 10} : {stagger: 0.6, dur: 3});
/** Nei passi veloci le percentuali compaiono già definitive (niente conteggio). */
export const FAST = (s: number) => s >= 2;

/** Uscita disegnata verso il lampo globale (690 = relativo 210). */
export const EXIT = 196;
/** Punto di luce dei tagli. */
export const HUB = {x: 540, y: 760};

/* ---------------- layout ---------------- */
export const CTX = {labelY: 272, y: 330, size: 24, gap: 5, right: 990, left: 80};
export const PANEL = {x: 110, w: 860, top: 424, bottom: 906, headerY: 470, divY: 506, row0: 558, rowH: 76, chipSize: 32, chipLeft: 146, trackX: 410, trackW: 420, pctRight: 936};
export const NOTE_Y = 944;
export const ANS = {x: 90, w: 900, top: 984, bottom: 1228, labelY: 1022, lineY: [1094, 1172], size: 44, gap: 12, breakAfter: 3};
/** Anello di retroazione: dalla risposta (destra) su fino al contesto. */
export const LOOP = {x: 1036, yAns: 1106, xAns: 990, yCtx: CTX.y, xCtx: 998, r: 26};

/* ---------------- geometria derivata ---------------- */
export const rowY = (i: number) => PANEL.row0 + i * PANEL.rowH;
export const chipCenterInRow = (t: string) => PANEL.chipLeft + tokenWidth(t, PANEL.chipSize) / 2;

/** Slot dei token della risposta: due righe centrate. */
export const ANSWER_SLOTS: {x: number; y: number}[] = (() => {
	const w = ANSWER.map((t) => tokenWidth(t, ANS.size));
	const lines = [ANSWER.slice(0, ANS.breakAfter + 1).map((_, i) => i), ANSWER.slice(ANS.breakAfter + 1).map((_, i) => i + ANS.breakAfter + 1)];
	const slots: {x: number; y: number}[] = [];
	lines.forEach((idx, li) => {
		const total = idx.reduce((n, i) => n + w[i], 0) + ANS.gap * (idx.length - 1);
		let x = 540 - total / 2;
		for (const i of idx) {
			slots[i] = {x: x + w[i] / 2, y: ANS.lineY[li]};
			x += w[i] + ANS.gap;
		}
	});
	return slots;
})();

/** Larghezza dei token del contesto (domanda + risposta reinserita). */
export const QUESTION = V1_TOKENS;
export const ctxW = (t: string) => tokenWidth(t, CTX.size);

/** Percorso dell'anello come polilinea (per gli impulsi luminosi): parte dalla risposta, arriva al contesto. */
export const LOOP_PTS: {x: number; y: number}[] = [
	{x: LOOP.xAns, y: LOOP.yAns},
	{x: LOOP.x, y: LOOP.yAns},
	{x: LOOP.x, y: LOOP.yCtx},
	{x: LOOP.xCtx, y: LOOP.yCtx},
];
export const pointOnLoop = (t: number): {x: number; y: number; dx: number; dy: number} => {
	const seg = LOOP_PTS.slice(1).map((p, i) => Math.hypot(p.x - LOOP_PTS[i].x, p.y - LOOP_PTS[i].y));
	const total = seg.reduce((a, b) => a + b, 0);
	let d = Math.max(0, Math.min(1, t)) * total;
	for (let i = 0; i < seg.length; i++) {
		if (d <= seg[i] || i === seg.length - 1) {
			const a = LOOP_PTS[i];
			const b = LOOP_PTS[i + 1];
			const k = seg[i] ? Math.min(1, d / seg[i]) : 0;
			return {x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, dx: (b.x - a.x) / (seg[i] || 1), dy: (b.y - a.y) / (seg[i] || 1)};
		}
		d -= seg[i];
	}
	return {...LOOP_PTS[LOOP_PTS.length - 1], dx: -1, dy: 0};
};

/** Numero di token già scelti (atterrati) al frame f. */
export const landedCount = (f: number): number => PICK.filter((_, s) => f >= landAt(s)).length;

/** Indice del passo la cui distribuzione è visibile al frame f. */
export const stepAt = (f: number): number => {
	let s = 0;
	for (let i = 0; i < SHOW.length; i++) if (f >= SHOW[i]) s = i;
	return s;
};
