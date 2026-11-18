/**
 * VIDEO 02 — "Un'intelligenza artificiale senza Internet?"
 * Timeline unica: 120 BPM @ 30 fps (1 beat = 15 frame), tagli sui beat, allineata alla voce narrante.
 */
export const V2_DURATION = 900; // 30 s

export type Range = {start: number; end: number; length: number};
const r = (start: number, end: number): Range => ({start, end, length: end - start});

export const V2_SCENES = {
	hook: r(0, 105), //       0–3,5 s  · chat sul laptop, il cavo viene scollegato, la conversazione continua
	secret: r(105, 270), //   3,5–9 s  · dentro il computer: il modello è una rete neurale luminosa
	how: r(270, 510), //      9–17 s   · memoria → CPU/GPU → rete neurale: tutto in locale
	benefits: r(510, 720), // 17–24 s  · privacy · offline · controllo
	reveal: r(720, 900), //   24–30 s  · il computer scollegato continua a funzionare · titolo · domanda finale
} as const;

/** Cue condivisi (frame ASSOLUTI): la musica mette un evento udibile su ciascuno. */
export const V2_CUES = {
	unplug: 30, //        1,0 s · il connettore RJ45 si stacca (scintilla, "OFFLINE")
	diveIn: 90, //        3,0 s · la camera inizia a entrare nello schermo
	inside: 105, //       3,5 s · siamo dentro: la rete neurale si accende
	modelLoaded: 210, //  7,0 s · il modello è "installato" (file verificato)
	howStart: 270, //     9,0 s · groove pieno: il flusso dei dati
	answer: 420, //       14,0 s · la risposta generata esce dalla rete
	privacy: 510, //      17,0 s
	offline: 585, //      19,5 s
	control: 660, //      22,0 s
	reveal: 720, //       24,0 s · ritorno al computer, impatto
	title: 750, //        25,0 s · "LA TUA AI. SUL TUO COMPUTER."
	question: 855, //     28,5 s · "Tu la useresti?"
} as const;

/** Voce narrante definitiva (ElevenLabs "Enea"; secondi misurati dal mixer). Testi = sottotitoli. Clip in public/v02/vo_enea/. */
export const V2_VO = [
	{file: 'vo_01', start: 0.05, end: 4.05, text: "E se ti dicessi che puoi usare l'intelligenza artificiale senza Internet?"},
	{file: 'vo_02', start: 4.15, end: 7.98, text: 'Il segreto è installare il modello direttamente sul tuo computer.'},
	{file: 'vo_03', start: 9.3, end: 14.45, text: 'Il tuo hardware esegue il modello localmente, elaborando richieste e generando risposte.'},
	{file: 'vo_04', start: 17.0, end: 19.48, text: 'I tuoi dati possono restare sul dispositivo.'},
	{file: 'vo_05', start: 19.6, end: 21.38, text: 'Niente connessione necessaria,'},
	{file: 'vo_06', start: 22.1, end: 23.06, text: 'più controllo.'},
	{file: 'vo_07', start: 24.2, end: 28.5, text: "Il futuro dell'intelligenza artificiale potrebbe essere proprio sulla tua scrivania."},
	{file: 'vo_08', start: 28.6, end: 29.63, text: 'Tu la useresti?'},
] as const;

/** Zone sicure Reels (come il video 01). I sottotitoli stanno attorno a y = 1380. */
export const V2_SUB_Y = 1390;

/**
 * Posa della rete neurale al taglio Segreto → Come funziona (frame 270): l'ultima frame di V2Secret e la prima
 * di V2How la disegnano identica. Rotazione continua condivisa: yaw = frameAssoluto / 90 (radianti).
 */
export const V2_NET_AT_270 = {cx: 540, cy: 760, scale: 0.95, pitch: -0.18, dist: 1400, reveal: 1, activity: 0.55} as const;
export const v2NetYaw = (absFrame: number): number => absFrame / 90;

/** Posa del laptop nel finale (V2Reveal), speculare all'apertura: stesso oggetto, cavo staccato sulla scrivania. */
export const V2_LAPTOP_HOME = {x: 540, y: 640, scale: 0.95, rotX: 14, rotY: -14} as const;
