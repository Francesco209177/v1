/**
 * TIMELINE — unica fonte di verità per durata, griglia ritmica e punti di sync.
 * 120 BPM @ 30 fps  =>  1 beat = 15 frame, 1 battuta = 60 frame (2 s).
 * Tutti i tagli di scena cadono su un beat: video e musica condividono questa griglia.
 */
export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const DURATION = 900; // 30 s esatti

export const BPM = 120;
export const BEAT = 15; // frame per beat
export const BAR = 60; // frame per battuta

export type SceneRange = {start: number; end: number; length: number};
const range = (start: number, end: number): SceneRange => ({start, end, length: end - start});

export const SCENES = {
	intro: range(0, 120), //    0–4 s   · le particelle formano Claude
	idea: range(120, 270), //   4–9 s   · il prompt diventa codice
	creation: range(270, 480), // 9–16 s  · il codice prende vita
	result: range(480, 720), // 16–24 s · sequenza rapida di esempi
	outro: range(720, 900), //  24–30 s · tutto converge, logo finale
} as const;

/** Cue musicali/visivi condivisi (frame ASSOLUTI). La musica piazza un evento su ciascuno. */
export const CUES = {
	sparkFormed: 75, //   beat 5  · impatto: il simbolo di Claude si compone
	ideaStart: 120, //    beat 8  · whoosh, parte il groove leggero
	typingStart: 135, //  beat 9  · tick di battitura del prompt
	typingEnd: 195, //    beat 13
	promptToCode: 210, // beat 14 · "invio": il prompt si trasforma in codice
	creationStart: 270, // beat 18 · impatto, groove pieno
	buildStart: 420, //   beat 28 · riser + rullata verso il drop
	drop: 480, //         beat 32 · DROP — inizio sequenza esempi
	shots: [480, 525, 570, 615, 660], // cambi shot scena 4 (3+3+3+3+4 beat)
	outroStart: 720, //   beat 48 · impatto + swell inverso, tutto converge
	lockup: 780, //       beat 52 · colpo finale: logo Claude Code
	fadeStart: 870, //    la coda musicale sfuma, il video tiene il lockup
} as const;

/** Posa del simbolo di Claude (centro x/y in px, size = lato del box in px). */
export type SparkPose = {x: number; y: number; size: number; rotation: number};

/**
 * Pose OBBLIGATE ai confini di scena: l'ultima frame di una scena e la prima
 * della successiva disegnano lo spark esattamente qui => match-cut invisibile.
 */
export const SPARK_POSE = {
	introEnd: {x: 540, y: 700, size: 360, rotation: 0}, //   f=120
	ideaEnd: {x: 540, y: 350, size: 180, rotation: 0}, //    f=270
	creationEnd: {x: 540, y: 800, size: 260, rotation: 0}, // f=480
	resultEnd: {x: 540, y: 330, size: 120, rotation: 0}, //  f=720
	lockup: {x: 540, y: 690, size: 300, rotation: 0}, //     f>=780 (logo finale)
} as const satisfies Record<string, SparkPose>;

/** Rettangolo canonico della finestra "Claude Code" al confine scena 2 -> 3 (f=270). */
export const WINDOW_RECT = {x: 70, y: 510, w: 940, h: 680} as const;

/** Zone sicure Instagram Reels (UI in alto, caption/pulsanti in basso e a destra). */
export const SAFE = {top: 230, bottom: 1500, left: 80, right: 1000} as const;
/** Centro verticale standard dei sottotitoli/caption. */
export const CAPTION_Y = 1350;
