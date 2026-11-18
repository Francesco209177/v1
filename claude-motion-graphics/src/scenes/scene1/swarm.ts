import {drawGlow} from '../../lib/canvas';
import {clamp, lerp, seeded, TAU} from '../../lib/math';
import {sampleSparkPoints} from '../../lib/spark';
import {COLORS} from '../../theme';
import {HEIGHT, WIDTH} from '../../timeline';
import {HUB, POSE, smooth, T} from './motion';

/**
 * SCIAME — le particelle che convergono e compongono il simbolo.
 * Tutto in forma chiusa: posizione = f(particella, frame). Nessuno stato tra i frame.
 *
 * Modello: ogni particella vive in uno stato "libero" (deriva lenta + oscillazione) e viene
 * miscelata verso il proprio punto dentro la sagoma con una curva S(u) lenta → rapida → morbida.
 * Una rotazione attorno al mozzo, che si scarica mentre S sale, trasforma la corsa in una spirale.
 */

type Vec = {x: number; y: number};

export type SwarmParticle = {
	// bersaglio relativo al mozzo (px, scala 1)
	tx: number;
	ty: number;
	// tempi: inizio attrazione, 1/durata, comparsa
	p0: number;
	invDur: number;
	t0: number;
	// stato libero (spazio "circolare", relativo al mozzo)
	fx: number;
	fy: number;
	vx: number;
	vy: number;
	wob: number;
	w1: number;
	w2: number;
	ph1: number;
	ph2: number;
	// vortice
	swirl: number;
	omega: number;
	// aspetto: libero → agganciato
	sizeFree: number;
	sizeLock: number;
	alphaFree: number;
	alphaLock: number;
	twF: number;
	twPh: number;
	color: string;
	core: string;
};

export type Swarm = {particles: SwarmParticle[]; rMax: number};

/** Il campo libero è un disco schiacciato in x (formato 9:16) e spostato verso il centro del frame. */
const SQUASH_X = 0.7;
const BIAS_Y = 130;
/** Durata dell'assemblaggio: il mozzo si chiude a formed-ASSEMBLY, le punte ESATTAMENTE a formed. */
const ASSEMBLY = 18;

/** Curva di attrazione: deriva quasi ferma, poi accelerazione, poi arrivo morbido (derivata 0 ai due estremi). */
const pull = (u: number): number => {
	const q = 1 - u * u * u;
	return 1 - q * q * q;
};

/**
 * Posizione a schermo della particella al frame `f` (anche frazionario: serve per le scie).
 * `k` = scala corrente del simbolo attorno al mozzo (respiro × colpo). Ritorna S (0 libero … 1 agganciato).
 */
export const swarmPosition = (p: SwarmParticle, f: number, k: number, out: Vec): number => {
	const u = clamp((f - p.p0) * p.invDur);
	const S = pull(u);
	const free = 1 - S;
	const dt = f - 30;
	const fx = p.fx + p.vx * dt + Math.sin(f * p.w1 + p.ph1) * p.wob;
	const fy = p.fy + p.vy * dt + Math.cos(f * p.w2 + p.ph2) * p.wob;
	const cx = fx + (p.tx * k - fx) * S;
	const cy = fy + (p.ty * k - fy) * S;
	// rotazione residua: spirale che si "srotola" + lenta rotazione d'insieme del campo libero
	const phi = p.swirl * Math.pow(free, 1.25) + p.omega * (T.formed - f) * free;
	const c = Math.cos(phi);
	const s = Math.sin(phi);
	out.x = HUB.x + (cx * c - cy * s) * (SQUASH_X + (1 - SQUASH_X) * S);
	out.y = HUB.y + (cx * s + cy * c) + BIAS_Y * free;
	return S;
};

export const buildSwarm = (count: number, seed: number): Swarm => {
	const pts = sampleSparkPoints(count, seed);
	const rMax = pts.reduce((m, p) => Math.max(m, p.r), 0);
	const rnd = seeded(seed * 104729 + 17);
	const probe: Vec = {x: 0, y: 0};
	const particles = pts.map((pt): SwarmParticle => {
		const rn = pt.r / rMax; // 0 mozzo … 1 punta più lontana
		// arrivi scaglionati dal mozzo verso l'esterno; la punta più lontana chiude sul cue
		const arr = T.formed - (ASSEMBLY + 2 * rnd()) * (1 - rn);
		const dur = 46 + 16 * rnd();
		const p0 = arr - dur;

		// profondità: 0.25 lontano … 1 vicino; ~4% di "bokeh" in primissimo piano (z > 1)
		const bokeh = rnd() < 0.04;
		const z = bokeh ? 1.25 + 0.35 * rnd() : 0.25 + 0.75 * Math.pow(rnd(), 0.85);
		const zc = Math.min(1, z);

		// partenza: stesso settore angolare del raggio di destinazione (+ rumore) => flussi a spirale
		const r0 = (250 + 1250 * Math.pow(rnd(), 0.72)) * (0.82 + 0.3 * z);
		const a0 = pt.a + (rnd() - 0.5) * 0.9;
		const driftA = rnd() * TAU;
		const driftV = (0.25 + 0.9 * rnd()) * z;

		const tint = rnd();
		const deep = z < 0.44;
		const hot = !deep && tint < 0.27;

		const p: SwarmParticle = {
			tx: POSE.x + pt.x * POSE.size - HUB.x,
			ty: POSE.y + pt.y * POSE.size - HUB.y,
			p0,
			invDur: 1 / dur,
			t0: -1000,
			fx: Math.cos(a0) * r0,
			fy: Math.sin(a0) * r0,
			vx: Math.cos(driftA) * driftV,
			vy: Math.sin(driftA) * driftV,
			wob: (12 + 22 * rnd()) * (0.5 + 0.5 * z),
			w1: 0.045 + 0.05 * rnd(),
			w2: 0.04 + 0.05 * rnd(),
			ph1: rnd() * TAU,
			ph2: rnd() * TAU,
			swirl: 1.15 + 0.85 * rnd() + 0.25 * z,
			omega: 0.0028 + 0.0034 * z,
			sizeFree: bokeh ? 8 + 8 * rnd() : 1.05 + 2.3 * Math.pow(zc, 1.6) * (0.55 + 0.9 * rnd()),
			sizeLock: 1.45 + 0.75 * rnd(),
			alphaFree: bokeh ? 0.1 + 0.07 * rnd() : 0.28 + 0.72 * zc,
			alphaLock: 0.55 + 0.35 * rnd(),
			twF: 0.22 + 0.4 * rnd(),
			twPh: rnd() * TAU,
			color: deep ? COLORS.orangeDeep : hot ? COLORS.orangeBright : COLORS.orange,
			core: deep ? COLORS.orangeBright : hot ? COLORS.white : COLORS.orangeHot,
		};

		// comparsa: chi parte dentro l'inquadratura si accende (poche subito, poi sempre di più);
		// chi parte fuori campo entra volando e non ha bisogno di fade.
		swarmPosition(p, 4, 1, probe);
		const onScreen = probe.x > -10 && probe.x < WIDTH + 10 && probe.y > -10 && probe.y < HEIGHT + 10;
		const q = rnd();
		if (onScreen) p.t0 = Math.min(2 + 30 * Math.pow(q, 0.65), p0 + 0.35 * dur);
		return p;
	});
	return {particles, rMax};
};

/** Disegna lo sciame (testa luminosa + scia analitica a due segmenti). Richiede composite 'lighter'. */
export const drawSwarm = (ctx: CanvasRenderingContext2D, swarm: Swarm, f: number, k: number): void => {
	// handoff: mentre lo spark solido affiora, le particelle agganciate si stringono e si spengono
	const lockFade = 1 - smooth((f - (T.formed - 2)) / (T.swarmGone - T.formed + 1));
	if (lockFade <= 0) return;
	const tighten = 1 - 0.35 * smooth((f - T.handoff) / 12);
	const a: Vec = {x: 0, y: 0};
	const b: Vec = {x: 0, y: 0};
	const c: Vec = {x: 0, y: 0};
	ctx.lineCap = 'round';
	for (const p of swarm.particles) {
		const ap = smooth((f - p.t0) / 7);
		if (ap <= 0) continue;
		const S = swarmPosition(p, f, k, a);
		if (a.x < -80 || a.x > WIDTH + 80 || a.y < -80 || a.y > HEIGHT + 80) continue;
		const focus = S * S;
		const tw = 0.74 + 0.26 * Math.sin(f * p.twF + p.twPh);
		const alpha = ap * tw * lockFade * lerp(p.alphaFree, p.alphaLock, focus);
		const size = lerp(p.sizeFree, p.sizeLock * tighten, focus) * (0.45 + 0.55 * ap);

		// scia: due posizioni precedenti calcolate analiticamente, visibile solo se la particella corre
		swarmPosition(p, f - 0.8, k, b);
		const speed = Math.hypot(a.x - b.x, a.y - b.y) / 0.8;
		const trail = clamp((speed - 2.5) / 7);
		if (trail > 0) {
			swarmPosition(p, f - 1.7, k, c);
			ctx.strokeStyle = p.color;
			ctx.lineWidth = Math.max(1, Math.min(size, 3.2) * 0.95);
			ctx.globalAlpha = alpha * 0.5 * trail;
			ctx.beginPath();
			ctx.moveTo(a.x, a.y);
			ctx.lineTo(b.x, b.y);
			ctx.stroke();
			ctx.globalAlpha = alpha * 0.2 * trail;
			ctx.beginPath();
			ctx.moveTo(b.x, b.y);
			ctx.lineTo(c.x, c.y);
			ctx.stroke();
		}
		drawGlow(ctx, a.x, a.y, size, p.color, alpha, p.core);
	}
	ctx.globalAlpha = 1;
};
