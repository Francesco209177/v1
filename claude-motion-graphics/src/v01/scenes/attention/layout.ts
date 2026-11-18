import {ease, hit, lerp, prog} from '../../../lib/math';
import {buildNet, NetCamera} from '../../../v02/components/NeuralNet';
import {tokenWidth} from '../../components/TokenChip';
import {V1_NET_AT_270} from '../../timeline';
import {ROW_OF, ROWS, TOKENS} from './data';

/**
 * Tempi della scena ATTENTION (frame LOCALI; assoluto = locale + 270; beat = multipli di 15).
 * Atti: la rete arretra e i token riemergono → EMBEDDING (30) → ATTENZIONE (90, secondo fuoco 135)
 * → elaborazione nella rete (150) → collasso in un punto di luce (198–209), taglio globale a 210.
 */
export const T = {
	recedeEnd: 34, //  la rete è sullo sfondo
	emerge: 3, //      primo token che esce dalla rete
	vectors: 30, //    cue abs 300: ogni token diventa una lista di numeri
	condense: 76, //   le colonne si compattano in una striscia sotto il token
	attention: 90, //  cue abs 360: archi di attenzione
	focusB: 135, //    abs 405: il fuoco passa a un secondo token
	process: 150, //   abs 420: i token entrano nella rete, strato dopo strato
	collapse: 197, //  tutto si raccoglie in un punto di luce
	end: 209,
} as const;

/** Punto del lampo globale al taglio 480. */
export const CUT_POINT = {x: 540, y: 760};

// ------------------------------------------------------------------ token: geometria

export const SIZE = 44;
export const CH = SIZE * 1.55; // altezza del chip
const GAP = 14;
export const CHIP_W = TOKENS.map((t) => tokenWidth(t, SIZE));
export const CHIP_X: number[] = (() => {
	const xs: number[] = new Array(TOKENS.length).fill(540);
	for (const row of ROWS) {
		const total = row.reduce((s, i) => s + CHIP_W[i], 0) + GAP * (row.length - 1);
		let x = 540 - total / 2;
		for (const i of row) {
			xs[i] = x + CHIP_W[i] / 2;
			x += CHIP_W[i] + GAP;
		}
	}
	return xs;
})();

/** Centri delle righe nei tre atti: colonne di numeri (B), archi (C), blocco compatto sopra la rete (D). */
const ROW_Y = {
	B: [392, 798],
	C: [562, 884],
	D: [492, 604],
};

export const condenseP = (f: number): number => prog(f, T.condense, 13, ease.inOutCubic);
export const processP = (f: number): number => prog(f, T.process, 16, ease.inOutCubic);
/** Collasso finale (scala/posizione verso il punto di luce). */
export const collapseP = (f: number): number => prog(f, T.collapse, T.end - T.collapse, ease.inCubic);

/** Scala del piano dei token (DOM + archi): lenta spinta nell'elaborazione, respiro, poi collasso nel punto di luce. */
export const layerScale = (f: number): number => {
	const col = collapseP(f);
	const antic = prog(f, T.collapse - 6, 6, ease.outCubic) * (1 - col);
	const energy = prog(f, T.process, T.collapse - T.process, ease.inQuad);
	return (1 + 0.035 * energy) * (1 + 0.03 * antic) * (1 - 0.97 * col);
};

/** Punto del piano dei token → schermo (stessa trasformazione del layer). */
export const toScreen = (f: number, p: {x: number; y: number}): {x: number; y: number} => {
	const s = layerScale(f);
	return {x: CUT_POINT.x + (p.x - CUT_POINT.x) * s, y: CUT_POINT.y + (p.y - CUT_POINT.y) * s};
};

/** Centro verticale della riga r al frame f (con una lenta deriva: niente è mai fermo). */
export const rowY = (f: number, r: number): number => {
	const y = lerp(lerp(ROW_Y.B[r], ROW_Y.C[r], condenseP(f)), ROW_Y.D[r], processP(f));
	return y + Math.sin(f / 37 + r * 0.8) * 3;
};

/** Centro "a riposo" del token i (riga di appartenenza). */
export const slot = (f: number, i: number): {x: number; y: number} => ({
	x: CHIP_X[i] + Math.sin(f / 53 + ROW_OF[i]) * 2,
	y: rowY(f, ROW_OF[i]),
});

/** Ordine di lettura (sinistra → destra, riga per riga). */
export const READ_ORDER = TOKENS.map((_, i) => i);

// ------------------------------------------------------------------ rete neurale: camera

export type NetPose = Required<NetCamera> & {opacity: number; activity: number; flash: number; focusLayer: number};

/** Posa della rete: identica a V1_NET_AT_270 su f = 0, arretra sullo sfondo, torna avanti nell'elaborazione, collassa. */
export const netAt = (f: number, beat: number): NetPose => {
	const rec = prog(f, 0, T.recedeEnd, ease.inOutCubic);
	const fwd = prog(f, T.process, 30, ease.inOutCubic);
	const energy = prog(f, T.process, T.collapse - T.process, ease.inQuad);
	const col = collapseP(f);
	const antic = prog(f, T.collapse - 6, 6, ease.outCubic) * (1 - col);
	const s = lerp(lerp(V1_NET_AT_270.scale, 0.42, rec), 0.7, fwd) * (1 + 0.04 * antic) * (1 - 0.975 * col);
	const cy = lerp(lerp(lerp(V1_NET_AT_270.cy, 1170, rec), 1032, fwd), CUT_POINT.y, prog(f, T.collapse, T.end - T.collapse, ease.inOutCubic));
	const opacity = lerp(lerp(1, 0.34, rec), 1, fwd);
	const activity = Math.min(1, lerp(lerp(V1_NET_AT_270.activity, 0.2, rec), 0.75, fwd) + 0.25 * energy);
	// archi di attenzione: la rete "risponde" sui beat
	const attn = prog(f, T.attention, 8) * (1 - fwd);
	const flash = Math.min(1, 0.18 * beat * attn + (0.35 + 0.5 * energy) * beat * fwd + 0.4 * hit(f, T.process, 10) + 0.8 * col);
	const focusLayer = f >= T.process ? Math.floor(((f - T.process) % 15) / 2.5) : -1;
	return {
		cx: V1_NET_AT_270.cx,
		cy,
		scale: s,
		yaw: 0,
		pitch: lerp(V1_NET_AT_270.pitch, -0.26, rec) + 0.06 * fwd,
		dist: V1_NET_AT_270.dist,
		opacity,
		activity,
		flash,
		focusLayer,
	};
};

// ------------------------------------------------------------------ proiezione dei neuroni (stessa matematica di NeuralNet)

export const NET = buildNet();

/** Posizione a schermo del neurone n con la camera data (yaw = v1NetYaw(abs)). */
export const projectNode = (n: number, cam: NetPose, yaw: number): {x: number; y: number; k: number} => {
	const p = NET.nodes[n];
	const cyw = Math.cos(yaw);
	const syw = Math.sin(yaw);
	const cp = Math.cos(cam.pitch);
	const sp = Math.sin(cam.pitch);
	const x1 = p.x * cyw + p.z * syw;
	const z1 = -p.x * syw + p.z * cyw;
	const y2 = p.y * cp - z1 * sp;
	const z2 = p.y * sp + z1 * cp;
	const k = 1100 / Math.max(40, cam.dist + z2);
	return {x: cam.cx + x1 * k * cam.scale, y: cam.cy + y2 * k * cam.scale, k};
};

/** Indici dei neuroni per strato. */
export const LAYER_NODES: number[][] = (() => {
	const out: number[][] = [];
	NET.nodes.forEach((n, i) => {
		(out[n.layer] ??= []).push(i);
	});
	return out;
})();
