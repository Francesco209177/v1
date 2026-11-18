import {CODE_METRICS, PlacedToken, placeTokens} from '../../lib/code';
import {bezier2, clamp, ease, invLerp, lerp, Vec2} from '../../lib/math';
import {CODE_BIRTHS, HOME, LIFT, SWEEP_ORIGIN} from './timing';
import {projectWindow} from './windowMath';

/** Offset (rispetto a HOME.S) dello slot in cui nasce il cerchio. */
export const RING_R = 80;
export const ringSlot = (j: number, rotDeg = 0): Vec2 => {
	const a = ((-135 + 90 * j + rotDeg) * Math.PI) / 180;
	return {x: Math.cos(a) * RING_R, y: Math.sin(a) * RING_R};
};

/** Dove atterra (sul beat) la riga di codice di ciascun elemento. */
export const LANDING: Record<'P' | 'S' | 'T' | 'G', Vec2> = {
	P: HOME.P,
	S: {x: HOME.S.x + ringSlot(0).x, y: HOME.S.y + ringSlot(0).y},
	T: HOME.T,
	G: SWEEP_ORIGIN,
};

export type FlyingToken = {token: PlacedToken; start: Vec2; k0: number; squash: number; hero: boolean};
export type TokenGroup = {
	id: 'P' | 'S' | 'T' | 'G';
	at: number; //     beat di atterraggio
	t0: number; //     frame di distacco
	origin: Vec2; //   centro della riga al distacco (schermo)
	target: Vec2;
	ctrl: Vec2;
	tokens: FlyingToken[];
};

let cache: TokenGroup[] | null = null;

/** Gruppi di token che si staccano: posizioni di partenza proiettate dalla finestra al frame di distacco. */
export const tokenGroups = (): TokenGroup[] => {
	if (cache) return cache;
	const placed = placeTokens();
	cache = CODE_BIRTHS.map((b) => {
		const id = b.id as TokenGroup['id'];
		const t0 = b.at - LIFT;
		const mine = placed.filter((t) => t.line === b.line);
		const tokens: FlyingToken[] = mine.map((token) => {
			const p = projectWindow(t0, token.x + token.w / 2, token.y + CODE_METRICS.lineHeight / 2);
			return {token, start: {x: p.x, y: p.y}, k0: p.k, squash: p.squash, hero: id === 'T' && token.text === 'Ciao!'};
		});
		const first = tokens[0].start;
		const last = tokens[tokens.length - 1].start;
		const origin = {x: (first.x + last.x) / 2, y: (first.y + last.y) / 2};
		const target = LANDING[id];
		// arco: il gruppo si solleva "verso la camera" prima di ricadere sul bersaglio
		const ctrl = {x: lerp(origin.x, target.x, 0.35), y: Math.min(origin.y, target.y) - 110};
		return {id, at: b.at, t0, origin, target, ctrl, tokens};
	});
	return cache;
};

/** Accelerazione in volo: si stacca piano e arriva veloce (la collisione cade sul beat). */
export const flightEase = (u: number): number => 0.35 * ease.outCubic(u) + 0.65 * Math.pow(u, 2.6);

/** Centro del gruppo al frame f. */
export const groupCenter = (g: TokenGroup, f: number): Vec2 =>
	bezier2(g.origin, g.ctrl, g.target, flightEase(clamp((f - g.t0) / LIFT)));

/** Quanto il gruppo si è condensato in una goccia di luce (0..1). */
export const groupConverge = (g: TokenGroup, f: number): number => ease.inOutCubic(invLerp(0.42, 1, (f - g.t0) / LIFT));
