import {ease, invLerp, lerp} from '../../../lib/math';
import {LAPTOP} from '../../components/Laptop';
import {V2_LAPTOP_HOME} from '../../timeline';

/** Posa del laptop (stessi parametri del componente condiviso). */
export type LaptopPose = {x: number; y: number; scale: number; rotX: number; rotY: number};

/** Centro del "tuffo" nello schermo: lì nasce la luce e, nella scena dopo, la rete neurale. */
export const DIVE_CENTER = {x: 540, y: 620} as const;

// Fotogrammi chiave della camera (frame della scena HOOK = frame assoluti).
const P0: LaptopPose = {...V2_LAPTOP_HOME};
// gru verso l'alto sulla porta: camera alta (rotX < 0) per leggere connettore e cavo sulla scrivania
const PORT: LaptopPose = {x: 230, y: 480, scale: 1.3, rotX: -22, rotY: -32};
const SCREEN: LaptopPose = {x: 530, y: 662, scale: 1.2, rotX: 6, rotY: -13};
const PUSH: LaptopPose = {x: 540, y: 652, scale: 1.28, rotX: 4, rotY: -9};
const PRE: LaptopPose = {x: 540, y: 648, scale: 1.2, rotX: 2, rotY: -4};
const DIVE: LaptopPose = {x: DIVE_CENTER.x, y: DIVE_CENTER.y, scale: 7.5, rotX: 0, rotY: 0};

const mix = (a: LaptopPose, b: LaptopPose, t: number): LaptopPose => ({
	x: lerp(a.x, b.x, t),
	y: lerp(a.y, b.y, t),
	scale: lerp(a.scale, b.scale, t),
	rotX: lerp(a.rotX, b.rotX, t),
	rotY: lerp(a.rotY, b.rotY, t),
});

/**
 * Da questo frame in poi il coperchio viene disegnato in 2D (ScreenProxy): il rendering CSS 3D di Chrome
 * ritaglia il coperchio quando la scala diventa molto grande.
 */
export const PROXY_FROM = 92;

/** Camera del HOOK: avvicinamento alla porta, strappo, ritorno sullo schermo, tuffo dentro. */
export const hookPose = (f: number): LaptopPose => {
	let p = mix(P0, PORT, ease.inOutCubic(invLerp(0, 27, f)));
	// lieve "creep" sulla porta prima dello strappo
	p = {...p, scale: p.scale * (1 + 0.012 * ease.inOutSine(invLerp(24, 30, f)))};
	p = mix(p, SCREEN, ease.inOutCubic(invLerp(39, 64, f)));
	p = mix(p, PUSH, ease.inOutSine(invLerp(62, 84, f)));
	// anticipazione: piccolo arretramento prima del tuffo (cue 90)
	p = mix(p, PRE, ease.outCubic(invLerp(81, 90, f)));
	// tuffo: rotazioni che si raddrizzano, zoom esponenziale accelerato
	const d = invLerp(90, 104, f);
	if (d > 0) {
		const r = ease.outCubic(d);
		const s = Math.exp(lerp(Math.log(p.scale), Math.log(DIVE.scale), ease.inQuad(d)));
		p = {...mix(p, DIVE, r), scale: s};
	}
	// rotazioni ESATTAMENTE nulle da PROXY_FROM: lo schermo diventa un piano 2D (vedi ScreenProxy)
	const flat = 1 - ease.inOutCubic(invLerp(84, PROXY_FROM, f));
	p = {...p, rotX: p.rotX * flat, rotY: p.rotY * flat};
	// scossa della camera allo strappo
	const k = f >= 30 ? Math.exp(-(f - 30) / 3.2) : 0;
	return {...p, x: p.x + 9 * k * Math.sin((f - 30) * 2.7 + 0.6), y: p.y + 6 * k * Math.cos((f - 30) * 3.4)};
};

/** Velocità di zoom normalizzata (0..1) per motion blur e scie. */
export const zoomSpeed = (f: number): number => {
	const a = hookPose(f).scale;
	const b = hookPose(f - 1).scale;
	return Math.max(0, Math.log(a / b));
};

const PERSP = 2400;
const D2R = Math.PI / 180;

/**
 * Proietta un punto del gruppo 3D del laptop (origine = centro schermo, x→destra, y→giù, z→osservatore)
 * replicando esattamente le trasformazioni CSS del componente condiviso (scale·rotateX·rotateY + perspective).
 */
export const projectLaptop = (pose: LaptopPose, p: {x: number; y: number; z: number}): {x: number; y: number; k: number} => {
	const ay = pose.rotY * D2R;
	const ax = pose.rotX * D2R;
	const x1 = p.x * Math.cos(ay) + p.z * Math.sin(ay);
	const z1 = -p.x * Math.sin(ay) + p.z * Math.cos(ay);
	const y2 = p.y * Math.cos(ax) - z1 * Math.sin(ax);
	const z2 = p.y * Math.sin(ax) + z1 * Math.cos(ax);
	const k = PERSP / (PERSP - z2);
	return {x: pose.x + x1 * pose.scale * k, y: pose.y + y2 * pose.scale * k, k: k * pose.scale};
};

/** Punto sul piano della base/scrivania (coordinate locali del div della base, px). */
export const baseToGroup = (bx: number, by: number, lift = 0): {x: number; y: number; z: number} => {
	const t = LAPTOP.baseTilt * D2R;
	const hingeY = LAPTOP.lidH / 2 - 6;
	// "lift" = sollevamento perpendicolare al piano della base (verso l'alto)
	return {x: -LAPTOP.baseW / 2 + bx, y: hingeY + by * Math.cos(t) - lift * Math.sin(t), z: by * Math.sin(t) + lift * Math.cos(t)};
};

/** Punto sullo schermo (coordinate locali 740×470, origine in alto a sinistra). */
export const screenToGroup = (sx: number, sy: number): {x: number; y: number; z: number} => ({
	x: -LAPTOP.screenW / 2 + sx,
	y: -LAPTOP.screenH / 2 + sy,
	z: 0,
});

/** Porta Ethernet e connettore sul piano della base. */
export const PORT_LOCAL = {x: LAPTOP.baseW - 2, y: 172} as const;
