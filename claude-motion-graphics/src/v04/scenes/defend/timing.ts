import {V4_CUES, V4_SCENES} from '../../timeline';

const at = (abs: number): number => abs - V4_SCENES.defend.start;

/** Frame LOCALI della scena DIFESA (0 = assoluto 510). I multipli di 15 cadono sul beat. */
export const D = {
	shield: at(V4_CUES.shield), // 0   · lo scudo si disegna, onda protettiva
	tip1: at(V4_CUES.tip1), //     15  · controlla il dominio
	check1: 45, //                 555 · spunta 1 (beat)
	tip2: at(V4_CUES.tip2), //     60  · non aprire link sospetti
	check2: 90, //                 600 · spunta 2 (beat)
	tip3: at(V4_CUES.tip3), //     120 · autenticazione a più fattori
	check3: 150, //                660 · spunta 3 (beat)
	all: 165, //                   675 · scudo carico al 100% (beat)
	absorb: 176, //                le card vengono assorbite dallo scudo
	threat: 182, //                il messaggio fraudolento rientra dal basso
	lock: 195, //                  705 · mirino agganciato (beat)
	glitch: 201, //                glitch controllato sul messaggio
	strike: 204, //                lo scudo parte verso il messaggio
	end: V4_SCENES.defend.length, // 210 = impatto (frame 0 del finale)
} as const;

/** Layout della pila di card (px assoluti). Tutto sopra la fascia dei sottotitoli (y ≤ 1250). */
export const STACK = {
	left: 80,
	width: 920,
	top: 598,
	gap: 16,
	rowH: 96, // card compatta (solo icona + titolo + spunta)
	pad: 28,
} as const;

/** Pose dello scudo nella scena. */
export const SHIELD_POSE = {
	intro: {x: 540, y: 520, s: 1},
	head: {x: 540, y: 394, s: 0.56},
	wind: {x: 540, y: 352, s: 0.62},
} as const;
