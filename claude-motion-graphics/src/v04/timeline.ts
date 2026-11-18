/**
 * VIDEO 04 — "Phishing: come possono rubarti le credenziali?"
 * 120 BPM @ 30 fps (1 beat = 15 frame), tagli sui beat, allineata alla voce narrante.
 * ESEMPIO COMPLETAMENTE FITTIZIO: il servizio "Orbyx" non esiste e tutti gli indirizzi usano il dominio
 * riservato ".example" (RFC 2606), che non può essere raggiunto: nessun link funzionante, nessuna credenziale reale.
 */
export const V4_DURATION = 900; // 30 s

export type Range = {start: number; end: number; length: number};
const r = (start: number, end: number): Range => ({start, end, length: end - start});

export const V4_SCENES = {
	hook: r(0, 90), //       0–3 s   · notifica sullo smartphone, il dito si avvicina, lo schermo diventa rosso
	trap: r(90, 270), //     3–9 s   · il messaggio falso; zoom sul collegamento: indirizzo sospetto
	how: r(270, 510), //     9–17 s  · i 5 passi della truffa
	defend: r(510, 720), //  17–24 s · scudo digitale e 3 comportamenti di difesa
	finale: r(720, 900), //  24–30 s · lo scudo distrugge il messaggio · "PRIMA DI CLICCARE, PENSA." · domanda finale
} as const;

/** Cue condivisi (frame ASSOLUTI): la musica mette un evento udibile su ciascuno. */
export const V4_CUES = {
	notification: 6, //   0,2 s · arriva la notifica
	tap: 60, //           2,0 s · il dito tocca "Verifica subito" → lo schermo diventa rosso
	message: 105, //      3,5 s · il messaggio falso in 3D
	reveal: 180, //       6,0 s · lo zoom rivela l'indirizzo sospetto
	step1: 270, //        9,0 s · la vittima riceve il messaggio
	step2: 315, //        10,5 s · apre il collegamento
	step3: 360, //        12,0 s · pagina di accesso contraffatta
	step4: 405, //        13,5 s · inserisce le credenziali
	step5: 450, //        15,0 s · i dati finiscono all'attaccante
	shield: 510, //       17,0 s · compare lo scudo digitale
	tip1: 525, //         17,5 s · controlla il dominio
	tip2: 570, //         19,0 s · non aprire link sospetti
	tip3: 630, //         21,0 s · autenticazione a più fattori
	destroy: 720, //      24,0 s · lo scudo distrugge il messaggio fraudolento
	title: 750, //        25,0 s · "PRIMA DI CLICCARE, PENSA."
	question: 840, //     28,0 s · "Tu avresti riconosciuto la truffa?"
} as const;

/** Voce narrante (secondi; fine misurata sulle clip). Testi = sottotitoli. File in public/v04/vo/. */
export const V4_VO = [
	{file: 'vo_01', start: 0.15, end: 2.89, text: 'Un solo clic potrebbe bastare per perdere il tuo account.'},
	{file: 'vo_02', start: 3.4, end: 7.13, text: 'Il phishing sfrutta messaggi falsi per convincerti a consegnare i tuoi dati.'},
	{file: 'vo_03', start: 9.3, end: 13.67, text: 'Ti porta su un sito contraffatto, dove inserisci password e informazioni personali.'},
	{file: 'vo_04a', start: 17.3, end: 18.62, text: 'Controlla sempre i link,'},
	{file: 'vo_04b', start: 19.0, end: 20.35, text: 'evita quelli sospetti,'},
	{file: 'vo_04c', start: 20.75, end: 22.8, text: "e attiva l'autenticazione a più fattori."},
	{file: 'vo_05', start: 24.6, end: 27.44, text: 'Perché la tua sicurezza può dipendere da un solo secondo.'},
	{file: 'vo_06', start: 27.95, end: 29.84, text: 'Tu avresti riconosciuto la truffa?'},
] as const;

export const V4_SUB_Y = 1390;

/** Esempio fittizio (mai link reali: .example è un dominio riservato e irraggiungibile). */
export const V4_FAKE = {
	service: 'Orbyx', // servizio inventato
	realDomain: 'account.orbyx.example', // l'indirizzo che ti aspetteresti
	phishDomain: '0rbyx-verifica.example', // l'indirizzo truffa: zero al posto della "o", dominio diverso
	phishPath: '/login?sessione=scaduta',
	notifTitle: 'Orbyx · Sicurezza',
	notifText: 'Il tuo account verrà sospeso! Verifica subito.',
	cta: 'Verifica subito',
	email: 'mario.rossi@email.example', // utente fittizio
} as const;
