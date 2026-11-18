import {clamp, ease, hash, invLerp, lerp, prog} from '../../../lib/math';
import {PHONE_SCREEN} from '../../components/Phone';
import {V4_CUES} from '../../timeline';

/** Momenti chiave dell'HOOK (frame ASSOLUTI = frame di scena: l'hook parte da 0). */
export const H = {
	notif: V4_CUES.notification, // 6 · arriva la notifica (lo schermo si accende)
	expand: 15, //                  beat · la notifica si espande e mostra il pulsante
	fingerIn: 18, //                il dito entra in campo
	hover: 41, //                   il dito si ferma sopra il pulsante
	press: 50, //                   parte la pressione decisa
	tap: V4_CUES.tap, //            60 · contatto → schermo rosso
	diveFrom: 73, //                la camera si tuffa nello schermo
	end: 89,
} as const;

export const DEG = Math.PI / 180;
export const PERSP = 2200; // stessa prospettiva del componente Phone

export type PhonePose = {x: number; y: number; scale: number; rotX: number; rotY: number; rotZ: number};

/**
 * Proiezione di un punto dello SCHERMO del telefono (coordinate PHONE_SCREEN, origine in alto a sinistra)
 * sul fotogramma, con la stessa catena di trasformazioni CSS del Phone (scale · rotX · rotY · rotZ + prospettiva).
 */
export const projectPhone = (p: PhonePose, sx: number, sy: number): {x: number; y: number; k: number} => {
	let X = sx - PHONE_SCREEN.w / 2;
	let Y = sy - PHONE_SCREEN.h / 2;
	let Z = 0;
	const rz = p.rotZ * DEG;
	[X, Y] = [X * Math.cos(rz) - Y * Math.sin(rz), X * Math.sin(rz) + Y * Math.cos(rz)];
	const ry = p.rotY * DEG;
	[X, Z] = [X * Math.cos(ry) + Z * Math.sin(ry), -X * Math.sin(ry) + Z * Math.cos(ry)];
	const rx = p.rotX * DEG;
	[Y, Z] = [Y * Math.cos(rx) - Z * Math.sin(rx), Y * Math.sin(rx) + Z * Math.cos(rx)];
	const k = PERSP / (PERSP - Z);
	return {x: p.x + X * p.scale * k, y: p.y + Y * p.scale * k, k: p.scale * k};
};

/** Layout della schermata di blocco (coordinate schermo). */
export const LS = {
	cardX: 20,
	cardY: 318,
	cardW: PHONE_SCREEN.w - 40,
	cardHCollapsed: 158,
	cardHExpanded: 238,
	btnTop: 156, // relativo alla card
	btnH: 62,
	clockCY: 222,
} as const;

/** Punto di contatto sul pulsante "Verifica subito" (coordinate schermo). */
export const TAP_POINT = {x: PHONE_SCREEN.w / 2 + 22, y: LS.cardY + LS.btnTop + LS.btnH / 2 + 2};
/** Centro della card: bersaglio del tuffo finale. */
export const CARD_CENTER = {x: PHONE_SCREEN.w / 2, y: LS.cardY + LS.cardHExpanded / 2 + 8};

/** Scossa di camera dopo il tocco (deterministica). */
export const shake = (f: number): {dx: number; dy: number; dr: number} => {
	if (f < H.tap) return {dx: 0, dy: 0, dr: 0};
	const amp = Math.exp(-(f - H.tap) / 5.5);
	const n = (s: number) => (hash(f, s) - 0.5) * 2;
	return {dx: n(11) * 18 * amp, dy: n(12) * 14 * amp, dr: n(13) * 0.9 * amp};
};

/** Posa "di base" del telefono: lenta spinta in avanti con leggero angolo 3D, poi scossa. */
const basePose = (f: number): PhonePose => {
	const push = ease.inOutSine(clamp(f / 74));
	const s = shake(f);
	return {
		x: 540 + Math.sin(f / 26) * 6 + s.dx,
		y: 772 - 10 * push + Math.cos(f / 31) * 4 + s.dy,
		scale: lerp(1.235, 1.345, push),
		rotX: lerp(9, 4.5, push),
		rotY: lerp(-13, -6.5, push),
		rotZ: lerp(-2.2, -0.8, push) + s.dr,
	};
};

/** Avanzamento del tuffo nello schermo (0..1, accelera). */
export const diveP = (f: number): number => ease.inCubic(invLerp(H.diveFrom, H.end + 1, f));

/** Posa del telefono nel frame f: base + tuffo verso la card (la card arriva al centro e riempie il quadro). */
export const phonePose = (f: number): PhonePose => {
	const b = basePose(f);
	const d = diveP(f);
	if (d <= 0) return b;
	const b0 = basePose(H.diveFrom);
	const c0 = projectPhone(b0, CARD_CENTER.x, CARD_CENTER.y);
	const scale = lerp(b.scale, 5.6, d);
	const rotX = lerp(b.rotX, 0, d);
	const rotY = lerp(b.rotY, 0, d);
	const rotZ = lerp(b.rotZ, 0, d);
	// il centro della card scivola verso il centro del quadro mentre la scala cresce
	const offX = CARD_CENTER.x - PHONE_SCREEN.w / 2;
	const offY = CARD_CENTER.y - PHONE_SCREEN.h / 2;
	// correzione della prospettiva iniziale (svanisce col tuffo): nessun salto al frame di partenza
	const corrX = c0.x - (b0.x + offX * b0.scale);
	const corrY = c0.y - (b0.y + offY * b0.scale);
	const cx = lerp(c0.x, 540, ease.outCubic(d));
	const cy = lerp(c0.y, 760, ease.outCubic(d));
	return {
		x: cx - offX * scale - corrX * (1 - d) + b.x - b0.x,
		y: cy - offY * scale - corrY * (1 - d) + b.y - b0.y,
		scale,
		rotX,
		rotY,
		rotZ,
	};
};

/** Velocità relativa di zoom (per il motion blur del tuffo). */
export const zoomSpeed = (f: number): number => {
	const a = phonePose(f).scale;
	const b = phonePose(f + 1).scale;
	return Math.max(0, (b - a) / a);
};

/** Intensità dell'allarme rosso dopo il tocco. */
export const alarmP = (f: number): number => prog(f, H.tap + 2, 8, ease.outCubic);

/** Angolo del dito (gradi): entra dal basso a destra e punta in alto a sinistra. */
export const FINGER_ANGLE = -50;
const BX = Math.sin(-FINGER_ANGLE * DEG); // direzione del corpo del dito (verso la mano)
const BY = Math.cos(-FINGER_ANGLE * DEG);
/** Distanza tra la punta e il centro del polpastrello (è il polpastrello a toccare il pulsante). */
const PAD = 38;

/** Distanza (px, lungo l'asse del dito) dal punto di contatto: avvicinamento lento, esitazione, pressione decisa. */
const fingerDist = (f: number): number => {
	if (f < H.fingerIn) return 1200;
	if (f < H.hover) return lerp(1080, 118, ease.outCubic(invLerp(H.fingerIn, H.hover, f)));
	if (f < H.press) return lerp(118, 142, ease.inOutSine(invLerp(H.hover, H.press, f))); // anticipazione: si ritrae appena
	if (f < H.tap) return lerp(142, 0, ease.inQuart(invLerp(H.press, H.tap, f))); // pressione decisa
	if (f < H.tap + 4) return -4 * ease.outCubic(invLerp(H.tap, H.tap + 2, f));
	return lerp(-4, 1100, ease.inCubic(invLerp(H.tap + 4, H.tap + 18, f)));
};

export type FingerState = {x: number; y: number; angle: number; h: number; prox: number; press: number; opacity: number};

/** Stato del dito nel frame f (segue il pulsante proiettato, quindi il contatto a 60 è esatto). */
export const fingerState = (f: number, pose: PhonePose): FingerState => {
	const t = projectPhone(pose, TAP_POINT.x, TAP_POINT.y);
	const d = fingerDist(f);
	// leggero arco d'ingresso (laterale) e micro-tremolio di esitazione
	const lat = f < H.hover ? 80 * (1 - ease.outCubic(invLerp(H.fingerIn, H.hover, f))) : 0;
	const tremble = f >= H.hover && f < H.press ? Math.sin(f * 1.7) * 1.4 : 0;
	const nx = -BY;
	const ny = BX;
	return {
		x: t.x - BX * PAD + BX * d + nx * (lat + tremble),
		y: t.y - BY * PAD + BY * d + ny * (lat + tremble),
		angle: FINGER_ANGLE,
		h: clamp(d / 170),
		prox: clamp(1 - Math.max(0, d) / 330) * (f < H.tap + 6 ? 1 : 0.4),
		press: f >= H.tap && f < H.tap + 5 ? 1 - (f - H.tap) / 5 : 0,
		opacity: f < H.fingerIn ? 0 : 1 - clamp((f - (H.tap + 12)) / 6),
	};
};
