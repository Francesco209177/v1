import {lerp} from '../../../lib/math';

/**
 * Continuità sul taglio 720 tra DIFESA (fine) e FINALE (inizio): il messaggio fraudolento rientra alla fine
 * della difesa e lo scudo lo colpisce esattamente sul cue "destroy" (assoluto 720 = frame 0 del finale).
 */
export const SHIELD_SIZE = 480; // altezza dello scudo a scala 1 (px)

/** Messaggio fraudolento (FakeMessage condiviso): centro, larghezza e altezza misurata a schermo. */
export const MSG = {x: 540, y: 880, width: 760, h: 452} as const;
export const MSG_BOX = {left: MSG.x - MSG.width / 2, top: MSG.y - MSG.h / 2, right: MSG.x + MSG.width / 2, bottom: MSG.y + MSG.h / 2} as const;

/** Punto d'impatto dello scudo sul messaggio. */
export const IMPACT = {x: 540, y: 850} as const;

export type Pose = {x: number; y: number; s: number; sx?: number; sy?: number};

/** Posa dello scudo nel frame d'impatto (assoluto 720): davanti al messaggio, schiacciato dal colpo. */
export const SHIELD_HIT: Pose = {x: 540, y: 800, s: 0.6};

export const mixPose = (a: Pose, b: Pose, t: number): Pose => ({
	x: lerp(a.x, b.x, t),
	y: lerp(a.y, b.y, t),
	s: lerp(a.s, b.s, t),
	sx: lerp(a.sx ?? 1, b.sx ?? 1, t),
	sy: lerp(a.sy ?? 1, b.sy ?? 1, t),
});
