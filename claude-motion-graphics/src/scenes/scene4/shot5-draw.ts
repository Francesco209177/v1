import {glowSprite} from '../../lib/canvas';
import {clamp, ease, hit, lerp, TAU} from '../../lib/math';
import {SPARK_CENTER, SPARK_PATH, SPARK_VIEWBOX} from '../../lib/spark';
import {alpha, COLORS} from '../../theme';
import {STAGE} from './stage';
import {
	COUNT,
	GROUPS,
	RINGS,
	SLOTS,
	SPARK_SIZE,
	Sample,
	System,
	burstTravel,
	makeSample,
	ringPoint,
	sampleDust,
	sampleParticle,
	wavePlane,
} from './shot5-system';
import {BEATS, Camera, T, beatFlash, cameraAt, smooth} from './shot5-timing';

/** Focale della prospettiva (px) e semi-intervallo (frame) usato per stimare la velocità a schermo. */
const FOCAL = 1250;
const DT = 0.3;
/** Il canvas dell'alone lavora a 1/4 di risoluzione: morbido per costruzione e quasi gratis. */
export const BLOOM_SCALE = 0.25;

/** Famiglia arancione: [alone, nucleo] dal più profondo al più caldo. */
const TONES: [string, string][] = [
	[COLORS.orangeDeep, COLORS.orange],
	[COLORS.orange, COLORS.orangeHot],
	[COLORS.orangeBright, COLORS.white],
	[COLORS.orangeHot, COLORS.white],
];

// ───────────────────────────── camera e proiezione ─────────────────────────────

type Lens = {cy: number; sy: number; cp: number; sp: number; cr: number; sr: number; scale: number};
const lensOf = (c: Camera): Lens => ({
	cy: Math.cos(c.yaw),
	sy: Math.sin(c.yaw),
	cp: Math.cos(c.pitch),
	sp: Math.sin(c.pitch),
	cr: Math.cos(c.roll),
	sr: Math.sin(c.roll),
	scale: c.scale,
});

type Screen = {x: number; y: number; k: number; z: number};
const makeScreen = (): Screen => ({x: 0, y: 0, k: 1, z: 0});

/** Mondo → schermo: imbardata, beccheggio, rollio, scala, prospettiva. `k` = fattore prospettico. */
const project = (s: Sample, l: Lens, out: Screen): void => {
	const x1 = s.x * l.cy + s.z * l.sy;
	const z1 = -s.x * l.sy + s.z * l.cy;
	const y2 = s.y * l.cp - z1 * l.sp;
	const z2 = s.y * l.sp + z1 * l.cp;
	const x3 = (x1 * l.cr - y2 * l.sr) * l.scale;
	const y3 = (x1 * l.sr + y2 * l.cr) * l.scale;
	const z3 = z2 * l.scale;
	const k = FOCAL / Math.max(90, FOCAL - z3);
	out.x = STAGE.cx + x3 * k;
	out.y = STAGE.cy + y3 * k;
	out.k = k;
	out.z = z3;
};

// ───────────────────────────── calcolo del frame (memo sul tempo) ─────────────────────────────

// Buffer di lavoro condivisi dai due canvas (nitido + alone). Sono una memo pura di t:
// se t cambia vengono ricalcolati per intero, quindi nessuno stato sopravvive tra i frame.
const world = makeSample();
const now = makeScreen();
const before = makeScreen();
const after = makeScreen();
const screenX = new Float32Array(COUNT);
const screenY = new Float32Array(COUNT);
const velX = new Float32Array(COUNT);
const velY = new Float32Array(COUNT);
const radii = new Float32Array(COUNT);
const alphas = new Float32Array(COUNT);
const depths = new Float32Array(COUNT);
let computedT = Number.NaN;
let computedFor: System | null = null;

/** Dissolvenza dell'uscita: 1 fino a poco dopo l'esplosione, 0 esatto a T.end. */
const exitFade = (t: number): number => 1 - smooth((t - (T.burst + 3.5)) / (T.end - T.burst - 3.5));

const compute = (system: System, t: number): void => {
	if (computedT === t && computedFor === system) return;
	const lens = lensOf(cameraAt(t));
	const lensA = lensOf(cameraAt(t - DT));
	const lensB = lensOf(cameraAt(t + DT));
	const flash = beatFlash(t);
	const sizeK = 1 + 0.25 * flash;
	const alphaK = (1 + 0.6 * flash) * exitFade(t);
	const inv = 1 / (2 * DT);
	const {particles} = system;
	for (let i = 0; i < COUNT; i++) {
		const p = particles[i];
		sampleParticle(p, t - DT, world);
		project(world, lensA, before);
		sampleParticle(p, t + DT, world);
		project(world, lensB, after);
		sampleParticle(p, t, world);
		project(world, lens, now);
		const near = clamp((FOCAL - 160 - now.z) / 380);
		const depth = clamp(1 + now.z / 520, 0.3, 1.3);
		const accent = p.node ? world.accent : 0;
		screenX[i] = now.x;
		screenY[i] = now.y;
		velX[i] = (after.x - before.x) * inv;
		velY[i] = (after.y - before.y) * inv;
		// le particelle che volano verso la camera diventano bokeh larghi e tenui
		depths[i] = (depth * near) / Math.max(1, now.k * now.k * 0.55);
		radii[i] = (p.radius + 1.5 * accent) * Math.pow(now.k, 1.2) * sizeK * (0.9 + 0.1 * world.gain);
		// guadagno della forma (creste, onde di luce) × scintillio
		alphas[i] =
			lerp(p.alpha, 0.95, accent) * world.gain * (0.86 + 0.14 * Math.sin(t * 0.9 + p.twinkle)) * depths[i] * alphaK;
	}
	computedT = t;
	computedFor = system;
};

// ───────────────────────────── primitive di disegno ─────────────────────────────

/** Sprite luminoso allungato lungo la velocità (motion blur direzionale a costo di un solo drawImage). */
const stamp = (
	ctx: CanvasRenderingContext2D,
	sprite: HTMLCanvasElement,
	x: number,
	y: number,
	radius: number,
	a: number,
	vx: number,
	vy: number,
	shutter: number,
): void => {
	if (a <= 0.004 || radius <= 0.05) return;
	const d = radius * 6;
	const speed = Math.hypot(vx, vy);
	// zona morta: le forme assestate restano fatte di punti rotondi
	const len = speed * shutter - 1.5;
	if (len > 0) {
		const stretch = (d + len) / d;
		const ux = vx / speed;
		const uy = vy / speed;
		ctx.setTransform(ux * stretch, uy * stretch, -uy, ux, x, y);
		ctx.globalAlpha = Math.min(1, a * Math.pow(d / (d + len), 0.5));
	} else {
		ctx.setTransform(1, 0, 0, 1, x, y);
		ctx.globalAlpha = Math.min(1, a);
	}
	ctx.drawImage(sprite, -d / 2, -d / 2, d, d);
};

const resetTransform = (ctx: CanvasRenderingContext2D): void => {
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.globalAlpha = 1;
};

/** Gradiente radiale additivo centrato sul palco. */
const radialLight = (ctx: CanvasRenderingContext2D, radius: number, stops: [number, string][]): void => {
	const g = ctx.createRadialGradient(STAGE.cx, STAGE.cy, 0, STAGE.cx, STAGE.cy, radius);
	for (const [at, color] of stops) g.addColorStop(at, color);
	ctx.fillStyle = g;
	ctx.fillRect(STAGE.cx - radius, STAGE.cy - radius, radius * 2, radius * 2);
};

let soft: HTMLCanvasElement | null = null;
/** Sprite a campana (senza nucleo) per l'alone a bassa risoluzione. */
const softSprite = (): HTMLCanvasElement => {
	if (soft) return soft;
	const size = 64;
	const c = document.createElement('canvas');
	c.width = c.height = size;
	const g = c.getContext('2d')!;
	const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
	for (let i = 0; i <= 8; i++) {
		const u = i / 8;
		grad.addColorStop(u, alpha(COLORS.orange, Math.exp(-u * u * 4.2) * (1 - u * u)));
	}
	g.fillStyle = grad;
	g.fillRect(0, 0, size, size);
	soft = c;
	return c;
};

let sparkPath: Path2D | null = null;

// ───────────────────────────── livelli ─────────────────────────────

/** Lampo bianco dell'eruzione, poi "nucleo" caldo attorno a cui girano le orbite. */
const drawCore = (ctx: CanvasRenderingContext2D, t: number): void => {
	const seed = hit(t, 0, 5);
	if (seed > 0.01) {
		radialLight(ctx, 100 + 70 * t, [
			[0, alpha(COLORS.white, 0.95 * seed)],
			[0.25, alpha(COLORS.orangeHot, 0.55 * seed)],
			[1, alpha(COLORS.orange, 0)],
		]);
	}
	const nucleus = smooth(t / 3) * (1 - smooth((t - 7) / 4));
	if (nucleus > 0.01) {
		const pulse = 1 + 0.12 * Math.sin(t * 1.3);
		radialLight(ctx, 46 * pulse, [
			[0, alpha(COLORS.white, 0.9 * nucleus)],
			[0.2, alpha(COLORS.orangeHot, 0.7 * nucleus)],
			[0.5, alpha(COLORS.orange, 0.22 * nucleus)],
			[1, alpha(COLORS.orange, 0)],
		]);
	}
};

/** Linee guida delle tre orbite: precisione "vettoriale" sotto le particelle, solo nella prima forma. */
const drawOrbits = (ctx: CanvasRenderingContext2D, t: number, lens: Lens): void => {
	const a = ease.outCubic(clamp(t / 4)) * (1 - smooth((t - 6.5) / 4));
	if (a <= 0.01) return;
	const grow = ease.outExpo(clamp(t / T.eruptDur));
	ctx.lineWidth = 1.6;
	ctx.strokeStyle = alpha(COLORS.orangeBright, 0.4 * a);
	for (let r = 0; r < RINGS.length; r++) {
		ctx.beginPath();
		for (let i = 0; i <= 96; i++) {
			ringPoint(r, (i / 96) * TAU, RINGS[r].radius * grow, 0, t, world);
			project(world, lens, now);
			if (i === 0) ctx.moveTo(now.x, now.y);
			else ctx.lineTo(now.x, now.y);
		}
		ctx.stroke();
	}
};

/** Onda d'urto su ogni beat: un anello sottile che si allarga dal centro (sul piano della forma). */
const drawShockRings = (ctx: CanvasRenderingContext2D, t: number, lens: Lens, fade: number): void => {
	for (const b of BEATS) {
		const age = t - b;
		if (age < 0 || age >= 13) continue;
		const u = age / 13;
		const onWave = b === T.toWave;
		const radius = lerp(b === 0 ? 10 : 90, onWave ? 430 : 392, ease.outQuint(u));
		const a = Math.pow(1 - u, 1.6) * 0.62 * fade;
		ctx.beginPath();
		for (let i = 0; i <= 72; i++) {
			const phi = (i / 72) * TAU;
			if (onWave) wavePlane(radius * Math.cos(phi), radius * Math.sin(phi), 0, t, world);
			else {
				world.x = radius * Math.cos(phi);
				world.y = radius * Math.sin(phi);
				world.z = 0;
			}
			project(world, lens, now);
			if (i === 0) ctx.moveTo(now.x, now.y);
			else ctx.lineTo(now.x, now.y);
		}
		ctx.lineWidth = 12;
		ctx.strokeStyle = alpha(COLORS.orange, a * 0.16);
		ctx.stroke();
		ctx.lineWidth = lerp(3.4, 1.4, u);
		ctx.strokeStyle = alpha(COLORS.orangeHot, a);
		ctx.stroke();
	}
};

/** Fili che uniscono gli slot di ogni gruppo: contorni degli esagoni, poi creste dell'onda. */
const drawStrands = (ctx: CanvasRenderingContext2D, t: number): void => {
	const a = smooth((t - 11) / 4) * (1 - smooth((t - 36.5) / 5));
	if (a <= 0.01) return;
	ctx.lineWidth = 1.6;
	ctx.lineJoin = 'round';
	for (let g = 0; g < GROUPS; g++) {
		const o = g * SLOTS;
		ctx.strokeStyle = alpha(COLORS.orange, clamp(0.5 * a * depths[o + (SLOTS >> 1)]));
		ctx.beginPath();
		ctx.moveTo(screenX[o], screenY[o]);
		for (let s = 1; s < SLOTS; s++) ctx.lineTo(screenX[o + s], screenY[o + s]);
		ctx.stroke();
	}
};

/**
 * Sagoma vettoriale dello spark sotto le particelle: si rivela dal mozzo verso le punte
 * (come il reveal di ClaudeSpark) mentre le particelle la riempiono, poi si dilata e svanisce con l'esplosione.
 */
const drawSparkShape = (ctx: CanvasRenderingContext2D, t: number, cam: Camera): void => {
	const reveal = clamp((t - (T.toSpark - 3.5)) / 3.5);
	const out = 1 - smooth((t - T.burst) / 3);
	if (reveal <= 0 || out <= 0) return;
	if (!sparkPath) sparkPath = new Path2D(SPARK_PATH);
	const unit = SPARK_SIZE / SPARK_VIEWBOX;
	const grow = 1 + 1.6 * burstTravel(t);
	const breathe = 1 + 0.012 * Math.sin((t - T.toSpark) * 0.7);
	const s = unit * cam.scale * grow * breathe;
	ctx.save();
	ctx.translate(STAGE.cx, STAGE.cy);
	ctx.rotate(cam.roll);
	ctx.scale(s * Math.cos(cam.yaw), s * Math.cos(cam.pitch));
	if (reveal < 1) {
		ctx.beginPath();
		ctx.arc(0, 0, reveal * 12.8, 0, TAU);
		ctx.clip();
	}
	ctx.translate(-SPARK_CENTER.x, -SPARK_CENTER.y);
	const flash = hit(t, T.toSpark, 5);
	ctx.fillStyle = alpha(COLORS.orange, (0.2 + 0.25 * flash) * out);
	ctx.fill(sparkPath);
	ctx.lineWidth = 2.2 / s;
	ctx.lineJoin = 'round';
	ctx.strokeStyle = alpha(COLORS.orangeHot, 0.8 * out);
	ctx.stroke(sparkPath);
	ctx.restore();
};

// ───────────────────────────── API ─────────────────────────────

/** Canvas nitido: luce d'ambiente, guide, onde d'urto, pulviscolo e particelle. Funzione pura di t. */
export const drawSystem = (ctx: CanvasRenderingContext2D, system: System, t: number): void => {
	const fade = exitFade(t);
	if (fade <= 0) return;
	compute(system, t);
	const sprites = TONES.map(([color, core]) => glowSprite(color, core));
	const cam = cameraAt(t);
	const lens = lensOf(cam);
	const lensA = lensOf(cameraAt(t - DT));
	const lensB = lensOf(cameraAt(t + DT));
	const flash = beatFlash(t);
	const inv = 1 / (2 * DT);
	// nell'esplosione l'otturatore si apre: scie più lunghe
	const shutter = 0.5 + 0.45 * smooth((t - T.burst) / 3);

	ctx.globalCompositeOperation = 'lighter';
	ctx.lineCap = 'round';

	// luce d'ambiente che cresce con l'eruzione e pulsa sui beat
	const a = (0.1 + 0.16 * flash) * fade;
	radialLight(ctx, lerp(180, 560, ease.outCubic(clamp(t / 4))), [
		[0, alpha(COLORS.orangeBright, a)],
		[0.45, alpha(COLORS.orange, a * 0.42)],
		[1, alpha(COLORS.orange, 0)],
	]);
	drawCore(ctx, t);
	drawOrbits(ctx, t, lens);
	drawShockRings(ctx, t, lens, fade);
	drawSparkShape(ctx, t, cam);
	drawStrands(ctx, t);

	// pulviscolo orbitante
	const dustK = (1 + 0.6 * flash) * fade;
	for (const d of system.dust) {
		sampleDust(d, t - DT, world);
		project(world, lensA, before);
		sampleDust(d, t + DT, world);
		project(world, lensB, after);
		sampleDust(d, t, world);
		project(world, lens, now);
		const near = clamp((FOCAL - 160 - now.z) / 380);
		const depth = clamp(1 + now.z / 520, 0.3, 1.3);
		stamp(
			ctx,
			sprites[d.tone],
			now.x,
			now.y,
			d.radius * Math.pow(now.k, 1.2),
			(d.alpha * world.gain * depth * near * dustK) / Math.max(1, now.k * now.k * 0.6),
			(after.x - before.x) * inv,
			(after.y - before.y) * inv,
			shutter,
		);
	}

	const {particles} = system;
	for (let i = 0; i < COUNT; i++) {
		stamp(ctx, sprites[particles[i].tone], screenX[i], screenY[i], radii[i], alphas[i], velX[i], velY[i], shutter);
	}
	resetTransform(ctx);
};

/**
 * Canvas dell'alone (1/4 di risoluzione, ingrandito via CSS): una particella su quattro deposita
 * una campana larga e tenue. Dà il bagliore morbido attorno alle forme senza filtri blur.
 */
export const drawBloom = (ctx: CanvasRenderingContext2D, system: System, t: number): void => {
	if (exitFade(t) <= 0) return;
	compute(system, t);
	const sprite = softSprite();
	const {particles} = system;
	ctx.globalCompositeOperation = 'lighter';
	ctx.setTransform(BLOOM_SCALE, 0, 0, BLOOM_SCALE, 0, 0);
	for (let i = 0; i < COUNT; i++) {
		if (!particles[i].bloom) continue;
		const a = alphas[i] * 0.085;
		if (a <= 0.003) continue;
		const r = 64 + radii[i] * 9;
		ctx.globalAlpha = Math.min(1, a);
		ctx.drawImage(sprite, screenX[i] - r, screenY[i] - r, r * 2, r * 2);
	}
	resetTransform(ctx);
};
