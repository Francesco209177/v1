import {BOX} from './layout';
import {T} from './timing';

/** Richiesta e risposta d'esempio (generiche, in italiano). */
export const PROMPT_TEXT = 'Riassumi le note';
export const ANSWER_LABEL = 'RISPOSTA GENERATA IN LOCALE';
export const ANSWER_TOKENS = ['Ecco', ' i', ' 3', ' punti', ' chiave', ' delle', ' tue', ' note…'];

export const ANSWER_FONT = 34;
export const ANSWER_PAD_X = 40;
/** Larghezza media stimata di un carattere Inter a 34 px (solo per il bersaglio delle particelle). */
const CHAR_W = ANSWER_FONT * 0.52;

export const ANSWER_TEXT_Y = BOX.answer.y + 22;
export const ANSWER_LEFT = BOX.answer.x - BOX.answer.w / 2 + ANSWER_PAD_X;

/**
 * Ogni token parte dalla rete poco prima del colpo e atterra nel fumetto:
 * il primo tocca terra esattamente su T.answer (frame 150 = assoluto 420).
 */
export const answerSlot = (i: number): {x: number; y: number; launch: number; flight: number; land: number} => {
	const before = ANSWER_TOKENS.slice(0, i).join('').length;
	const len = ANSWER_TOKENS[i].length;
	const flight = 7;
	const land = T.answer + i;
	return {
		x: ANSWER_LEFT + (before + len / 2) * CHAR_W,
		y: ANSWER_TEXT_Y,
		launch: land - flight,
		flight,
		land,
	};
};
