import {clamp, hash} from '../../../lib/math';
import {HUB} from './timing';

/**
 * Pianta del diagramma "dentro il computer" (coordinate del piano a camera s = 1, origine schermo).
 * Colonna sinistra SSD → CPU, colonna destra RAM → GPU, al centro la rete neurale (il modello).
 */
export const RING_R = 158;

export const BOX = {
	ssd: {x: 255, y: 420, w: 330, h: 96},
	ram: {x: 825, y: 420, w: 330, h: 126},
	cpu: {x: 225, y: 760, w: 188, h: 188},
	gpu: {x: 855, y: 760, w: 226, h: 196},
	prompt: {x: 540, y: 532, w: 312, h: 54},
	answer: {x: 540, y: 1088, w: 780, h: 140},
} as const;

export type Pt = {x: number; y: number};

export type Route = {
	id: string;
	pts: Pt[];
	/** finestra di costruzione (il tracciato si disegna dal primo punto all'ultimo) */
	build: [number, number];
	/** spessore base */
	w: number;
};

const lanes = (id: string, make: (o: number) => Pt[], offs: number[], build: [number, number], w = 2.4): Route[] =>
	offs.map((o, i) => ({id: `${id}${i}`, pts: make(o), build: [build[0] + i * 2, build[1] + i * 2], w}));

const ringAt = (deg: number): Pt => {
	const a = (deg * Math.PI) / 180;
	return {x: HUB.x + Math.cos(a) * RING_R, y: HUB.y + Math.sin(a) * RING_R};
};

const ssdR = BOX.ssd.x + BOX.ssd.w / 2;
const ramL = BOX.ram.x - BOX.ram.w / 2;
const ssdB = BOX.ssd.y + BOX.ssd.h / 2;
const ramB = BOX.ram.y + BOX.ram.h / 2;
const cpuR = BOX.cpu.x + BOX.cpu.w / 2;
const cpuT = BOX.cpu.y - BOX.cpu.h / 2;
const gpuL = BOX.gpu.x - BOX.gpu.w / 2;
const gpuT = BOX.gpu.y - BOX.gpu.h / 2;

const vL = ringAt(225);
const vR = ringAt(315);

/** Tutti i tracciati (bus) del diagramma. */
export const ROUTES = {
	/** bus SSD → RAM: 3 corsie, il percorso del caricamento */
	bus: lanes('bus', (o) => [{x: ssdR, y: BOX.ssd.y + o}, {x: ramL, y: BOX.ram.y + o}], [-16, 0, 16], [16, 30], 2.6),
	/** SSD ↔ CPU */
	colL: lanes('colL', (o) => [{x: BOX.cpu.x + o, y: ssdB}, {x: BOX.cpu.x + o, y: cpuT}], [-12, 12], [22, 36]),
	/** RAM ↔ GPU (VRAM) */
	colR: lanes('colR', (o) => [{x: BOX.gpu.x + o, y: ramB}, {x: BOX.gpu.x + o, y: gpuT}], [-12, 12], [20, 34]),
	/** RAM → rete (i pesi entrano nel modello) */
	spokeR: [
		{id: 'spokeR', pts: [{x: 720, y: ramB}, {x: 720, y: vR.y - (720 - vR.x)}, vR], build: [14, 28], w: 2.6},
	] as Route[],
	/** SSD → rete (simmetrico) */
	spokeL: [
		{id: 'spokeL', pts: [{x: 360, y: ssdB}, {x: 360, y: vL.y - (vL.x - 360)}, vL], build: [16, 30], w: 2.6},
	] as Route[],
	/** CPU ↔ rete */
	cpu: lanes('cpu', (o) => [{x: cpuR, y: HUB.y + o}, {x: HUB.x - Math.sqrt(RING_R ** 2 - o * o), y: HUB.y + o}], [-11, 11], [28, 38]),
	/** GPU ↔ rete */
	gpu: lanes('gpu', (o) => [{x: gpuL, y: HUB.y + o}, {x: HUB.x + Math.sqrt(RING_R ** 2 - o * o), y: HUB.y + o}], [-11, 11], [28, 38]),
	/** richiesta → ingresso della rete */
	input: [{id: 'input', pts: [{x: HUB.x, y: BOX.prompt.y + BOX.prompt.h / 2}, {x: HUB.x, y: HUB.y - RING_R}], build: [108, 116], w: 2.2}] as Route[],
	/** uscita della rete → risposta */
	output: [{id: 'output', pts: [{x: HUB.x, y: HUB.y + RING_R}, {x: HUB.x, y: BOX.answer.y - BOX.answer.h / 2}], build: [140, 148], w: 2.4}] as Route[],
};

export const ALL_ROUTES: Route[] = Object.values(ROUTES).flat();

/** Lunghezze cumulative di una polilinea. */
const lengthsCache = new Map<string, number[]>();
export const cumLengths = (r: Route): number[] => {
	const c = lengthsCache.get(r.id);
	if (c) return c;
	const out = [0];
	for (let i = 1; i < r.pts.length; i++) out.push(out[i - 1] + Math.hypot(r.pts[i].x - r.pts[i - 1].x, r.pts[i].y - r.pts[i - 1].y));
	lengthsCache.set(r.id, out);
	return out;
};

export const routeLength = (r: Route): number => {
	const c = cumLengths(r);
	return c[c.length - 1];
};

/** Punto a frazione t (0..1) della polilinea. */
export const pointAt = (r: Route, t: number): Pt => {
	const c = cumLengths(r);
	const L = c[c.length - 1];
	const d = clamp(t) * L;
	for (let i = 1; i < c.length; i++) {
		if (d <= c[i] || i === c.length - 1) {
			const seg = c[i] - c[i - 1] || 1;
			const k = clamp((d - c[i - 1]) / seg);
			return {x: r.pts[i - 1].x + (r.pts[i].x - r.pts[i - 1].x) * k, y: r.pts[i - 1].y + (r.pts[i].y - r.pts[i - 1].y) * k};
		}
	}
	return r.pts[r.pts.length - 1];
};

/** Sotto-polilinea [t0, t1] (per disegnare tracciati in costruzione o scie). */
export const subPath = (r: Route, t0: number, t1: number): Pt[] => {
	const c = cumLengths(r);
	const L = c[c.length - 1];
	const a = clamp(t0) * L;
	const b = clamp(t1) * L;
	const out: Pt[] = [pointAt(r, t0)];
	for (let i = 1; i < c.length - 1; i++) if (c[i] > a && c[i] < b) out.push(r.pts[i]);
	out.push(pointAt(r, t1));
	return out;
};

/** Piste decorative del circuito stampato sullo sfondo del diagramma (deterministiche). */
export type PcbSeg = {pts: Pt[]; via: boolean; a: number};
export const PCB: PcbSeg[] = (() => {
	const out: PcbSeg[] = [];
	for (let i = 0; i < 70; i++) {
		const x0 = 70 + hash(i, 11) * 940;
		const y0 = 250 + hash(i, 12) * 820;
		// lascia libero il centro (rete) e l'area della risposta
		if (Math.hypot(x0 - HUB.x, y0 - HUB.y) < RING_R + 40) continue;
		const len1 = 30 + hash(i, 13) * 90;
		const len2 = 20 + hash(i, 14) * 70;
		const horiz = hash(i, 15) > 0.5;
		const sgn = hash(i, 16) > 0.5 ? 1 : -1;
		const sgn2 = hash(i, 17) > 0.5 ? 1 : -1;
		const p1 = horiz ? {x: x0 + len1 * sgn, y: y0} : {x: x0, y: y0 + len1 * sgn};
		const p2 = {x: p1.x + len2 * 0.7071 * sgn2 * (horiz ? sgn : 1), y: p1.y + len2 * 0.7071 * (horiz ? sgn2 : sgn)};
		out.push({pts: [{x: x0, y: y0}, p1, p2], via: hash(i, 18) > 0.4, a: 0.5 + hash(i, 19) * 0.5});
	}
	return out;
})();
