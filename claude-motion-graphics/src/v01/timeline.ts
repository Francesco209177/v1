/**
 * VIDEO 01 — "Come funziona davvero ChatGPT?"
 * Timeline: 120 BPM @ 30 fps (1 beat = 15 frame), tagli sui beat, allineata alla voce narrante.
 */
export const V1_DURATION = 900; // 30 s

export type Range = {start: number; end: number; length: number};
const r = (start: number, end: number): Range => ({start, end, length: end - start});

export const V1_SCENES = {
	hook: r(0, 90), //          0–3 s   · schermata scura, la domanda viene digitata, la camera entra nello schermo
	tokens: r(90, 270), //      3–9 s   · le parole si scompongono in token luminosi che attraversano la rete neurale
	attention: r(270, 480), //  9–16 s  · ogni token diventa numeri; l'attenzione pesa le parole nel contesto
	predict: r(480, 690), //    16–23 s · probabilità del token successivo: la risposta si compone un token alla volta
	reveal: r(690, 900), //     23–30 s · addestramento su enormi quantità di testo · "NON PENSA. PREVEDE." · può sbagliare
} as const;

/** Cue condivisi (frame ASSOLUTI): la musica mette un evento udibile su ciascuno. */
export const V1_CUES = {
	typeStart: 6, //      0,2 s · inizia la digitazione della domanda
	questionDone: 45, //  1,5 s · la domanda è completa (punto interrogativo)
	diveIn: 60, //        2,0 s · la camera inizia a entrare nello schermo
	inside: 90, //        3,0 s · dentro: la domanda galleggia nello spazio
	split: 180, //        6,0 s · la frase si spezza in token
	intoNet: 225, //      7,5 s · i token entrano nella rete neurale
	vectors: 300, //      10,0 s · i token diventano liste di numeri
	attention: 360, //    12,0 s · si accendono le connessioni di attenzione
	predictStart: 480, // 16,0 s · le probabilità del token successivo
	pick: 525, //         17,5 s · scelto il token più probabile
	loop: 600, //         20,0 s · la risposta cresce un token alla volta (ciclo)
	training: 690, //     23,0 s · enormi quantità di testo (addestramento)
	title: 780, //        26,0 s · "NON PENSA. PREVEDE."
	caveat: 840, //       28,0 s · "può sbagliare: verifica le informazioni importanti"
} as const;

/** Voce narrante definitiva (ElevenLabs "Enea"; secondi misurati dal mixer). Testi = sottotitoli. Clip in public/v01/vo_enea/. */
export const V1_VO = [
	{file: 'vo_01', start: 0.1, end: 3.05, text: 'ChatGPT non pensa come un essere umano.'},
	{file: 'vo_02', start: 3.15, end: 5.03, text: 'Ma allora, come risponde?'},
	{file: 'vo_03', start: 5.15, end: 9.1, text: 'Prima, trasforma la tua domanda in token: piccoli pezzi di testo.'},
	{file: 'vo_04', start: 9.25, end: 15.1, text: 'Ogni token diventa una lista di numeri, e la rete calcola quali parole contano di più nel contesto.'},
	{file: 'vo_05', start: 16.15, end: 20.99, text: 'Poi prevede il token più probabile, uno alla volta, fino a comporre la risposta.'},
	{file: 'vo_06', start: 23.05, end: 25.47, text: 'Ha imparato da enormi quantità di testo.'},
	{file: 'vo_07', start: 25.6, end: 29.85, text: 'Non pensa: prevede. E per questo, a volte, può sbagliare.'},
] as const;

/** I sottotitoli stanno attorno a y = 1390 (come nel video 02). */
export const V1_SUB_Y = 1390;

/** La domanda dell'hook e la sua scomposizione in token (esempio illustrativo, non un tokenizer reale). */
export const V1_QUESTION = 'Come fa ChatGPT a sapere tutte queste cose?';
export const V1_TOKENS = ['Come', ' fa', ' Chat', 'GPT', ' a', ' sap', 'ere', ' tutte', ' queste', ' cose', '?'] as const;
/** ID numerici illustrativi mostrati sotto i token. */
export const V1_TOKEN_IDS = [17384, 2311, 13149, 38, 264, 9461, 486, 41902, 36108, 12795, 30] as const;

/** Risposta che si compone token per token nella scena PREDICT. */
export const V1_ANSWER_TOKENS = ['Ho', ' imparato', ' dagli', ' schemi', ' di', ' milioni', ' di', ' testi', '.'] as const;
/** Candidati per il primo token della risposta con probabilità illustrative (somma < 1: il resto è "altro"). */
export const V1_CANDIDATES = [
	{t: 'Ho', p: 0.62},
	{t: 'Grazie', p: 0.14},
	{t: 'Perché', p: 0.09},
	{t: 'Non', p: 0.05},
] as const;

/** Rotazione continua condivisa della rete neurale (stesso oggetto del video 02). */
export const v1NetYaw = (absFrame: number): number => absFrame / 90;
/** Posa della rete neurale al taglio TOKENS → ATTENTION (frame 270). */
export const V1_NET_AT_270 = {cx: 540, cy: 760, scale: 0.95, pitch: -0.18, dist: 1400, reveal: 1, activity: 0.6} as const;
