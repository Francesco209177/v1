import {PROMPT_TEXT} from '../../lib/code';
import {clamp, hash} from '../../lib/math';
import {CUES, SCENES} from '../../timeline';

/** Frame assoluto -> frame locale della scena 2. */
const local = (abs: number): number => abs - SCENES.idea.start;

/** Tempi chiave della scena (frame LOCALI; assoluto = locale + 120). */
export const T = {
	// — lo spark prende vita
	anticEnd: 5, //     fine dell'anticipazione (si contrae e carica la rotazione)
	flightLen: 15, //   durata del volo verso l'alto
	land: local(CUES.typingStart), // 15 · atterra sul beat: bagliore + primo tasto
	spinEnd: 24, //     la rotazione di 360° è conclusa (rotazione = 0 esatto)
	// — la finestra
	lineIn: 4, //       la linea di luce si disegna dal centro
	unfold: 9, //       la linea si apre nella finestra
	unfoldLen: 12,
	boxIn: 12, //       entra il campo del prompt
	// — battitura (i tick della musica vanno da 15 a 75)
	typeStart: local(CUES.typingStart), // 15
	typeEnd: 69,
	bullets: [71, 75, 79] as readonly number[], // la seconda cade sul beat 13
	bulletLen: 5,
	keyArm: 84, //      il tasto INVIO si accende (anticipazione)
	// — invio: il prompt diventa codice
	submit: local(CUES.promptToCode), // 90 · colpo musicale
	rowT0: 97.5, //     prima riga di codice (due sedicesimi dopo il colpo)
	rowStep: 2.2, //    ritardo tra una riga e la successiva
	sweep: 3, //        velocità del fronte luminoso (colonne per frame)
	flashLen: 7, //     dissolvenza del bianco caldo verso il colore di sintassi
	statusIn: 93,
	statusOut: 123,
	captionIn: 22,
	captionOut: 127,
	calm: 136, //       da qui il quadro è già identico allo stato di confine
	hold: 138, //       stato di confine letterale (consegnato alla scena 3)
} as const;

/** 1 → 0 negli ultimi frame: moltiplica ogni "reazione" così che a `calm` sia tutto esattamente a riposo. */
export const settle = (frame: number): number => 1 - clamp((frame - (T.calm - 9)) / 9);

/**
 * Istante di battitura di ogni carattere del prompt: ritmo umano (raffiche dentro le parole,
 * piccola pausa prima di ogni parola) ma deterministico.
 */
export const KEY_TIMES: readonly number[] = (() => {
	const acc: number[] = [];
	let sum = 0;
	for (let i = 0; i < PROMPT_TEXT.length; i++) {
		if (i > 0) sum += 0.65 + hash(i, 31) * 0.85 + (PROMPT_TEXT[i - 1] === ' ' ? 0.9 : 0);
		acc.push(sum);
	}
	return acc.map((v) => T.typeStart + (v / sum) * (T.typeEnd - T.typeStart));
})();

/** Quanti caratteri del prompt sono già stati digitati. */
export const typedCount = (frame: number): number => {
	let n = 0;
	while (n < KEY_TIMES.length && KEY_TIMES[n] <= frame) n++;
	return n;
};
