import {clamp, ease, lerp} from '../../../lib/math';
import {V2_LAPTOP_HOME} from '../../timeline';

/** REVEAL — frame RELATIVI alla scena (0 = assoluto 720). */
export const R = {
	title: 30, //     assoluto 750 · "LA TUA AI. SUL TUO COMPUTER."
	note: 60, //      nota di accuratezza
	question: 135, // assoluto 855 · "Tu la useresti?"
	end: 180,
} as const;

/** Layout verticale: titolo (prima della domanda) e cartello finale. */
export const LAYOUT = {
	titleY1: 1036,
	titleY2: 1138,
	noteY: 1206,
	// cartello finale
	endTitleY: 872,
	questionY: 1040,
	endNoteY: 1196,
} as const;

/**
 * Camera sul laptop: si parte DENTRO lo schermo (stessa chat dell'apertura) e si arretra fino
 * alla posa di casa (V2_LAPTOP_HOME), poi il laptop sale per fare spazio al titolo; un'orbita lenta
 * continua per tutta la scena; alla domanda finale arretra ancora un po' (cartello finale composto).
 */
export const laptopPose = (f: number) => {
	const H = V2_LAPTOP_HOME;
	const pull = ease.outQuart(clamp(f / 44));
	const rise = ease.inOutCubic(clamp((f - 12) / 40));
	const q = ease.inOutCubic(clamp((f - (R.question - 6)) / 26));
	const orbit = f / R.end;
	return {
		x: H.x + 10 * Math.sin(f / 70),
		y: lerp(lerp(700, H.y, pull), 522, rise) - 74 * q,
		/** zoom 2D della camera (fuori dal contesto 3D) × scala del laptop. */
		zoom: lerp(2.15 / H.scale, 1, pull),
		scale: H.scale * lerp(1, 0.885, rise) * lerp(1, 0.9, q) * (1 - 0.02 * orbit),
		rotX: lerp(4, H.rotX, pull) - 2 * orbit,
		rotY: lerp(-3, H.rotY, pull) + 6 * orbit,
	};
};
