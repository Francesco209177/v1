import {clamp, ease, hash, hit, lerp, seeded, TAU} from '../../lib/math';
import {SPARK_CENTER, SPARK_VIEWBOX, sampleSparkPoints, SparkPoint} from '../../lib/spark';
import {BEATS, morphProgress, T} from './shot5-timing';

/**
 * SISTEMA PROCEDURALE dello shot 5 — tutto in forma chiusa: posizione = f(particella, frame).
 *
 * Topologia: 37 gruppi × 49 slot. Ogni forma è una diversa "lettura" della stessa griglia (gruppo, slot):
 *   ORBITE    il gruppo è un arco di uno dei tre anelli           (slot = angolo lungo l'arco)
 *   RETICOLO  il gruppo è una tessera esagonale del favo          (slot = posizione sul perimetro)
 *   ONDA      il gruppo è una riga della superficie in prospettiva (slot = colonna)
 *   SPARK     il gruppo è un settore angolare del simbolo         (slot = distanza dal mozzo)
 * Così gli archi si arricciano in esagoni, gli esagoni si srotolano in righe, le righe ruotano in raggi:
 * il morph resta leggibile anche a metà strada. Coordinate "mondo" in px, origine = centro del palco,
 * y verso il basso, z verso la camera.
 */
export const GROUPS = 37;
export const SLOTS = 49;
export const COUNT = GROUPS * SLOTS;
const LAST = SLOTS - 1;

/** Punto "mondo" + resa: `gain` = luminosità della forma, `accent` = quanto risaltano i nodi (0..1). */
export type Sample = {x: number; y: number; z: number; gain: number; accent: number};
export const makeSample = (): Sample => ({x: 0, y: 0, z: 0, gain: 1, accent: 1});

// ───────────────────────────── parametri delle forme ─────────────────────────────

/**
 * Tre anelli giroscopici concentrici (dal più interno al più esterno): ognuno è un cerchio
 * inclinato (tilt) e ruotato nel piano dello schermo (roll), così a schermo si leggono tre
 * ellissi con orientamenti diversi che precessano in versi opposti. `flow` = scorrimento delle particelle.
 */
export const RINGS = [
	{radius: 150, groups: 8, tilt: 0.95, tiltV: 0.03, yaw: 0.2, roll: 0.9, rollV: 0.09, flow: 0.06},
	{radius: 228, groups: 12, tilt: 1.0, tiltV: -0.02, yaw: -0.25, roll: -0.5, rollV: -0.07, flow: -0.045},
	{radius: 305, groups: 17, tilt: 0.9, tiltV: 0.015, yaw: 0.15, roll: 2.2, rollV: 0.05, flow: 0.03},
] as const;

/** Favo: 37 celle (3 corone), circumraggio di cella in px. */
const HEX_CELL = 58;
/** Superficie d'onda: larghezza, profondità, inclinazione verso la camera, rialzo. */
export const WAVE = {w: 620, d: 1000, tilt: 0.5, lift: -96} as const;
/** Lato del box dello spark di particelle. */
export const SPARK_SIZE = 640;

export type Particle = {
	group: number;
	slot: number;
	node: boolean; // ogni 8 slot: vertice dell'esagono / perla sull'orbita
	// ORBITE
	ring: number;
	theta: number;
	jr: number;
	jz: number;
	// RETICOLO
	cellX: number;
	cellY: number;
	cellDist: number;
	u: number;
	// ONDA
	waveX: number;
	waveZ: number;
	// SPARK
	sx: number;
	sy: number;
	sz: number;
	sr: number;
	// ritardi (0..1) dei tre morph
	d1: number;
	d2: number;
	d3: number;
	// seme dell'eruzione e direzione/velocità dell'esplosione finale
	seedX: number;
	seedY: number;
	bx: number;
	by: number;
	bz: number;
	bv: number;
	// casuali stabili + aspetto
	h1: number;
	h2: number;
	h3: number;
	radius: number;
	alpha: number;
	tone: number;
	twinkle: number;
	bloom: boolean; // emette anche nell'alone a bassa risoluzione
};

export type Dust = {
	nx: number;
	ny: number;
	nz: number;
	rho: number;
	omega: number;
	phase: number;
	rise: number;
	bx: number;
	by: number;
	bz: number;
	bv: number;
	radius: number;
	alpha: number;
	tone: number;
};

export type System = {particles: Particle[]; dust: Dust[]};

// ───────────────────────────── costruzione (una volta sola) ─────────────────────────────

type Cell = {x: number; y: number; level: number; angle: number};

/** Celle del favo ordinate per corona e angolo (pointy-top). */
const buildCells = (): Cell[] => {
	const cells: Cell[] = [];
	for (let q = -3; q <= 3; q++) {
		for (let r = -3; r <= 3; r++) {
			const level = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
			if (level > 3) continue;
			const x = HEX_CELL * Math.sqrt(3) * (q + r / 2);
			const y = HEX_CELL * 1.5 * r;
			cells.push({x, y, level, angle: (Math.atan2(y, x) + TAU) % TAU});
		}
	}
	return cells.sort((a, b) => a.level - b.level || a.angle - b.angle);
};

/**
 * Punti dentro la sagoma dello spark, distribuiti in modo uniforme ("best candidate":
 * tra pochi candidati casuali si tiene il più lontano dai punti già scelti), poi
 * divisi in 37 settori angolari da 49 punti, ordinati dal mozzo verso la punta.
 */
const buildSparkSectors = (): SparkPoint[][] => {
	const pool = sampleSparkPoints(COUNT * 5, 5);
	const rnd = seeded(9051);
	const chosen: SparkPoint[] = [pool[0]];
	while (chosen.length < COUNT) {
		let best = pool[0];
		let bestD = -1;
		for (let c = 0; c < 5; c++) {
			const cand = pool[Math.floor(rnd() * pool.length)];
			let near = Infinity;
			for (let j = 0; j < chosen.length; j++) {
				const dx = chosen[j].x - cand.x;
				const dy = chosen[j].y - cand.y;
				const d = dx * dx + dy * dy;
				if (d < near) near = d;
			}
			if (near > bestD) {
				bestD = near;
				best = cand;
			}
		}
		chosen.push(best);
	}
	chosen.sort((a, b) => a.a - b.a);
	const sectors: SparkPoint[][] = [];
	for (let g = 0; g < GROUPS; g++) sectors.push(chosen.slice(g * SLOTS, (g + 1) * SLOTS).sort((a, b) => a.r - b.r));
	return sectors;
};

/** Pseudo-gaussiana deterministica (somma di tre uniformi), circa in [-1.5, 1.5]. */
const gauss = (i: number, salt: number): number => hash(i, salt) + hash(i, salt + 1) + hash(i, salt + 2) - 1.5;

/** Direzione e velocità dell'esplosione finale a partire da una posizione sul piano. */
const burstVector = (x: number, y: number, i: number): {bx: number; by: number; bz: number; bv: number} => {
	const dist = Math.hypot(x, y);
	const base = dist > 14 ? Math.atan2(y, x) : hash(i, 61) * TAU;
	const angle = base + (hash(i, 62) - 0.5) * 0.5;
	const zc = lerp(-0.3, 0.9, hash(i, 63));
	const n = Math.hypot(1, zc);
	return {
		bx: Math.cos(angle) / n,
		by: Math.sin(angle) / n,
		bz: zc / n,
		bv: 520 + 1500 * Math.pow(hash(i, 64), 1.4),
	};
};

let cached: System | null = null;

/** Costruisce (e mette in cache) particelle e pulviscolo. Richiede il DOM (campionamento dello spark). */
export const buildSystem = (): System => {
	if (cached) return cached;
	const cells = buildCells();
	const sectors = buildSparkSectors();
	// riga dell'onda di ogni cella: le celle in alto diventano le righe lontane
	const order = cells.map((_, i) => i).sort((a, b) => cells[a].y - cells[b].y || cells[a].x - cells[b].x);
	const rowOf = new Array<number>(GROUPS);
	order.forEach((cellIndex, row) => (rowOf[cellIndex] = row));
	const hubX = SPARK_CENTER.x / SPARK_VIEWBOX - 0.5;
	const hubY = SPARK_CENTER.y / SPARK_VIEWBOX - 0.5;

	const particles: Particle[] = [];
	for (let g = 0; g < GROUPS; g++) {
		const ring = g < RINGS[0].groups ? 0 : g < RINGS[0].groups + RINGS[1].groups ? 1 : 2;
		const gi = g - (ring === 0 ? 0 : ring === 1 ? RINGS[0].groups : RINGS[0].groups + RINGS[1].groups);
		const cell = cells[g];
		const row = rowOf[g];
		for (let s = 0; s < SLOTS; s++) {
			const i = g * SLOTS + s;
			const u = s / LAST;
			const node = s % 8 === 0;
			const turn = (gi + u) / RINGS[ring].groups;
			const loose = hash(i, 7) < 0.3;
			const pt = sectors[row][s];
			const sx = (pt.x - hubX) * SPARK_SIZE;
			const sy = (pt.y - hubY) * SPARK_SIZE;
			const sr = Math.hypot(sx, sy);
			const toneRoll = hash(i, 31);
			particles.push({
				group: g,
				slot: s,
				node,
				ring,
				theta: turn * TAU,
				jr: node ? 0 : gauss(i, 11) * (loose ? 18 : 4),
				jz: node ? 0 : gauss(i, 14) * (loose ? 18 : 4),
				cellX: cell.x,
				cellY: cell.y,
				cellDist: Math.hypot(cell.x, cell.y),
				u,
				waveX: (u - 0.5) * WAVE.w,
				waveZ: (row / (GROUPS - 1) - 0.5) * WAVE.d,
				sx,
				sy,
				sz: (hash(i, 41) - 0.5) * 36,
				sr,
				// l'anello si spezza girando in tondo · gli esagoni si srotolano dal fondo · lo spark cresce dal mozzo
				d1: 0.7 * turn + 0.3 * (ring / 2),
				d2: 0.55 * (row / (GROUPS - 1)) + 0.45 * u,
				d3: clamp(sr / (SPARK_SIZE * 0.5)),
				seedX: (hash(i, 51) - 0.5) * 16,
				seedY: (hash(i, 52) - 0.5) * 16,
				...burstVector(sx, sy, i),
				h1: hash(i, 21),
				h2: hash(i, 22),
				h3: hash(i, 23),
				radius: 1.45 + 1.0 * hash(i, 32),
				alpha: 0.5 + 0.4 * hash(i, 33),
				tone: node ? 3 : toneRoll < 0.14 ? 0 : toneRoll < 0.64 ? 1 : toneRoll < 0.9 ? 2 : 3,
				twinkle: hash(i, 34) * TAU,
				bloom: s % 4 === 0,
			});
		}
	}

	// pulviscolo orbitante: profondità e parallasse attorno al sistema
	const dust: Dust[] = [];
	for (let i = 0; i < 130; i++) {
		const zc = hash(i, 101) * 2 - 1;
		const az = hash(i, 102) * TAU;
		const rr = Math.sqrt(1 - zc * zc);
		const big = hash(i, 105) < 0.16;
		const nx = rr * Math.cos(az);
		const ny = zc;
		dust.push({
			nx,
			ny,
			nz: rr * Math.sin(az),
			rho: 330 + 220 * hash(i, 103),
			omega: (0.012 + 0.02 * hash(i, 104)) * (i % 2 ? 1 : -1),
			phase: hash(i, 106) * TAU,
			rise: 6 + 6 * hash(i, 111),
			...burstVector(nx * 100, ny * 100, i + 5000),
			radius: big ? 4.5 + 4 * hash(i, 107) : 1.1 + 1.5 * hash(i, 107),
			alpha: big ? 0.07 + 0.07 * hash(i, 108) : 0.16 + 0.3 * hash(i, 108),
			tone: hash(i, 109) < 0.3 ? 0 : hash(i, 109) < 0.85 ? 1 : 2,
		});
	}
	cached = {particles, dust};
	return cached;
};

// ───────────────────────────── le quattro forme ─────────────────────────────

/** Punto su un anello (raggio `rad`, quota `jz`) con l'orientamento giroscopico al tempo t. */
export const ringPoint = (ring: number, theta: number, rad: number, jz: number, t: number, out: Sample): void => {
	const c = RINGS[ring];
	const ax = c.tilt + c.tiltV * t;
	const az = c.roll + c.rollV * t;
	const x = rad * Math.cos(theta);
	const y = rad * Math.sin(theta);
	// inclinazione attorno a X, imbardata fissa attorno a Y, poi rollio nel piano dello schermo
	const y1 = y * Math.cos(ax) - jz * Math.sin(ax);
	const z1 = y * Math.sin(ax) + jz * Math.cos(ax);
	const x2 = x * Math.cos(c.yaw) + z1 * Math.sin(c.yaw);
	out.x = x2 * Math.cos(az) - y1 * Math.sin(az);
	out.y = x2 * Math.sin(az) + y1 * Math.cos(az);
	out.z = -x * Math.sin(c.yaw) + z1 * Math.cos(c.yaw);
	out.gain = 1;
	out.accent = 1;
};

const ringAt = (p: Particle, t: number, out: Sample): void => {
	const c = RINGS[p.ring];
	ringPoint(p.ring, p.theta + c.flow * t, c.radius + p.jr, p.jz, t, out);
};

/** Tessera esagonale: scala, rotazione e quota guidate da un'onda radiale che attraversa il favo. */
const hexAt = (p: Particle, t: number, out: Sample): void => {
	const tt = t - T.toHex;
	const phase = tt * 0.62 - p.cellDist * 0.02;
	const w = Math.cos(phase);
	const rho = HEX_CELL * (0.76 + 0.13 * w);
	const rot = -Math.PI / 2 + 0.5 * Math.sin(phase);
	const e = p.u * 6;
	const k = Math.min(5, Math.floor(e));
	const f = e - k;
	const a0 = rot + (k * Math.PI) / 3;
	const a1 = a0 + Math.PI / 3;
	const x = p.cellX + rho * lerp(Math.cos(a0), Math.cos(a1), f);
	const y = p.cellY + rho * lerp(Math.sin(a0), Math.sin(a1), f);
	const turn = 0.012 * tt;
	const c = Math.cos(turn);
	const s = Math.sin(turn);
	out.x = x * c - y * s;
	out.y = x * s + y * c;
	out.z = 60 * w;
	out.gain = 0.72 + 0.6 * Math.max(0, w);
	out.accent = 1;
};

/** Piano dell'onda (prima della camera): imbardata lenta + inclinazione verso chi guarda. */
export const wavePlane = (x0: number, z0: number, h: number, t: number, out: Sample): void => {
	const yaw = 0.014 * (t - T.toWave) - 0.1;
	const cy = Math.cos(yaw);
	const sy = Math.sin(yaw);
	const x = x0 * cy + z0 * sy;
	const zg = -x0 * sy + z0 * cy;
	const st = Math.sin(WAVE.tilt);
	const ct = Math.cos(WAVE.tilt);
	out.x = x;
	out.y = zg * st - h * ct + WAVE.lift;
	out.z = zg * ct + h * st;
};

/** Quota dell'onda: due treni d'onda diagonali che scorrono + increspatura d'urto sul beat. */
const waveHeight = (x: number, z: number, t: number): number => {
	const tt = t - T.toWave;
	let h = 40 * Math.sin(0.021 * x + 0.011 * z - 0.62 * tt) + 17 * Math.sin(0.008 * x - 0.019 * z + 0.37 * tt + 1.3);
	if (tt > 0) {
		const dr = (Math.hypot(x, z) - tt * 48) / 80;
		h += 70 * Math.exp(-dr * dr) * Math.exp(-tt / 9);
	}
	return h;
};

const waveAt = (p: Particle, t: number, out: Sample): void => {
	const h = waveHeight(p.waveX, p.waveZ, t);
	wavePlane(p.waveX, p.waveZ, h, t, out);
	// le creste brillano
	out.gain = 0.55 + 0.75 * clamp(0.5 + h / 100);
	out.accent = 0.15;
};

const sparkAt = (p: Particle, t: number, out: Sample): void => {
	const tt = t - T.toSpark;
	const breathe = 1 + 0.012 * Math.sin(tt * 0.7);
	out.x = p.sx * breathe;
	out.y = p.sy * breathe;
	out.z = p.sz;
	// onda di luce dal mozzo verso le punte
	out.gain = 0.85 + 0.4 * (0.5 + 0.5 * Math.cos(p.sr * 0.03 - tt * 1.1));
	out.accent = 0.5;
};

// ───────────────────────────── morph e traiettoria completa ─────────────────────────────

/** Carattere dei tre morph: vortice (rad), respiro radiale, ventaglio in profondità (px). */
const FLOW = [
	{swirl: 0.55, spread: 0.1, depth: 220},
	{swirl: 0.12, spread: 0.04, depth: 170},
	{swirl: -0.8, spread: -0.1, depth: 260},
] as const;

const A = makeSample();
const B = makeSample();

const blend = (e: number, kind: number, p: Particle, out: Sample): void => {
	const f = FLOW[kind];
	const bump = Math.sin(Math.PI * e);
	const x = lerp(A.x, B.x, e);
	const y = lerp(A.y, B.y, e);
	const angle = f.swirl * bump * (0.4 + 0.6 * p.h1);
	const k = 1 + f.spread * bump;
	const c = Math.cos(angle) * k;
	const s = Math.sin(angle) * k;
	out.x = x * c - y * s;
	out.y = x * s + y * c;
	out.z = lerp(A.z, B.z, e) + bump * (p.h2 - 0.5) * f.depth;
	out.gain = lerp(A.gain, B.gain, e);
	out.accent = lerp(A.accent, B.accent, e);
};

/** Avanzamento 0..1 dell'esplosione finale (curva che parte già veloce e accelera). */
export const burstTravel = (t: number): number => {
	if (t <= T.burst) return 0;
	const tau = (t - T.burst) / (T.end - T.burst);
	return 0.25 * tau + 0.75 * tau * tau;
};

/** Posizione "mondo" della particella al tempo t (anche frazionario: serve per le scie di movimento). */
export const sampleParticle = (p: Particle, t: number, out: Sample): void => {
	const e1 = morphProgress(t, T.toHex, p.d1);
	if (e1 < 1) {
		if (e1 <= 0) ringAt(p, t, out);
		else {
			ringAt(p, t, A);
			hexAt(p, t, B);
			blend(e1, 0, p, out);
		}
	} else {
		const e2 = morphProgress(t, T.toWave, p.d2);
		if (e2 < 1) {
			if (e2 <= 0) hexAt(p, t, out);
			else {
				hexAt(p, t, A);
				waveAt(p, t, B);
				blend(e2, 1, p, out);
			}
		} else {
			const e3 = morphProgress(t, T.toSpark, p.d3);
			if (e3 <= 0) waveAt(p, t, out);
			else if (e3 >= 1) sparkAt(p, t, out);
			else {
				waveAt(p, t, A);
				sparkAt(p, t, B);
				blend(e3, 2, p, out);
			}
		}
	}
	// eruzione: tutto nasce da un seme al centro del palco
	if (t < T.eruptDur * 1.2) {
		const k = ease.outExpo(clamp(t / (T.eruptDur * (0.8 + 0.4 * p.h3))));
		out.x = p.seedX + (out.x - p.seedX) * k;
		out.y = p.seedY + (out.y - p.seedY) * k;
		out.z *= k;
	}
	// esplosione finale verso l'esterno
	if (t > T.burst) {
		const q = burstTravel(t) * p.bv;
		out.x += p.bx * q;
		out.y += p.by * q;
		out.z += p.bz * q;
	}
};

/** Spinta radiale del pulviscolo sui beat. */
const beatKick = (t: number): number => {
	let k = 0;
	for (const b of BEATS) k += hit(t, b, 9);
	return k;
};

/** Posizione "mondo" di un granello di pulviscolo. */
export const sampleDust = (d: Dust, t: number, out: Sample): void => {
	const angle = d.phase + t * d.omega;
	const c = Math.cos(angle);
	const s = Math.sin(angle);
	const k = ease.outQuint(clamp(t / d.rise));
	const rho = d.rho * (1 + 0.07 * beatKick(t)) * k;
	out.x = (d.nx * c + d.nz * s) * rho;
	out.y = d.ny * 0.6 * rho + Math.sin(t * 0.13 + d.phase) * 9;
	out.z = (-d.nx * s + d.nz * c) * rho;
	out.gain = k;
	out.accent = 0;
	if (t > T.burst) {
		const q = burstTravel(t) * d.bv;
		out.x += d.bx * q;
		out.y += d.by * q;
		out.z += d.bz * q;
	}
};
