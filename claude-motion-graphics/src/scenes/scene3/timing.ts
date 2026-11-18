import {clamp, ease, lerp, prog, Vec2} from '../../lib/math';

/**
 * Scena 3 — tempi e geometria condivisi (frame LOCALI; assoluto = locale + 270).
 * Ogni multiplo di 15 è un beat: nascite, accensioni e "lock" cadono lì.
 */
export type ElementId = 'P' | 'S' | 'T' | 'C' | 'G';
export const ELEMENT_IDS: readonly ElementId[] = ['P', 'S', 'T', 'C', 'G'];

export const T = {
	recedeStart: 1, //   la finestra comincia ad arretrare (spinta dell'impatto)
	recedeEnd: 56,
	sweepStart: 60, //   beat · la "Transizione glow" spazza via la finestra
	sweepEnd: 73,
	sparkLeave: 65, //   lo spark lascia la cima e diventa direttore d'orchestra
	gather: 137, //      gli elementi volano verso le card
	lock: 150, //        CUE buildStart (abs 420): storyboard agganciato, parte il playhead
	pass1End: 172.5, //  passate del playhead sempre più rapide: 1.5 · 1 · 0.5 beat
	pass2End: 187.5,
	implode: 195, //     beat · tutto viene risucchiato nello spark
	arrive: 205, //      spark fermo sulla posa di confine
	end: 209,
	captionOut: 190,
} as const;

/** Frame di anticipo con cui i token si staccano dal codice prima di "nascere" sul beat. */
export const LIFT = 9;

/** Righe di codice (indice in CODE_LINES) che diventano elementi, e beat di nascita. */
export const CODE_BIRTHS: readonly {line: number; id: ElementId; at: number}[] = [
	{line: 6, id: 'P', at: 15}, // <Particelle />
	{line: 7, id: 'S', at: 30}, // <Forma />
	{line: 8, id: 'T', at: 45}, // <Testo>Ciao!</Testo>
	{line: 9, id: 'G', at: 60}, // <Transizione />
];

/** Frame di nascita e di accensione (tocco dello spark) di ogni elemento. */
export const BORN: Record<ElementId, number> = {P: 15, S: 30, T: 45, G: 68, C: 120};
export const IGNITE: Record<ElementId, number> = {P: 75, S: 90, T: 105, C: 120, G: 135};

/** Posizione "di casa" sul palco nelle fasi A e B (costellazione asimmetrica). */
export const HOME: Record<ElementId, Vec2> = {
	P: {x: 272, y: 612},
	S: {x: 806, y: 592},
	T: {x: 540, y: 828},
	C: {x: 300, y: 1038},
	G: {x: 792, y: 1040},
};

/** Punto da cui parte la spazzata di luce (dove atterrano i token di <Transizione />). */
export const SWEEP_ORIGIN: Vec2 = {x: 96, y: 900};

/* ---------- Fase C: storyboard ---------- */
export const CARD = {w: 172, h: 306, y: 676, radius: 24} as const;
export const SLOT_X: readonly number[] = [166, 353, 540, 727, 914];
/** Quale elemento vive in ciascuna card (ordine scelto per non incrociare i voli). */
export const CARD_ORDER: readonly ElementId[] = ['P', 'C', 'T', 'S', 'G'];
/** Scala dell'elemento dentro la card. */
export const CARD_FIT: Record<ElementId, number> = {P: 0.5, C: 0.52, T: 0.3, S: 0.5, G: 0.54};

export const TRACK = {x: 80, w: 920, y: 990, h: 60} as const;
/** Quota dello spark quando fa da testina del playhead. */
export const PLAY_Y = 916;

/** Ease delle passate: quasi lineare, con un respiro alle inversioni. */
export const passEase = (u: number): number => lerp(u, ease.inOutSine(u), 0.6);

/** X del playhead (= X dello spark) durante la fase C. */
export const playheadX = (f: number): number => {
	const a = SLOT_X[0];
	const b = SLOT_X[4];
	if (f <= T.lock) return a;
	if (f < T.pass1End) return lerp(a, b, passEase((f - T.lock) / (T.pass1End - T.lock)));
	if (f < T.pass2End) return lerp(b, a, passEase((f - T.pass1End) / (T.pass2End - T.pass1End)));
	return lerp(a, b, passEase(clamp((f - T.pass2End) / (T.implode - T.pass2End))));
};

/** Quanto la card `i` è "in riproduzione" (0..1): segue il playhead. */
export const cardActive = (i: number, f: number): number => {
	if (f < T.lock - 2 || f >= T.implode + 2) return 0;
	const d = Math.abs(playheadX(f) - SLOT_X[i]);
	const k = 1 - clamp((d - 62) / 56);
	return k * k * (3 - 2 * k) * prog(f, T.lock - 2, 3) * (1 - prog(f, T.implode - 1, 3));
};

/** Energia del build (0 al lock, 1 all'implosione): accelera moti e glow col riser. */
export const energy = (f: number): number => clamp((f - T.lock) / (T.implode - T.lock));

/* ---------- Fuoco: un solo protagonista per volta ---------- */
const FOCUS: readonly {id: ElementId | null; at: number}[] = [
	{id: 'P', at: 15},
	{id: 'S', at: 30},
	{id: 'T', at: 45},
	{id: null, at: 60},
	{id: 'G', at: 68},
	{id: 'P', at: 75},
	{id: 'S', at: 90},
	{id: 'T', at: 105},
	{id: 'C', at: 120},
	{id: 'G', at: 135},
	{id: null, at: 150},
];

/** 1 mentre l'elemento è il punto focale, 0 altrimenti (con entrata rapida e uscita morbida). */
export const focusOf = (id: ElementId, f: number): number => {
	let v = 0;
	for (let i = 0; i < FOCUS.length - 1; i++) {
		if (FOCUS[i].id !== id) continue;
		v = Math.max(v, prog(f, FOCUS[i].at, 3, ease.outCubic) * (1 - prog(f, FOCUS[i + 1].at, 10, ease.inOutSine)));
	}
	return v;
};

/** Accensione 0..1 dopo il tocco dello spark. */
export const litOf = (id: ElementId, f: number): number => prog(f, IGNITE[id], 8, ease.outCubic);

/** Indice e fase del beat a partire da `from` (per loop agganciati alla musica). */
export const beatStep = (f: number, from: number, every = 15): {n: number; t: number} => {
	const d = Math.max(0, f - from);
	const n = Math.floor(d / every);
	return {n, t: d - n * every};
};
