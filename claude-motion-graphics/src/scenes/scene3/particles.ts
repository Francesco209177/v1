import {drawGlow} from '../../lib/canvas';
import {clamp, ease, hash, hit, lerp, TAU} from '../../lib/math';
import {COLORS} from '../../theme';
import {elementPose} from './layout';
import {BORN, energy, IGNITE, T} from './timing';

const COUNT = 120;
const TRAIL = 4;

type Particle = {
	burstA: number; //  direzione dell'esplosione iniziale
	burstR: number; //  gittata dell'esplosione
	r: number; //       raggio dell'orbita
	q: number; //       schiacciamento del piano orbitale (prospettiva)
	th: number; //      rotazione del piano
	w: number; //       velocità angolare (rad/frame)
	ph: number;
	size: number;
	hot: boolean;
};

const PARTICLES: Particle[] = Array.from({length: COUNT}, (_, i) => ({
	burstA: hash(i, 21) * TAU,
	burstR: 60 + hash(i, 22) * 150,
	r: 46 + Math.pow(hash(i, 23), 0.7) * 78,
	q: 0.22 + hash(i, 24) * 0.78,
	th: hash(i, 25) * Math.PI,
	w: (0.045 + hash(i, 26) * 0.05) * (hash(i, 27) > 0.5 ? 1 : -1),
	ph: hash(i, 28) * TAU,
	size: 1.9 + hash(i, 29) * 2.6,
	hot: hash(i, 30) > 0.8,
}));

/**
 * Tempo "deformato" delle orbite (forma chiusa, niente stato accumulato):
 * scatto in avanti al tocco dello spark, poi accelerazione continua durante il build.
 */
const orbitTime = (f: number): number => {
	let t = f;
	if (f > IGNITE.P) t += 26 * (1 - Math.exp(-(f - IGNITE.P) / 9));
	if (f > T.lock) t += (0.9 * (f - T.lock) * (f - T.lock)) / (T.implode - T.lock);
	return t;
};

/**
 * <Particelle colore="#D97757" /> — esplosione sul beat di nascita, poi le particelle si
 * organizzano in orbite inclinate attorno a un nucleo. Accese dallo spark: più veloci, con scia.
 */
export const drawParticleElement = (ctx: CanvasRenderingContext2D, f: number): void => {
	const pose = elementPose('P', f);
	if (!pose.visible || pose.alpha <= 0.003) return;
	const dt = f - BORN.P;
	const settle = ease.inOutCubic(clamp((dt - 5) / 15)); // esplosione -> orbita
	const lit = pose.lit;
	const ripple = 1 + 0.3 * hit(f, IGNITE.P, 10);
	const sc = pose.scale;
	const spriteK = lerp(1, 0.72, clamp((1 - sc) * 2)); // nelle card gli sprite restano leggibili
	const en = energy(f);

	// nucleo
	drawGlow(ctx, pose.x, pose.y, (20 + 8 * lit + 10 * hit(f, BORN.P, 8)) * sc, COLORS.orange, pose.alpha * (0.3 + 0.25 * lit + 0.6 * hit(f, BORN.P, 8)), COLORS.orangeHot);

	const trails = lit > 0.02 ? TRAIL : 0;
	for (let i = 0; i < COUNT; i++) {
		const p = PARTICLES[i];
		// esplosione radiale con attrito
		const burst = p.burstR * (1 - Math.exp(-dt / 3.6));
		const bx = Math.cos(p.burstA) * burst;
		const by = Math.sin(p.burstA) * burst;
		const cs = Math.cos(p.th);
		const sn = Math.sin(p.th);
		for (let k = trails; k >= 0; k--) {
			const a = p.ph + p.w * (orbitTime(f) - k * (2.1 + 1.4 * en));
			const rr = p.r * ripple * (1 + 0.1 * lit);
			const ox = Math.cos(a) * rr;
			const oy = Math.sin(a) * rr * p.q;
			const depth = Math.sin(a) * Math.sqrt(1 - p.q * p.q); // -1 dietro .. 1 davanti
			const x = lerp(bx, ox * cs - oy * sn, settle);
			const y = lerp(by, ox * sn + oy * cs, settle);
			const tw = 0.75 + 0.25 * Math.sin(f / 5 + p.ph * 3);
			const fade = k === 0 ? 1 : (0.5 * (1 - k / (TRAIL + 1))) * lit;
			const z = 0.72 + 0.28 * depth;
			drawGlow(
				ctx,
				pose.x + x * sc,
				pose.y + y * sc,
				p.size * z * spriteK * (k === 0 ? 1 : 0.8) * (1 + 0.25 * lit),
				p.hot && lit > 0.5 ? COLORS.orangeBright : COLORS.orange,
				pose.alpha * tw * z * fade * (0.62 + 0.38 * lit),
				p.hot ? '#FFFFFF' : COLORS.orangeHot,
			);
		}
	}
};
