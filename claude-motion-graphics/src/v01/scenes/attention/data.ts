import {hash} from '../../../lib/math';
import {V1_TOKENS} from '../../timeline';

/**
 * Dati ILLUSTRATIVI della scena ATTENTION (nessun modello reale): vettori di embedding e pesi di attenzione.
 * I pesi rispettano l'attenzione causale dei modelli GPT: ogni token guarda solo se stesso e i token PRECEDENTI.
 */
export const TOKENS = V1_TOKENS;
export const N_TOK = TOKENS.length;

/** Due righe: "Come ·fa ·Chat GPT ·a ·sap" / "ere ·tutte ·queste ·cose ?". */
export const ROWS: number[][] = [
	[0, 1, 2, 3, 4, 5],
	[6, 7, 8, 9, 10],
];
export const ROW_OF: number[] = TOKENS.map((_, i) => (ROWS[0].includes(i) ? 0 : 1));

/** Valori mostrati per ogni vettore (in realtà sono migliaia). */
export const DIMS = 7;

/** Token con la colonna di numeri completa (gli altri: solo barre di calore). ·Chat, ·sap, ere, ·queste */
export const KEY_TOKENS = [2, 5, 6, 8];

const MANUAL: Record<number, number[]> = {
	2: [0.12, -0.87, 0.45, 0.03, -0.31, 0.68, -0.14],
	5: [-0.52, 0.27, 0.91, -0.08, 0.36, -0.73, 0.19],
	6: [0.64, -0.21, 0.07, -0.95, 0.42, 0.15, -0.38],
	8: [-0.16, 0.58, -0.44, 0.29, 0.81, -0.06, 0.33],
};

/** Valore j del vettore del token t (in [-1, 1], due decimali). */
export const embValue = (t: number, j: number): number => {
	const m = MANUAL[t];
	if (m) return m[j];
	const v = (hash(t + 17, j + 5) * 2 - 1) * 0.97;
	const s = Math.sign(v) || 1;
	return Math.round(s * Math.max(0.04, Math.abs(v)) * 100) / 100;
};

/** Valore "in calcolo" (sfarfallio prima di stabilizzarsi). */
export const flickerValue = (t: number, j: number, f: number): number =>
	Math.round((hash(t * 31 + j * 7, Math.floor(f / 2) + 101) * 2 - 1) * 99) / 100;

/** Formato italiano a larghezza fissa: " 0,45" / "−0,87". */
export const fmtVal = (v: number): string => `${v < 0 ? '−' : ' '}${Math.abs(v).toFixed(2).replace('.', ',')}`;
export const fmtWeight = (w: number): string => w.toFixed(2).replace('.', ',');

export type Focus = {
	/** token "che guarda" (query) */
	q: number;
	/** frame locale di accensione */
	at: number;
	/** frame locale di inizio uscita */
	out: number;
	/** peso verso ogni token 0..q (somma = 1, incluso se stesso) */
	w: number[];
	/** token i cui pesi sono scritti sugli archi */
	labels: number[];
};

/**
 * 1) "·sap" (inizio di "sapere") guarda soprattutto "Chat"/"GPT": chi sa?
 * 2) "·cose" guarda "tutte"/"queste" (e "sapere"): il calcolo si ripete per ogni token.
 */
export const FOCUS: Focus[] = [
	{q: 5, at: 90, out: 129, w: [0.08, 0.07, 0.27, 0.41, 0.06, 0.11], labels: [3, 2]},
	{q: 9, at: 135, out: 150, w: [0.03, 0.02, 0.06, 0.05, 0.02, 0.12, 0.11, 0.21, 0.33, 0.05], labels: [8, 7]},
];
