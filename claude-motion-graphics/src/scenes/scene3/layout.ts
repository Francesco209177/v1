import {bezier2, clamp, ease, hit, lerp, prog, Vec2} from '../../lib/math';
import {sparkPos} from './sparkPath';
import {BORN, CARD, CARD_FIT, CARD_ORDER, cardActive, ElementId, energy, focusOf, HOME, IGNITE, litOf, SLOT_X, T} from './timing';

/** Stato di una card dello storyboard (fase C) — condiviso da cornice e contenuto. */
export type CardState = {x: number; y: number; scale: number; rot: number; alpha: number; active: number; imp: number; appear: number};

/** Progresso del risucchio finale della card `i` (le esterne partono per prime). */
export const implodeK = (i: number, f: number): number =>
	ease.inCubic(clamp((f - T.implode - (2 - Math.abs(i - 2)) * 0.9) / 7));

export const cardState = (i: number, f: number): CardState => {
	const appear = prog(f, T.gather + 1 + i, 9, ease.outCubic);
	const pop = ease.outBack(clamp((f - (T.gather + 1 + i)) / 11));
	const active = cardActive(i, f);
	const imp = implodeK(i, f);
	const off = i - 2;
	// leggero ventaglio: le card esterne scendono e ruotano appena
	let x = SLOT_X[i];
	let y = CARD.y + off * off * 5 - 13 * active + (1 - appear) * 46;
	let scale = lerp(0.72, 1, pop) * (1 + 0.12 * active);
	let rot = off * 1.5 * (1 - active);
	if (imp > 0) {
		const s = sparkPos(f);
		x = lerp(x, s.x, imp);
		y = lerp(y, s.y, imp);
		scale *= 1 - imp;
		rot += off * 22 * imp;
	}
	return {x, y, scale, rot, alpha: appear * (1 - imp * imp * imp), active, imp, appear};
};

/** Progresso del volo dell'elemento verso la propria card. */
export const gatherK = (slot: number, f: number): number => prog(f, T.gather + slot, 10, ease.inOutCubic);

export type Pose = {x: number; y: number; scale: number; alpha: number; lit: number; focus: number; rot: number; visible: boolean};
const HIDDEN: Pose = {x: 0, y: 0, scale: 0, alpha: 0, lit: 0, focus: 0, rot: 0, visible: false};

/**
 * Posa di un elemento vivente lungo tutta la scena:
 * nasce a casa (A) → viene acceso dallo spark (B) → entra nella sua card (C) → implode nello spark.
 */
export const elementPose = (id: ElementId, f: number): Pose => {
	if (f < BORN[id]) return HIDDEN;
	const slot = CARD_ORDER.indexOf(id);
	const lit = litOf(id, f);
	const focus = focusOf(id, f);

	// fasi A/B: a casa, con deriva lenta; chi non è a fuoco arretra (più piccolo e più scuro)
	const ph = slot * 1.7;
	const home: Vec2 = {
		x: HOME[id].x + 6 * Math.sin(f / 19 + ph),
		y: HOME[id].y + 7 * Math.sin(f / 14 + ph * 2),
	};
	const pop = id === 'G' ? ease.outBack(clamp((f - BORN.G) / 10)) : 1;
	const scaleB = pop * (0.9 + 0.1 * focus) * (1 + 0.13 * hit(f, IGNITE[id], 9));
	const alphaB = lerp(lerp(0.5, 0.74, lit), 1, focus);

	const g = gatherK(slot, f);
	if (g <= 0) return {x: home.x, y: home.y, scale: scaleB, alpha: alphaB, lit, focus, rot: 0, visible: true};

	// fase C: dentro la card (ne eredita posizione, scala, rotazione e risucchio)
	const c = cardState(slot, f);
	const target: Vec2 = {x: c.x, y: c.y + 12 * c.scale};
	const ctrl: Vec2 = {x: lerp(home.x, target.x, 0.5), y: Math.min(home.y, target.y) - 70};
	const p = bezier2(home, ctrl, target, g);
	const alphaC = (0.6 + 0.2 * energy(f) + 0.4 * c.active) * (1 - c.imp * c.imp);
	return {
		x: p.x,
		y: p.y,
		scale: lerp(scaleB, CARD_FIT[id] * c.scale, g),
		alpha: clamp(lerp(alphaB, alphaC, g)),
		lit,
		focus: Math.max(focus * (1 - g), c.active),
		rot: c.rot * g,
		visible: c.imp < 1,
	};
};
