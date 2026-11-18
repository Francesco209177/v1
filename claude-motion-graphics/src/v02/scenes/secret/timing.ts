import {clamp, ease, invLerp, lerp} from '../../../lib/math';
import {V2_CUES, V2_NET_AT_270, V2_SCENES, v2NetYaw} from '../../timeline';

/** Frame LOCALI della scena SECRET (0 = assoluto 105). */
export const LOADED = V2_CUES.modelLoaded - V2_SCENES.secret.start; // 105 → assoluto 210
export const END = V2_SCENES.secret.length - 1; // 164 → assoluto 269
export const CONVERGE = END - 30; // ultimi 30 frame: la rete converge sulla posa di HOW

export const T = {
	circuitsIn: 4,
	slabIn: 38,
	chipIn: 44,
	chipDown: 58,
	insert: 76,
	progressStart: 66,
	exitStart: 128,
	exitEnd: 150,
} as const;

/** Convergenza finale (0..1) con pendenza nulla alle estremità. */
export const converge = (L: number): number => ease.inOutCubic(invLerp(CONVERGE, END, L));

/**
 * Camera della rete: volo in avanti dalla luce (dist che cala e si posa), rotazione extra che decade,
 * poi convergenza ESATTA su V2_NET_AT_270 a L = 164 con yaw = v2NetYaw(assoluto).
 */
export const secretNet = (L: number, abs: number) => {
	const c = converge(L);
	const fly = ease.outQuart(invLerp(0, 100, L));
	const mid = {
		cx: 540,
		cy: 620,
		scale: 0.8,
		pitch: lerp(-0.62, -0.3, ease.outCubic(invLerp(0, 120, L))),
		dist: lerp(4300, 1500, fly),
	};
	const N = V2_NET_AT_270;
	const spin = Math.pow(1 - clamp(L / 158), 3); // pendenza nulla prima della fine
	const flash = L >= LOADED ? Math.exp(-(L - LOADED) / 6) : 0;
	const spike = L >= LOADED ? Math.exp(-(L - LOADED) / 14) : 0;
	const activity = lerp(0.08, 0.38, ease.inOutSine(invLerp(10, 95, L))) + 0.5 * spike;
	return {
		camera: {
			cx: lerp(mid.cx, N.cx, c),
			cy: lerp(mid.cy, N.cy, c),
			scale: lerp(mid.scale, N.scale, c),
			pitch: lerp(mid.pitch, N.pitch, c),
			dist: lerp(mid.dist, N.dist, c),
			yaw: v2NetYaw(abs) - 1.7 * spin,
		},
		reveal: L >= CONVERGE ? lerp(ease.outCubic(invLerp(2, 64, L)), N.reveal, c) : ease.outCubic(invLerp(2, 64, L)),
		activity: lerp(activity, N.activity, c),
		flash: flash * (1 - c),
	};
};
