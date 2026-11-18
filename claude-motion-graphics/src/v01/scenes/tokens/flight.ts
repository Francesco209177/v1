import {clamp, ease, lerp} from '../../../lib/math';
import {SLOTS, T} from './layout';
import {departAt, FLIGHT, Pt, slotPos, toScreen} from './motion';
import {assignEntries, netState, projectNet, ringCenter, SWIRL, tokenPath} from './net';

/** Nodo d'ingresso e percorso di ogni token (precalcolati, deterministici). */
const ENTRIES = assignEntries(
	SLOTS.map((s) => toScreen(T.intoNet, slotPos(s.i, T.intoNet))),
	T.intoNet + 6,
);
export const PATHS = SLOTS.map((s) => tokenPath(s.i, ENTRIES[s.i]));

/** Avanzamento (0..1, con easing) del volo del token i. */
export const flightU = (i: number, abs: number): number => ease.inOutSine(clamp((abs - departAt(i)) / FLIGHT));

/**
 * Volo a spirale verso il nodo d'ingresso: raggio e angolo interpolati attorno al centro dell'anello
 * d'ingresso (che si muove con la camera della rete), così i token formano un vortice ordinato.
 */
export const flightPos = (i: number, abs: number, e: number): Pt => {
	const from = toScreen(abs, slotPos(i, abs));
	const proj = projectNet(netState(abs).cam);
	const c = ringCenter(proj);
	const to = proj[PATHS[i][0]];
	const r0 = Math.hypot(from.x - c.x, from.y - c.y);
	const a0 = Math.atan2(from.y - c.y, from.x - c.x);
	const r1 = Math.hypot(to.x - c.x, to.y - c.y);
	let a1 = Math.atan2(to.y - c.y, to.x - c.x);
	// stesso verso per tutti: a1 il più vicino possibile ad a0 + SWIRL
	while (a1 - (a0 + SWIRL) > Math.PI) a1 -= Math.PI * 2;
	while (a1 - (a0 + SWIRL) < -Math.PI) a1 += Math.PI * 2;
	const r = lerp(r0, r1, ease.inOutSine(e));
	const a = lerp(a0, a1, e);
	return {x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r * 0.92};
};
