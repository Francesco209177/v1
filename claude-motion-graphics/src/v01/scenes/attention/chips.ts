import {bezier2, clamp, ease, hit, lerp, prog, Vec2} from '../../../lib/math';
import {v1NetYaw} from '../../timeline';
import {FOCUS, N_TOK} from './data';
import {CHIP_X, LAYER_NODES, netAt, projectNode, slot, T} from './layout';

/** Stato di un token al frame f: posizione (centro), scala, opacità, luce. */
export type ChipState = {x: number; y: number; scale: number; opacity: number; glow: number; active: boolean; flight: number};

const EMERGE_DUR = 22;
export const emergeStart = (i: number): number => T.emerge + i * 1.6;
export const emergeP = (f: number, i: number): number => prog(f, emergeStart(i), EMERGE_DUR, ease.outCubic);

/** Neurone da cui riemerge ciascun token: neuroni frontali dei primi strati, abbinati per posizione orizzontale. */
const EMERGE_NODE: number[] = (() => {
	const f = 8;
	const cam = netAt(f, 0);
	const yaw = v1NetYaw(f + 270);
	const cand = [...LAYER_NODES[0], ...LAYER_NODES[1], ...LAYER_NODES[2]]
		.map((n) => ({n, ...projectNode(n, cam, yaw)}))
		.sort((a, b) => b.k - a.k)
		.slice(0, 22)
		.sort((a, b) => a.x - b.x);
	const byX = CHIP_X.map((x, i) => ({x, i})).sort((a, b) => a.x - b.x);
	const out: number[] = new Array(N_TOK).fill(0);
	byX.forEach(({i}, r) => {
		out[i] = cand[Math.round((r / (N_TOK - 1)) * (cand.length - 1))].n;
	});
	return out;
})();

/** Posizione lungo il volo dalla rete alla riga (p = 0 nel neurone, 1 nello slot). */
export const flightPos = (f: number, i: number, p: number): Vec2 => {
	const cam = netAt(f, 0);
	const s = projectNode(EMERGE_NODE[i], cam, v1NetYaw(f + 270));
	const e = slot(f, i);
	const c = {x: lerp(s.x, e.x, 0.1), y: lerp(s.y, e.y, 0.8) + 30};
	return bezier2(s, c, e, p);
};

/** Inviluppo di un fuoco di attenzione (0..1). */
export const focusEnv = (f: number, k: number): number => {
	const F = FOCUS[k];
	return prog(f, F.at, 6, ease.outCubic) * (1 - prog(f, F.out, 7, ease.inCubic));
};

export const chipState = (f: number, i: number, beat: number): ChipState => {
	const s0 = emergeStart(i);
	const p = emergeP(f, i);
	const pos = p < 1 ? flightPos(f, i, p) : slot(f, i);
	let opacity = clamp((f - s0) / 4);
	// piccoli finché sono ammassati vicino alla rete, a piena scala solo nello slot
	let scale = 0.22 + 0.78 * ease.inOutSine(p);
	let glow = 1 + 0.9 * (1 - p) + 0.7 * hit(f, T.vectors + i * 2, 10);
	let active = false;

	FOCUS.forEach((F, k) => {
		const env = focusEnv(f, k);
		if (env <= 0) return;
		if (i === F.q) {
			glow += (0.7 + 0.45 * beat) * env;
			scale *= 1 + 0.05 * env + 0.05 * hit(f, F.at, 8);
			active = env > 0.3;
		} else if (i < F.q) {
			const wn = F.w[i] / Math.max(...F.w);
			const drawn = prog(f, F.at + 2, 12);
			glow += 0.95 * wn * env * drawn * (1 + 0.4 * beat);
		} else {
			// attenzione causale: i token successivi non vengono guardati
			opacity *= 1 - 0.62 * env;
		}
	});

	// elaborazione: scansione da sinistra a destra, poi l'energia scorre nella rete
	const sc = T.process + i * 1.3;
	const fwd = prog(f, T.process, 16);
	const energy = prog(f, T.process, T.collapse - T.process, ease.inQuad);
	glow += 0.9 * hit(f, sc, 12) + 0.4 * beat * fwd;
	if (f >= sc + 2) active = true;
	opacity *= 1 - 0.18 * energy;

	return {x: pos.x, y: pos.y, scale, opacity, glow: Math.min(1.9, glow), active, flight: p};
};
