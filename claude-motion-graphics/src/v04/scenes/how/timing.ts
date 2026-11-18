import {ease, lerp, prog} from '../../../lib/math';

/**
 * Tempi della scena HOW (frame LOCALI; assoluto = locale + 270). Beat locali = multipli di 15.
 * 5 passi sui cue 0 / 45 / 90 / 135 / 180 (abs 270 / 315 / 360 / 405 / 450).
 */
export const CUE = [0, 45, 90, 135, 180] as const;

export const STEPS = [
	{n: '01', text: 'RICEVE IL MESSAGGIO'},
	{n: '02', text: 'APRE IL COLLEGAMENTO'},
	{n: '03', text: 'PAGINA DI ACCESSO CONTRAFFATTA'},
	{n: '04', text: 'INSERISCE LE CREDENZIALI'},
	{n: '05', text: "I DATI ARRIVANO ALL'ATTACCANTE"},
] as const;

export const T = {
	touchIn: 26, //    il dito entra (anticipazione del tocco)
	tap: 45, //        CUE 2 · tocco su "Verifica subito"
	emerge: 12, //     durata dell'apertura della finestra dal punto toccato
	addrIn: 48, //     l'indirizzo compare nella barra
	loadStart: 51,
	loadEnd: 87,
	page: 90, //       CUE 3 · la pagina falsa si disegna (glitch)
	tag: 104, //       etichetta "PAGINA FALSA" (beat 105)
	antic: 118, //     piccolo arretramento prima della spinta
	pushStart: 124,
	pushEnd: 135, //   CUE 4 · camera sul modulo, parte la digitazione
	emailEnd: 149,
	pwFocus: 150, //   beat · fuoco sulla password
	pwEnd: 161,
	press: 165, //     beat · "Accedi"
	busy: 166, //      "Accesso in corso…"
	steal: 180, //     CUE 5 · i dati si staccano (glitch)
	travelStart: 181,
	travelEnd: 195, // beat · arrivo dall'attaccante
	pulse: 210, //     beat · accento scuro
	collapse: 226, //  tutto collassa
	end: 239,
} as const;

/** Indice del passo attivo (0..4). */
export const stepAt = (f: number): number => {
	let i = 0;
	for (let k = 0; k < CUE.length; k++) if (f >= CUE[k]) i = k;
	return i;
};

/** Centro dello schermo usato dalla camera (centro dell'area utile 400–1250). */
export const SC = {x: 540, y: 826} as const;
/** Posizioni nel "mondo": finestra del browser, punto di fuoco sul modulo, attaccante (più in basso). */
export const WIN_C = {x: 540, y: 826} as const;
export const FORM_FY = 975;
export const FORM_Z = 1.12;
export const ATK_C = {x: 540, y: 1840} as const;

export type Cam = {fx: number; fy: number; z: number};

/** Camera: lieve avvicinamento sulla pagina, spinta sul modulo (124–135), viaggio verso l'attaccante (181–195). */
export const camAt = (f: number): Cam => {
	const settle = 0.018 * prog(f, T.page, 28, ease.inOutSine);
	const antic = 0.014 * prog(f, T.antic, 6, ease.outQuad) * (1 - prog(f, T.pushStart, 5, ease.inQuad));
	const push = prog(f, T.pushStart, T.pushEnd - T.pushStart, ease.inOutCubic);
	const creep = 0.03 * prog(f, T.pushEnd, 45, ease.inOutSine);
	const travel = prog(f, T.travelStart, T.travelEnd - T.travelStart, ease.inOutCubic);
	const drift = 0.035 * prog(f, T.travelEnd, 44, ease.outQuad);
	const fy = lerp(lerp(WIN_C.y, FORM_FY, push), ATK_C.y, travel);
	const z = lerp(lerp(1 + settle - antic, FORM_Z, push) + creep, 1, travel) + drift;
	return {fx: 540, fy, z};
};

export const toScreen = (cam: Cam, wx: number, wy: number): {x: number; y: number} => ({
	x: SC.x + (wx - cam.fx) * cam.z,
	y: SC.y + (wy - cam.fy) * cam.z,
});

/** Velocità verticale della camera sullo schermo (px/frame), per il motion blur. */
export const camSpeed = (f: number): number => {
	const a = camAt(f);
	const b = camAt(f - 1);
	return Math.abs((a.fy - b.fy) * a.z) + Math.abs(a.z - b.z) * 800;
};
