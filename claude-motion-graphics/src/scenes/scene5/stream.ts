import {drawGlow, withAlpha} from '../../lib/canvas';
import {seeded} from '../../lib/math';
import {COLORS} from '../../theme';
import {T} from './motion';
import {Flight, flightAt, makeFlight} from './vortex';

/**
 * FLUSSO — centinaia di particelle e alcune scie di luce ("comete") che rientrano nello spark.
 * Forma chiusa: posizione = f(indice, frame). Da disegnare con composite 'lighter'.
 */
type Mote = {
	flight: Flight;
	size: number; // raggio del nucleo (px)
	trail: number; // lunghezza della scia in frame
	bright: number;
	color: string;
	core: string;
	phase: number;
};

export type Stream = Mote[];

const TINTS: {color: string; core: string}[] = [
	{color: COLORS.orange, core: COLORS.orangeHot},
	{color: COLORS.orange, core: COLORS.orangeHot},
	{color: COLORS.orangeBright, core: COLORS.white},
	{color: COLORS.orangeDeep, core: COLORS.orangeBright},
	{color: COLORS.orangeHot, core: COLORS.white},
];

export const buildStream = (dust: number, comets: number, seed = 51): Stream => {
	const rnd = seeded(seed);
	const out: Stream = [];
	// pulviscolo: la densità degli arrivi cresce verso il colpo (swell inverso della musica)
	for (let i = 0; i < dust; i++) {
		const s = (i + rnd()) / dust;
		const t1 = 9 + (T.lastAbsorb + 1.7 - 9) * (1 - Math.pow(1 - rnd(), 1.45));
		const dur = 13 + rnd() * 15;
		const t0 = Math.max(rnd() * 1.2, t1 - dur);
		const z = rnd(); // profondità: 0 lontano (piccolo, tenue) → 1 vicino
		const tint = TINTS[Math.floor(rnd() * TINTS.length)];
		out.push({
			flight: makeFlight(s * 7.31, 16 + rnd() * 110, t0, t1, 1.0 + rnd() * 1.7),
			size: 1.1 + z * 2.3,
			trail: 1.4 + z * 1.8,
			bright: 0.4 + z * 0.6,
			phase: rnd() * 6.283,
			...tint,
		});
	}
	// comete: più veloci, scia lunga, testa calda
	for (let i = 0; i < comets; i++) {
		// le prime partono subito dopo il taglio: il risucchio si legge fin dai primi fotogrammi
		const t1 = 8 + ((T.lastAbsorb + 1.3 - 8) * Math.pow((i + rnd() * 0.8) / comets, 1.25));
		const dur = 9 + rnd() * 6;
		const t0 = Math.max(0.2 + rnd() * 0.8, t1 - dur);
		out.push({
			flight: makeFlight(i * 0.618 + rnd() * 0.1, 40, t0, t1, 1.5 + rnd() * 1.2),
			size: 3.6 + rnd() * 1.6,
			trail: 4.5 + rnd() * 2,
			bright: 1,
			phase: rnd() * 6.283,
			color: COLORS.orangeBright,
			core: COLORS.white,
		});
	}
	return out;
};

const TRAIL_STEPS = 3;

export const drawStream = (ctx: CanvasRenderingContext2D, stream: Stream, f: number): void => {
	ctx.lineCap = 'round';
	for (const m of stream) {
		const fl = m.flight;
		if (f <= fl.t0 || f >= fl.t1) continue;
		const head = flightAt(fl, f);
		if (head.near <= 0.01) continue;
		// si accende entrando e brilla di più avvicinandosi
		const a = m.bright * Math.min(1, (f - fl.t0) / 3) * (0.45 + 0.55 * head.u) * head.near;
		const tw = 0.82 + 0.18 * Math.sin(f * 0.9 + m.phase);
		// scia: segmenti lungo il percorso reale (curvo), sempre più tenui verso la coda
		let px = head.x;
		let py = head.y;
		for (let j = 1; j <= TRAIL_STEPS; j++) {
			const p = flightAt(fl, Math.max(fl.t0, f - (m.trail * j) / TRAIL_STEPS));
			const k = 1 - (j - 1) / TRAIL_STEPS;
			ctx.strokeStyle = withAlpha(m.color, a * 0.55 * k * k);
			ctx.lineWidth = m.size * (0.5 + 0.7 * k);
			ctx.beginPath();
			ctx.moveTo(px, py);
			ctx.lineTo(p.x, p.y);
			ctx.stroke();
			px = p.x;
			py = p.y;
		}
		drawGlow(ctx, head.x, head.y, m.size * (0.9 + 0.5 * head.u), m.color, a * tw, m.core);
	}
	ctx.globalAlpha = 1;
};
