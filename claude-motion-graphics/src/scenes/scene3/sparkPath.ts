import {bezier2, clamp, ease, hit, lerp, Vec2} from '../../lib/math';
import {SPARK_POSE} from '../../timeline';
import {curveWorld} from './curve';
import {CODE_BIRTHS, energy, HOME, IGNITE, passEase, PLAY_Y, SLOT_X, T} from './timing';

/**
 * Traiettoria dello spark "direttore d'orchestra": funzione pura del frame.
 * Tappe = tocchi sugli elementi (sul beat), tratte = archi di Bézier con anticipazione e rimbalzo.
 */
const START: Vec2 = {x: SPARK_POSE.ideaEnd.x, y: SPARK_POSE.ideaEnd.y};
const END: Vec2 = {x: SPARK_POSE.creationEnd.x, y: SPARK_POSE.creationEnd.y};

/** Dimensioni dello spark nelle tre fasi. */
const SIZE = {top: SPARK_POSE.ideaEnd.size, fly: 112, play: 96, end: SPARK_POSE.creationEnd.size} as const;

/** Punti di tocco: lo spark si ferma sul bordo dell'elemento, mai sopra. */
export const TOUCH: Record<'P' | 'S' | 'T' | 'G', Vec2> = {
	P: {x: HOME.P.x + 112, y: HOME.P.y - 104},
	S: {x: HOME.S.x - 118, y: HOME.S.y - 112},
	T: {x: HOME.T.x + 214, y: HOME.T.y - 122},
	G: {x: HOME.G.x - 142, y: HOME.G.y - 96},
};

type Leg = {
	t0: number;
	t1: number;
	to: Vec2;
	bulge: number; //   freccia dell'arco (px, segno = lato)
	spin: number; //    gradi di rotazione aggiunti durante la tratta
	recoil: number; //  ampiezza del rimbalzo all'arrivo (px)
	easing: (u: number) => number;
	path?: (u: number) => Vec2; // percorso custom (la curva del grafico)
};

/** Volo: parte morbido e arriva ancora veloce => il tocco "picchia" sul beat. */
const flight = (u: number): number => 0.5 * ease.inOutCubic(u) + 0.5 * Math.pow(u, 2.4);

const LEGS: readonly Leg[] = [
	{t0: T.sparkLeave, t1: IGNITE.P, to: TOUCH.P, bulge: -70, spin: 60, recoil: 12, easing: flight},
	{t0: IGNITE.P + 6, t1: IGNITE.S, to: TOUCH.S, bulge: 78, spin: 60, recoil: 12, easing: flight},
	{t0: IGNITE.S + 6, t1: IGNITE.T, to: TOUCH.T, bulge: 80, spin: 60, recoil: 12, easing: flight},
	{t0: IGNITE.T + 6, t1: IGNITE.C, to: curveWorld(0), bulge: -150, spin: 60, recoil: 0, easing: flight},
	// lo spark disegna la curva percorrendola
	{t0: IGNITE.C, t1: IGNITE.C + 9, to: curveWorld(1), bulge: 0, spin: 0, recoil: 0, easing: ease.outCubic, path: curveWorld},
	{t0: IGNITE.C + 9, t1: IGNITE.G, to: TOUCH.G, bulge: 60, spin: 60, recoil: 12, easing: flight},
	{t0: IGNITE.G + 6, t1: T.lock, to: {x: SLOT_X[0], y: PLAY_Y}, bulge: 110, spin: 60, recoil: 0, easing: ease.inOutCubic},
	// fase C: lo spark è la testina del playhead (stessa legge di playheadX)
	{t0: T.lock, t1: T.pass1End, to: {x: SLOT_X[4], y: PLAY_Y}, bulge: 0, spin: 180, recoil: 0, easing: passEase},
	{t0: T.pass1End, t1: T.pass2End, to: {x: SLOT_X[0], y: PLAY_Y}, bulge: 0, spin: -180, recoil: 0, easing: passEase},
	{t0: T.pass2End, t1: T.implode, to: {x: SLOT_X[4], y: PLAY_Y}, bulge: 0, spin: 180, recoil: 0, easing: passEase},
	// rientro al centro: posa di confine con la scena 4
	{t0: T.implode, t1: T.arrive, to: END, bulge: -120, spin: 180, recoil: 0, easing: ease.outCubic},
];

const sub = (a: Vec2, b: Vec2): Vec2 => ({x: a.x - b.x, y: a.y - b.y});
const norm = (v: Vec2): Vec2 => {
	const l = Math.hypot(v.x, v.y) || 1;
	return {x: v.x / l, y: v.y / l};
};

/** Punto di controllo dell'arco: metà corda + normale * bulge. */
const control = (a: Vec2, b: Vec2, bulge: number): Vec2 => {
	const d = norm(sub(b, a));
	return {x: (a.x + b.x) / 2 - d.y * bulge, y: (a.y + b.y) / 2 + d.x * bulge};
};

/** Posizione durante la sosta dopo la tratta `i` (-1 = prima della partenza): rimbalzo + anticipazione. */
const holdPos = (i: number, f: number): Vec2 => {
	const leg = i >= 0 ? LEGS[i] : null;
	const next = LEGS[i + 1] as Leg | undefined;
	const base = leg ? leg.to : START;
	const tArr = leg ? leg.t1 : 0;
	let x = base.x;
	let y = base.y;
	if (leg && leg.recoil > 0) {
		const dir = norm(sub(leg.to, control(FROM[i], leg.to, leg.bulge)));
		const dt = f - tArr;
		const k = leg.recoil * Math.sin(dt * 0.95) * Math.exp(-dt / 3);
		x += dir.x * k;
		y += dir.y * k;
	}
	if (next) {
		const amp = 13 * clamp((next.t0 - tArr) / 5);
		const out = norm(sub(next.to, base));
		const a = ease.inOutSine(clamp((f - (next.t0 - 4)) / 4));
		x -= out.x * amp * a;
		y -= out.y * amp * a;
	}
	return {x, y};
};

/** Punto di partenza effettivo di ogni tratta (= fine della sosta precedente): continuità garantita. */
const FROM: Vec2[] = [];
for (let i = 0; i < LEGS.length; i++) FROM.push(holdPos(i - 1, LEGS[i].t0));

/** Centro dello spark al frame `f` (accetta frame frazionari: serve per scia e ghost). */
export const sparkPos = (f: number): Vec2 => {
	if (f >= T.arrive) return END;
	if (f <= 0) return START;
	for (let i = LEGS.length - 1; i >= 0; i--) {
		const leg = LEGS[i];
		if (f >= leg.t1) return holdPos(i, f);
		if (f >= leg.t0) {
			const e = leg.easing((f - leg.t0) / (leg.t1 - leg.t0));
			if (leg.path) return leg.path(e);
			return bezier2(FROM[i], control(FROM[i], leg.to, leg.bulge), leg.to, e);
		}
	}
	return holdPos(-1, f);
};

/** Campioni di una tratta di volo (per disegnare la traccia del percorso). */
export const legTrace = (i: number, uMax: number, samples = 18): Vec2[] => {
	const leg = LEGS[i];
	const out: Vec2[] = [];
	for (let s = 0; s <= samples; s++) {
		const e = (s / samples) * uMax;
		out.push(leg.path ? leg.path(e) : bezier2(FROM[i], control(FROM[i], leg.to, leg.bulge), leg.to, e));
	}
	return out;
};
export const FLIGHT_LEGS: readonly {index: number; t0: number; t1: number; easing: (u: number) => number}[] = LEGS.map(
	(l, index) => ({index, t0: l.t0, t1: l.t1, easing: l.easing}),
).filter((l) => l.index <= 6 && l.index !== 4);

export type SparkState = {x: number; y: number; size: number; rotation: number; glow: number; speed: number};

export const sparkState = (f: number): SparkState => {
	const p = sparkPos(f);
	const q = sparkPos(f - 1);
	const speed = Math.hypot(p.x - q.x, p.y - q.y);

	// dimensione: grande in cima, compatto in volo, piccolo sul playhead, pieno al confine
	let size: number = SIZE.top;
	if (f > T.sparkLeave - 3) size = lerp(SIZE.top, SIZE.fly, ease.inOutCubic(clamp((f - (T.sparkLeave - 3)) / 13)));
	if (f > IGNITE.G + 6) size = lerp(SIZE.fly, SIZE.play, ease.inOutCubic(clamp((f - IGNITE.G - 6) / 9)));
	if (f > T.implode) size = lerp(SIZE.play, SIZE.end, ease.outQuart(clamp((f - T.implode) / (T.arrive - T.implode))));

	// rotazione: somma degli spin delle tratte (totale 720° => 0 al confine)
	let rot = 0;
	for (const leg of LEGS) rot += leg.spin * ease.inOutSine(clamp((f - leg.t0) / (leg.t1 - leg.t0)));
	const rotation = f >= T.arrive ? 0 : rot % 360;

	// glow: colpi quando lancia i dardi (fase A) e quando tocca (fase B), crescita col riser,
	// poi carica fino a 1.6 ESATTI sull'ultimo frame
	let glow = 1;
	for (const b of CODE_BIRTHS) glow += 0.45 * hit(f, b.at - 6, 9);
	for (const at of Object.values(IGNITE)) glow += 0.6 * hit(f, at, 10);
	glow += 0.35 * energy(f);
	if (f >= T.implode) glow = lerp(1.35, 1.6, ease.inOutSine(clamp((f - T.implode) / (T.end - T.implode))));
	if (f >= T.end) glow = 1.6;

	return {x: p.x, y: p.y, size, rotation, glow, speed};
};
