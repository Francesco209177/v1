import {clamp, lerp} from '../../../lib/math';
import {V2_CUES} from '../../timeline';

/** Frame dello strappo del cavo (cue musicale). */
export const UNPLUG = V2_CUES.unplug; // 30
export const DIVE = V2_CUES.diveIn; // 90

/** Domanda dell'utente (già inviata a frame 0). */
export const QUESTION = 'Come funziona un modello AI in locale?';

/** Risposta dell'AI: righe fisse (layout deterministico), l'ultima è la "punchline". */
export const ANSWER: string[][] = [
	['Il', 'modello', 'è', 'installato', 'sul', 'tuo', 'computer:'],
	['è', 'il', 'tuo', 'hardware', 'a', 'generare', 'la', 'risposta,'],
	['parola', 'per', 'parola.'],
	['Anche', 'senza', 'connessione.'],
];
export const ANSWER_WORDS = ANSWER.flat();
export const PUNCH_FROM = ANSWER_WORDS.length - 3;

/**
 * Frame di comparsa di ogni parola: prima riga prima dello strappo, breve esitazione,
 * poi lo streaming RIPRENDE dopo lo strappo (il punto del video).
 */
export const wordAt = (i: number): number => {
	const first = ANSWER[0].length;
	if (i < first) return -8 + i * 4.6;
	return UNPLUG + 3 + (i - first) * 2.6;
};

/** Spostamento del connettore (px lungo la scrivania): tensione, strappo, rimbalzo. */
const PLUG_KEYS: [number, number][] = [
	[25, 0],
	[27, 2],
	[29, 5],
	[30, 104],
	[31, 168],
	[32, 196],
	[33, 208],
	[34, 211],
	[35, 207],
	[36, 201],
	[37, 199],
	[38, 200],
];
export const plugOut = (f: number): number => {
	if (f <= PLUG_KEYS[0][0]) return 0;
	for (let i = 1; i < PLUG_KEYS.length; i++) {
		const [f1, v1] = PLUG_KEYS[i];
		if (f <= f1) {
			const [f0, v0] = PLUG_KEYS[i - 1];
			return lerp(v0, v1, clamp((f - f0) / (f1 - f0)));
		}
	}
	return 200;
};

/** LED di rete: acceso, poi sfarfallio e spento allo strappo. */
export const linkLed = (f: number): number => {
	if (f < UNPLUG) return 1;
	const seq = [0, 0.7, 0, 0.3, 0];
	return seq[Math.min(seq.length - 1, Math.floor(f - UNPLUG))];
};

/** 0 = online, 1 = offline (cambio secco allo strappo, con glitch nei frame successivi). */
export const offlineAt = (f: number): number => (f >= UNPLUG ? 1 : 0);
