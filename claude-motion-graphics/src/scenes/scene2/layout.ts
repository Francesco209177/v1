import {CODE_LINES, CODE_METRICS, PROMPT_TEXT, TOKEN_COLORS} from '../../lib/code';
import {clamp, ease, hash, prog} from '../../lib/math';
import {SPARK_CENTER, SPARK_VIEWBOX} from '../../lib/spark';
import {COLORS} from '../../theme';
import {SPARK_POSE, WINDOW_RECT} from '../../timeline';
import {KEY_TIMES, T, typedCount} from './timing';

/**
 * GEOMETRIA della scena 2. Tutte le coordinate dei glifi sono nel sistema dell'AREA CONTENUTO
 * della finestra (origine = angolo alto-sinistra sotto la title bar), in px, riferite al CENTRO
 * della cella. Le celle del codice usano le stesse metriche di <CodeBlock> (CODE_METRICS).
 */
const M = CODE_METRICS;
export const CW = M.charWidth;
export const LH = M.lineHeight;

/** Origine dell'area contenuto in coordinate di scena. */
export const ORIGIN = {x: WINDOW_RECT.x, y: WINDOW_RECT.y + M.titleBar} as const;

/** Mozzo dello spark nella posa da narratore (sorgente dei flussi di luce). */
export const HUB = {
	x: SPARK_POSE.ideaEnd.x + (SPARK_CENTER.x / SPARK_VIEWBOX - 0.5) * SPARK_POSE.ideaEnd.size,
	y: SPARK_POSE.ideaEnd.y + (SPARK_CENTER.y / SPARK_VIEWBOX - 0.5) * SPARK_POSE.ideaEnd.size,
} as const;

// ───────────────────────── campo del prompt ─────────────────────────

/** Il prompt è più grande del codice (38 px): è il protagonista della prima metà della scena. */
export const PROMPT_SCALE = 38 / M.fontSize;
const PCW = CW * PROMPT_SCALE;
const PLH = 50;
const BULLET_GAP = 16;

export const BOX = {x: 40, y: 150, w: 860, padX: 34, padY: 28, radius: 22} as const;
export const BULLET_TEXTS = ['formato verticale 9:16', 'particelle, forme, testi animati', 'musica elettronica'] as const;

/** Il prompt va a capo dopo "secondi". */
const BREAK = PROMPT_TEXT.indexOf(' sulla');

const textX0 = BOX.x + BOX.padX; // colonna del ">"
const bulletX0 = textX0 + 2 * PCW; // i punti elenco si allineano al testo del prompt
const promptCy = (line: number): number => BOX.y + BOX.padY + PLH * (line + 0.5);
const bulletCy = (k: number): number => BOX.y + BOX.padY + PLH * 2 + BULLET_GAP + LH * (k + 0.5);

/** Altezza del campo: cresce (verso il basso) a ogni istruzione aggiunta. */
export const boxHeight = (frame: number): number => {
	let h = BOX.padY * 2 + PLH * 2;
	T.bullets.forEach((b, k) => {
		h += (LH + (k === 0 ? BULLET_GAP : 0)) * prog(frame, b - 1, 8, ease.outQuint);
	});
	return h;
};

/** Glifo "sorgente": un carattere digitato dall'utente (prompt, ">" e punti elenco). */
export type Source = {
	ch: string;
	cx: number;
	cy: number;
	scale: number;
	color: string;
	at: number; // frame di comparsa
	mark: boolean; // ">" e "•": diventeranno numeri di riga
	line: number; // 0–1 prompt, 2–4 istruzioni
};

export const SOURCES: readonly Source[] = (() => {
	const out: Source[] = [];
	out.push({ch: '>', cx: textX0 + PCW / 2, cy: promptCy(0), scale: PROMPT_SCALE, color: COLORS.orange, at: T.boxIn + 1, mark: true, line: 0});
	for (let i = 0; i < PROMPT_TEXT.length; i++) {
		const ch = PROMPT_TEXT[i];
		if (ch === ' ') continue;
		const line = i > BREAK ? 1 : 0;
		const col = line === 0 ? i : i - BREAK - 1;
		out.push({ch, cx: textX0 + (2 + col + 0.5) * PCW, cy: promptCy(line), scale: PROMPT_SCALE, color: COLORS.white, at: KEY_TIMES[i], mark: false, line});
	}
	BULLET_TEXTS.forEach((text, k) => {
		const b = T.bullets[k];
		out.push({ch: '•', cx: bulletX0 + CW / 2, cy: bulletCy(k), scale: 1, color: COLORS.orange, at: b, mark: true, line: 2 + k});
		for (let i = 0; i < text.length; i++) {
			if (text[i] === ' ') continue;
			out.push({
				ch: text[i],
				cx: bulletX0 + (2 + i + 0.5) * CW,
				cy: bulletCy(k),
				scale: 1,
				color: COLORS.gray,
				at: b + 1 + (i / text.length) * (T.bulletLen - 1),
				mark: false,
				line: 2 + k,
			});
		}
	});
	return out;
})();

/** Posizione del cursore a blocco (centro cella) durante la battitura. */
export const cursorAt = (frame: number): {cx: number; cy: number; scale: number} => {
	for (let k = BULLET_TEXTS.length - 1; k >= 0; k--) {
		const b = T.bullets[k];
		if (frame >= b) {
			const len = BULLET_TEXTS[k].length;
			const n = frame < b + 1 ? 0 : clamp(Math.floor(((frame - b - 1) * len) / (T.bulletLen - 1)) + 1, 0, len);
			return {cx: bulletX0 + (2 + n + 0.5) * CW, cy: bulletCy(k), scale: 1};
		}
	}
	const n = typedCount(frame);
	const line = n > BREAK ? 1 : 0;
	const col = line === 0 ? n : n - BREAK - 1;
	return {cx: textX0 + (2 + col + 0.5) * PCW, cy: promptCy(line), scale: PROMPT_SCALE};
};

/** Frame dell'ultimo tasto premuto (prompt o istruzioni) prima di `frame`: fa "sfarfallare" lo spark. */
export const lastKeyBefore = (frame: number): number => {
	let last = -Infinity;
	for (const s of SOURCES) if (s.at <= frame && s.at > last) last = s.at;
	return last;
};

// ───────────────────────── griglia del codice ─────────────────────────

export type Row = {index: number; indent: number; cols: number; start: number; end: number};

/** Una riga si risolve da sinistra a destra a velocità costante; le righe partono in cascata dall'alto. */
export const ROWS: readonly Row[] = CODE_LINES.map((line, index) => {
	const text = line.map(([, s]) => s).join('');
	const indent = text.length - text.trimStart().length;
	const cols = text.length - indent;
	const start = T.rowT0 + T.rowStep * index;
	return {index, indent, cols, start, end: start + cols / T.sweep};
});

/** Cella di codice (un carattere non-spazio) con i suoi tempi: partenza, arrivo, risoluzione. */
export type Cell = {
	row: number;
	col: number;
	ch: string;
	color: string;
	cx: number;
	cy: number;
	e: number; // il fronte luminoso la risolve
	d: number; // decollo dal prompt
	a: number; // arrivo in griglia
	src: number; // indice in SOURCES del carattere da cui "nasce"
	primary: boolean; // è il glifo originale (gli altri sono cloni che si staccano in volo)
};

export const cellX = (col: number): number => M.padX + (M.gutterChars + col + 0.5) * CW;
export const rowY = (row: number): number => M.padY + (row + 0.5) * LH;

export const CELLS: readonly Cell[] = (() => {
	const raw: Omit<Cell, 'src' | 'primary' | 'd' | 'a'>[] = [];
	CODE_LINES.forEach((line, row) => {
		let col = 0;
		for (const [type, text] of line) {
			for (const ch of text) {
				if (ch !== ' ') {
					raw.push({row, col, ch, color: TOKEN_COLORS[type], cx: cellX(col), cy: rowY(row), e: ROWS[row].start + (col - ROWS[row].indent) / T.sweep});
				}
				col++;
			}
		}
	});
	// mappa che conserva l'ordine di lettura: il testo si "ri-impagina" senza incroci
	const textSources = SOURCES.map((s, i) => (s.mark ? -1 : i)).filter((i) => i >= 0);
	const K = textSources.length;
	const N = raw.length;
	let prev = -1;
	return raw.map((c, j) => {
		const src = textSources[Math.min(K - 1, Math.floor(((j + 0.5) * K) / N))];
		const primary = src !== prev;
		prev = src;
		const depart = T.submit + 0.5 + 0.5 * c.row + 1.5 * hash(j, 5);
		const flight = 9 + 4 * hash(j, 6) + 0.25 * c.row;
		const a = Math.min(depart + flight, c.e - 1.2 - 1.5 * hash(j, 7));
		return {...c, src, primary, d: Math.min(depart, a - 4), a};
	});
})();

/** Frame in cui l'ultima cella è risolta (fine del morph). */
export const LAST_RESOLVE = CELLS.reduce((m, c) => Math.max(m, c.e), 0);

/** Numero di riga: compare un attimo prima che la riga parta. Alcuni nascono da ">" e "•". */
export type Gutter = {row: number; text: string; cx: number; cy: number; g: number; mark: number; d: number; a: number};

export const GUTTERS: readonly Gutter[] = (() => {
	// riga di destinazione di ogni marcatore: quella dove atterra il primo carattere della sua riga sorgente
	const markRow = new Map<number, number>();
	SOURCES.forEach((s, i) => {
		if (!s.mark) return;
		const first = CELLS.find((c) => SOURCES[c.src].line === s.line);
		if (first && ![...markRow.values()].includes(first.row)) markRow.set(i, first.row);
	});
	const byRow = new Map<number, number>([...markRow.entries()].map(([i, row]) => [row, i]));
	return ROWS.map((r) => {
		const text = String(r.index + 1);
		const g = r.start - 1.5;
		return {
			row: r.index,
			text,
			cx: M.padX + (2 - text.length / 2) * CW,
			cy: rowY(r.index),
			g,
			mark: byRow.get(r.index) ?? -1,
			d: T.submit + 1 + 0.5 * r.index,
			a: g - 0.5,
		};
	});
})();

/** Colonne già risolte di una riga (0 = nessuna). */
export const resolvedCols = (row: Row, frame: number): number =>
	frame < row.start || row.cols === 0 ? 0 : Math.min(row.cols, Math.floor((frame - row.start) * T.sweep) + 1);

/** Traiettoria di un glifo dal prompt alla sua cella: scatto iniziale, arrivo morbido, leggera curva. */
export const flightPose = (
	frame: number,
	from: {cx: number; cy: number; scale: number},
	to: {cx: number; cy: number},
	d: number,
	a: number,
): {x: number; y: number; s: number; w: number} => {
	if (frame <= d) return {x: from.cx, y: from.cy, s: from.scale, w: 0};
	if (frame >= a) return {x: to.cx, y: to.cy, s: 1, w: 1};
	const u = (frame - d) / (a - d);
	const px = ease.outQuart(u);
	const py = ease.outCubic(u);
	return {x: from.cx + (to.cx - from.cx) * px, y: from.cy + (to.cy - from.cy) * py, s: from.scale + (1 - from.scale) * px, w: u};
};

/** Glifi usati durante il rimescolamento (tutti presenti in JetBrains Mono). */
const SCRAMBLE = '{}<>/=;()[]$#*+01';
export const scrambleChar = (seed: number, frame: number, every = 2): string =>
	SCRAMBLE[Math.floor(hash(seed, Math.floor(frame / every)) * SCRAMBLE.length) % SCRAMBLE.length];
