import {SHOTS} from './stage';

/** Tempi della shell della scena 4 (frame relativi alla scena; assoluti = 480 + frame). */
export const CUTS: number[] = SHOTS.slice(1).map((s) => s.start); // 45, 90, 135, 180: cambi shot sul beat
export const HUD_IN = 8; // l'HUD entra quando lo spark ha raggiunto il posto da narratore
export const HUD_OUT = 222; // HUD e barra escono: resta solo lo spark per il match-cut con l'outro

/** Ultimo cambio shot avvenuto: indice (0-based tra i CUTS) e frame trascorsi; null prima del primo. */
export const lastCut = (frame: number): {index: number; d: number} | null => {
	let found: {index: number; d: number} | null = null;
	CUTS.forEach((c, index) => {
		if (frame >= c) found = {index, d: frame - c};
	});
	return found;
};

/** Finestra che porta ESATTAMENTE a zero dopo `len` frame (gli esponenziali da soli non ci arrivano mai). */
export const fadeWindow = (d: number, len: number): number => (d < 0 || d >= len ? 0 : (1 - d / len) ** 2);
