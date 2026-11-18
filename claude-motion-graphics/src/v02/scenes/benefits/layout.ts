/**
 * BENEFITS — layout e tempi condivisi dalle tre sequenze (frame RELATIVI alla scena: 0 = assoluto 510).
 * Beat ogni 15 frame: 0, 15, 30 … 210. I cue V2_CUES cadono su 0 (privacy), 75 (offline), 150 (controllo).
 */
export const CX = 540;

export const Y = {
	index: 262, //     "01 / 03"
	icon: 650, //      centro dell'illustrazione
	keyword: 1000, //  parola chiave (Space Grotesk 700)
	qualifier: 1090, // qualificatore (mono)
	note: 1150, //     nota a piè di pagina (solo OFFLINE)
} as const;

/** Inizio di ogni sequenza (= cue musicale). */
export const T = {
	privacy: 0,
	offline: 75,
	control: 150,
	end: 210,
} as const;

/** Transizioni. */
export const TR = {
	// PRIVACY → OFFLINE: whip orizzontale
	whipOut: 66, //    inizio uscita (accelera verso sinistra)
	whipOutEnd: 75,
	whipIn: 73, //     l'OFFLINE entra da destra e "atterra" sul cue
	whipInDur: 6,
	// OFFLINE → CONTROLLO: la barra del Wi‑Fi spento si allunga e taglia la scena in due
	slashExtend: 136,
	split: 142,
	splitDur: 14,
	// fine scena: tutto implode in un punto (il CutFlash globale colpisce a 720, y 700)
	implode: 195,
	implodeEnd: 209,
} as const;

/** Punto di implosione finale (allineato al CutFlash globale del frame 720). */
export const IMPLODE = {x: CX, y: 700} as const;

/** Linea del taglio diagonale ("\"): passa per il centro dell'icona Wi‑Fi. */
export const SLASH = {
	c: {x: CX, y: 650},
	d: {x: Math.SQRT1_2, y: Math.SQRT1_2}, // direzione della linea
	n: {x: Math.SQRT1_2, y: -Math.SQRT1_2}, // normale (verso l'alto a destra)
	half: 268, // mezza lunghezza della barra sull'icona
} as const;
