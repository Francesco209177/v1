import {clamp, ease, invLerp, lerp, prog} from '../../../lib/math';
import {V4_CUES} from '../../timeline';

/** Momenti chiave del TRAP (frame ASSOLUTI). */
export const T = {
	start: 90,
	message: V4_CUES.message, // 105 · il messaggio "atterra"
	zoomFrom: 120, //             la camera va verso il pulsante / collegamento
	zoomTo: 174,
	cursorFrom: 128,
	hover: 146, //                il puntatore si ferma sul pulsante
	tooltip: 150, //              beat · compare l'indirizzo reale (piccolo)
	lock: 162, //                 il mirino aggancia l'indirizzo (beat 165)
	reveal: V4_CUES.reveal, //    180 · l'indirizzo si stacca, grande e leggibile
	ring: 184, //                 cerchio attorno allo zero
	ann1: 189, //                 "0 (zero) al posto della «o»"
	underline: 196, //            sottolineatura del dominio
	ann2: 200, //                 "dominio diverso da orbyx.example"
	retract: 213, //              la targa rientra nel messaggio, la camera arretra
	flagUrgency: 225, //          beat · segnale: urgenza
	flagSender: 231, //           segnale: mittente sospetto
	exit: 240, //                 beat · il messaggio si inclina e se ne va
	end: 269,
} as const;

/** Geometria della finestra e-mail (coordinate locali, origine in alto a sinistra). */
export const WIN = {w: 880, h: 900} as const;
export const L = {
	btn: {x: 40, y: 598, w: 800, h: 88},
	tip: {x: 182, y: 708, w: 516, h: 96},
	title: {x: 40, y: 376, w: 760, h: 58},
	sender: {x: 150, y: 140},
	cursorRest: {x: 592, y: 656},
} as const;

export const DEG = Math.PI / 180;
export const PERSP = 2200;

export type WinPose = {x: number; y: number; scale: number; rotX: number; rotY: number; opacity: number};

/** Proiezione di un punto locale della finestra sul fotogramma (stessa catena CSS: scale · rotX · rotY + prospettiva). */
export const projectWin = (p: WinPose, lx: number, ly: number): {x: number; y: number; k: number} => {
	let X = lx - WIN.w / 2;
	let Y = ly - WIN.h / 2;
	let Z = 0;
	const ry = p.rotY * DEG;
	[X, Z] = [X * Math.cos(ry) + Z * Math.sin(ry), -X * Math.sin(ry) + Z * Math.cos(ry)];
	const rx = p.rotX * DEG;
	[Y, Z] = [Y * Math.cos(rx) - Z * Math.sin(rx), Y * Math.sin(rx) + Z * Math.cos(rx)];
	const k = PERSP / (PERSP - Z);
	return {x: p.x + X * p.scale * k, y: p.y + Y * p.scale * k, k: p.scale * k};
};

/** Zoom della camera verso pulsante + indirizzo (0..1), poi ritorno. */
export const zoomP = (a: number): number =>
	ease.inOutCubic(invLerp(T.zoomFrom, T.zoomTo, a)) * (1 - ease.inOutCubic(invLerp(T.retract - 1, T.retract + 17, a)));
/** Messa a fuoco della targa (0..1): la finestra si scurisce dietro. */
export const revealP = (a: number): number => prog(a, T.reveal - 1, 7, ease.outCubic) * (1 - prog(a, T.retract, 10, ease.inOutCubic));
/** Uscita (0..1). */
export const exitP = (a: number): number => ease.inCubic(invLerp(T.exit, T.exit + 22, a));

const REST = {x: 540, y: 738};
const FOCUS = {x: WIN.w / 2, y: 700}; // tra pulsante e indirizzo
const FOCUS_SCREEN = {x: 540, y: 812};
const ZOOM = 1.75;

/** Posa della finestra e-mail nel frame assoluto a. */
export const winPose = (a: number): WinPose => {
	// arrivo dalla profondità: ancora in moto a 105, poi rimbalzo d'impatto
	const u = invLerp(T.start - 1, T.message, a);
	const e = 0.4 * ease.outCubic(u) + 0.6 * u;
	const t = a - T.message;
	const settle = t >= 0 ? 0.04 * Math.exp(-t / 3.5) * Math.cos(t * 0.55) : 0;
	let scale = a < T.message ? lerp(0.22, 1.04, e) : 1 + settle;
	let rotX = a < T.message ? lerp(38, 7, e) : 7;
	let rotY = a < T.message ? lerp(-34, -11, e) : -11;
	let x = a < T.message ? lerp(610, REST.x, e) : REST.x;
	let y = a < T.message ? lerp(560, REST.y, e) : REST.y;
	// orbita lenta
	const orbit = ease.inOutSine(invLerp(T.message, T.exit, a));
	rotY += 16 * orbit;
	rotX -= 3 * orbit;
	y += t > 0 ? Math.sin(t / 22) * 6 : 0;
	x += t > 0 ? Math.sin(t / 30) * 4 : 0;
	// zoom sulla zona pulsante/indirizzo: la finestra si raddrizza per la leggibilità
	const z = zoomP(a);
	if (z > 0) {
		const s = lerp(1, ZOOM, z);
		rotY = lerp(rotY, -2.5, z);
		rotX = lerp(rotX, 2.5, z);
		const fx = lerp(x, FOCUS_SCREEN.x - (FOCUS.x - WIN.w / 2) * ZOOM, z);
		const fy = lerp(y, FOCUS_SCREEN.y - (FOCUS.y - WIN.h / 2) * ZOOM, z);
		x = fx;
		y = fy;
		scale *= s;
	}
	// la finestra arretra appena mentre la targa è in primo piano
	scale *= 1 - 0.05 * revealP(a);
	// uscita: anticipo e inclinazione via
	const ant = ease.inOutSine(invLerp(T.exit - 6, T.exit, a)) * (1 - invLerp(T.exit, T.exit + 4, a));
	scale *= 1 + 0.02 * ant;
	const ex = exitP(a);
	rotY += 62 * ex;
	rotX += 22 * ex;
	x -= 380 * ex;
	y += 120 * ex;
	scale *= 1 - 0.42 * ex;
	const opacity = prog(a, T.start - 1, 5, ease.outCubic) * (1 - clamp(invLerp(T.exit + 10, T.exit + 22, a)));
	return {x, y, scale, rotX, rotY, opacity};
};
