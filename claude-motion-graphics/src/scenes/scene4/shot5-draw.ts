import {glowSprite} from '../../lib/canvas';
import {clamp, ease, hit, lerp, TAU} from '../../lib/math';
import {alpha, COLORS} from '../../theme';
import {STAGE} from './stage';
import {
	COUNT,
	GROUPS,
	RINGS,
	SLOTS,
	Sample,
	System,
	makeSample,
	ringPoint,
	sampleDust,
	sampleParticle,
	wavePlane,
} from './shot5-system';
import {BEATS, Camera, T, beatFlash, cameraAt, smooth} from './shot5-timing';

/** Focale della prospettiva (px) e apertura dell'otturatore per le scie (frazione di frame). */
const FOCAL = 1250;
const SHUTTER = 0.5;
const DT = 0.3;

/** Famiglia arancione: [alone, nucleo] dal più profondo al più caldo. */
const TONES: [string, string][] = [
	[COLORS.orangeDeep, COLORS.orange],
	[COLORS.orange, COLORS.orangeHot],
	[COLORS.orangeBright, COLORS.white],
	[COLORS.orangeHot, COLORS.white],
];

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

// buffer riusati tra i frame (solo memoria di lavoro: nessuno stato che sopravvive al frame)
const world = makeSample();
const now = makeScreen();
const before = makeScreen();
const after = makeScreen();
const screenX = new Float32Array(COUNT);
const screenY = new Float32Array(COUNT);
const screenA = new Float32Array(COUNT);
const velX = new Float32Array(COUNT);
const velY = new Float32Array(COUNT);
const radii = new Float32Array(COUNT);
const gains = new Float32Array(COUNT);

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
): void => {
	if (a <= 0.004 || radius <= 0.05) return;
	const d = radius * 6;
	const speed = Math.hypot(vx, vy);
	const len = speed * SHUTTER;
	if (len > 1.2) {
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

/** Alone d'ambiente al centro del palco + lampo bianco dell'eruzione. */
const drawBloom = (ctx: CanvasRenderingContext2D, t: number, flash: number, fade: number): void => {
	const erupt = ease.outCubic(clamp(t / 4));
	const radius = lerp(180, 560, erupt);
	const a = (0.11 + 0.2 * flash) * fade;
	const g = ctx.createRadialGradient(STAGE.cx, STAGE.cy, 0, STAGE.cx, STAGE.cy, radius);
	g.addColorStop(0, alpha(COLORS.orangeBright, a));
	g.addColorStop(0.45, alpha(COLORS.orange, a * 0.42));
	g.addColorStop(1, alpha(COLORS.orange, 0));
	ctx.fillStyle = g;
	ctx.fillRect(STAGE.cx - radius, STAGE.cy - radius, radius * 2, radius * 2);
	const seed = hit(t, 0, 5);
	if (seed > 0.01) {
		const r2 = 90 + 60 * t;
		const g2 = ctx.createRadialGradient(STAGE.cx, STAGE.cy, 0, STAGE.cx, STAGE.cy, r2);
		g2.addColorStop(0, alpha(COLORS.white, 0.95 * seed));
		g2.addColorStop(0.25, alpha(COLORS.orangeHot, 0.55 * seed));
		g2.addColorStop(1, alpha(COLORS.orange, 0));
		ctx.fillStyle = g2;
		ctx.fillRect(STAGE.cx - r2, STAGE.cy - r2, r2 * 2, r2 * 2);
	}
};

/** Linee guida delle tre orbite: precisione "vettoriale" sotto le particelle, solo nella prima forma. */
const drawOrbits = (ctx: CanvasRenderingContext2D, t: number, lens: Lens): void => {
	const a = ease.outCubic(clamp(t / 4)) * (1 - smooth((t - 6.5) / 4));
	if (a <= 0.01) return;
	const grow = ease.outExpo(clamp(t / T.eruptDur));
	ctx.lineWidth = 1.6;
	ctx.strokeStyle = alpha(COLORS.orangeBright, 0.34 * a);
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
		const radius = lerp(b === 0 ? 10 : 70, 385, ease.outQuint(u));
		const a = Math.pow(1 - u, 1.6) * 0.62 * fade;
		const onWave = b === T.toWave;
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
	ctx.lineWidth = 1.5;
	ctx.lineJoin = 'round';
	for (let g = 0; g < GROUPS; g++) {
		const o = g * SLOTS;
		const depth = screenA[o + (SLOTS >> 1)];
		ctx.strokeStyle = alpha(COLORS.orange, 0.42 * a * depth);
		ctx.beginPath();
		ctx.moveTo(screenX[o], screenY[o]);
		for (let s = 1; s < SLOTS; s++) ctx.lineTo(screenX[o + s], screenY[o + s]);
		ctx.stroke();
	}
};

/** Disegna l'intero sistema al tempo t (frame locale dello shot). Funzione pura di t. */
export const drawSystem = (ctx: CanvasRenderingContext2D, system: System, t: number): void => {
	// dissolvenza dell'uscita: a T.end non resta nulla
	const fade = 1 - smooth((t - (T.burst + 2.5)) / (T.end - T.burst - 2.5));
	if (fade <= 0) return;
	const sprites = TONES.map(([color, core]) => glowSprite(color, core));
	const lens = lensOf(cameraAt(t));
	const lensA = lensOf(cameraAt(t - DT));
	const lensB = lensOf(cameraAt(t + DT));
	const flash = beatFlash(t);
	const sizeK = 1 + 0.28 * flash;
	const alphaK = (1 + 0.7 * flash) * fade;
	const inv = 1 / (2 * DT);

	ctx.globalCompositeOperation = 'lighter';
	drawBloom(ctx, t, flash, fade);
	drawOrbits(ctx, t, lens);
	drawShockRings(ctx, t, lens, fade);

	// pulviscolo orbitante
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
			(d.alpha * world.gain * depth * near * alphaK) / Math.max(1, now.k * now.k * 0.6),
			(after.x - before.x) * inv,
			(after.y - before.y) * inv,
		);
	}

	// particelle: prima passata = posizioni a schermo (servono anche ai fili)
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
		screenX[i] = now.x;
		screenY[i] = now.y;
		velX[i] = (after.x - before.x) * inv;
		velY[i] = (after.y - before.y) * inv;
		// le particelle che volano verso la camera diventano bokeh larghi e tenui
		screenA[i] = (depth * near) / Math.max(1, now.k * now.k * 0.55);
		radii[i] = p.radius * Math.pow(now.k, 1.2) * sizeK * (0.9 + 0.1 * world.gain);
		// guadagno della forma (creste, onde di luce) × scintillio
		gains[i] = world.gain * (0.86 + 0.14 * Math.sin(t * 0.9 + p.twinkle));
	}

	drawStrands(ctx, t);

	for (let i = 0; i < COUNT; i++) {
		const p = particles[i];
		const a = p.alpha * gains[i] * screenA[i] * alphaK;
		stamp(ctx, sprites[p.tone], screenX[i], screenY[i], radii[i], a, velX[i], velY[i]);
		// alone largo sui nodi: bloom morbido senza filtri
		if (p.node) stamp(ctx, sprites[1], screenX[i], screenY[i], radii[i] * 3.4, a * 0.16, velX[i], velY[i]);
	}
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.globalAlpha = 1;
};

