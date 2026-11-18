import {V4_CUES, V4_SCENES} from '../../timeline';

const at = (abs: number): number => abs - V4_SCENES.finale.start;

/** Frame LOCALI del FINALE (0 = assoluto 720). I multipli di 15 cadono sul beat. */
export const F = {
	impact: at(V4_CUES.destroy), //   0   · lo scudo colpisce: il messaggio va in frantumi
	title: at(V4_CUES.title), //      30  · "PRIMA DI CLICCARE,"
	pensa: 45, //                     765 · "PENSA." (secondo colpo, sul beat)
	sweep: 58, //                     lama di luce sul titolo
	takeover: 102, //                 il titolo sale e si attenua
	question: at(V4_CUES.question), // 120 · "Tu avresti riconosciuto la truffa?"
	note: 136, //                     nota "Esempio fittizio a scopo educativo"
	end: V4_SCENES.finale.length, //  180
} as const;

/** Layout (px assoluti): tutto sopra la fascia dei sottotitoli (y ≤ 1250). */
export const FL = {
	shieldRest: {x: 540, y: 432, s: 0.5},
	shieldEnd: {x: 540, y: 318, s: 0.3},
	titleCenter: 950, // centro del blocco titolo (3 righe)
	titleEnd: 536, // centro del titolo ridotto nel cartello finale
	titleEndScale: 0.4,
	questionY: [770, 906, 1042] as const,
	noteY: 1186,
} as const;
