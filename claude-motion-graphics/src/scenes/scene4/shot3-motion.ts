import {clamp, ease, hash, hit, lerp, prog, TAU} from '../../lib/math';

/**
 * Shot 3 "OGGETTI 3D" — coreografia in forma chiusa.
 * Tutto lo stato della scena (camera, oggetti, luci, FX 2D) è una funzione pura del frame locale 0..44.
 * Beat interni: 0 (ingresso), 15 (colpo di rotazione), 30 (passata di luce). Uscita: 40..44.
 */
export const SHOT3_BEATS = [0, 15, 30] as const;
const EXIT_AT = 40;
const EXIT_LEN = 4;

export type V3 = [number, number, number];
export type SatelliteKind = 'sphere' | 'cube' | 'orb';

type SatelliteDef = {
	kind: SatelliteKind;
	radius: number; // raggio dell'orbita (unità mondo)
	size: number;
	incl: number; // inclinazione del piano orbitale
	node: number; // orientamento del piano orbitale
	phase: number;
	speed: number; // rad/frame
};

/** Satelliti: sfere bianche lucide, cubi grigi cromati, piccoli globi luminosi arancioni. */
const SATELLITES: SatelliteDef[] = [
	{kind: 'sphere', radius: 2.72, size: 0.25, incl: 0.3, node: 0.4, phase: 0.5, speed: 0.052},
	{kind: 'cube', radius: 2.95, size: 0.33, incl: -0.42, node: 2.2, phase: 2.5, speed: 0.04},
	{kind: 'orb', radius: 2.3, size: 0.085, incl: 0.55, node: 4.1, phase: 4.3, speed: 0.075},
	{kind: 'sphere', radius: 3.15, size: 0.13, incl: -0.2, node: 1.2, phase: 3.6, speed: 0.058},
	{kind: 'cube', radius: 2.4, size: 0.19, incl: 0.5, node: 5.3, phase: 1.3, speed: -0.06},
	{kind: 'orb', radius: 3.05, size: 0.065, incl: -0.5, node: 3.0, phase: 5.6, speed: 0.066},
	{kind: 'orb', radius: 1.95, size: 0.055, incl: 0.2, node: 0.9, phase: 2.9, speed: -0.09},
];

/** outBack con overshoot ridotto (~4%): per elementi che non devono uscire dal palco. */
const softBack = (t: number): number => 1 + 1.9 * Math.pow(t - 1, 3) + 0.9 * Math.pow(t - 1, 2);

/** Integrale di un impulso di velocità: 0 prima di `at`, poi sale verso 1 e si assesta (colpo di rotazione). */
export const kick = (f: number, at: number, tau = 4.5): number => (f < at ? 0 : 1 - Math.exp(-(f - at) / tau));

export type Shot3State = {
	camera: {position: V3; target: V3};
	hero: {rotation: V3; scale: number};
	rings: {rotation: V3; scale: number}[];
	shell: {rotation: V3; scale: number; opacity: number};
	satellites: {kind: SatelliteKind; position: V3; rotation: V3; scale: number; glow: number}[];
	floor: {intensity: number; drift: number; rippleRadius: V3; rippleAmp: V3};
	light: {envRotation: number; envIntensity: number; keyPosition: V3; keyIntensity: number; rimIntensity: number};
	dust: {rotation: number; opacity: number};
	/** FX 2D attorno al canvas (bloom finto, punto luce finale). */
	fx: {backGlow: number; streak: number; veil: number; collapse: number; core: number};
};

export const shot3State = (f: number): Shot3State => {
	const h0 = hit(f, 0, 9);
	const h15 = hit(f, 15, 8);
	const h30 = hit(f, 30, 8);
	const k15 = kick(f, 15);
	const k30 = kick(f, 30, 5);

	// Uscita: tutto collassa in un punto di luce al centro (che lo shot successivo fa esplodere).
	const e = clamp((f - EXIT_AT) / EXIT_LEN);
	const collapse = ease.inQuad(e);
	const antic = prog(f, 36.5, 3.5, ease.outQuad) * (1 - e); // piccola anticipazione prima del collasso

	// Camera: carrellata rapida in ingresso, poi orbita lenta con spinta sul beat 30.
	const az = lerp(-0.46, 0.4, ease.inOutSine(f / 44)) + 0.05 * k30;
	const el = lerp(0.25, 0.15, f / 44);
	const dist = 8.5 + 3.4 * Math.exp(-f / 2.6) - 0.22 * (f / 44) - 0.4 * k30 + 0.5 * collapse;
	const target: V3 = [0, -0.08, 0];
	const camera = {
		position: [
			target[0] + dist * Math.sin(az) * Math.cos(el),
			target[1] + dist * Math.sin(el),
			target[2] + dist * Math.cos(az) * Math.cos(el),
		] as V3,
		target,
	};

	// Eroe: ingresso con overshoot, impulsi di scala sui beat, rotazione con "calci" che si smorzano.
	const enter = lerp(0.35, 1, ease.outBack(clamp(f / 8)));
	const heroScale = enter * (1 + 0.06 * h15 + 0.085 * h30 + 0.04 * antic) * (1 - collapse);
	const hero = {
		rotation: [
			0.55 + 0.016 * f + 0.85 * k30,
			-2.4 * Math.exp(-f / 3.4) + 0.048 * f + 1.75 * k15 + 0.9 * k30 + 2.6 * collapse,
			0.2 + 0.012 * f,
		] as V3,
		scale: heroScale,
	};

	// Anelli giroscopici: arrivano dall'esterno sfalsati, ruotano su assi diversi.
	const ringIn = (i: number) => lerp(0.2, 1, softBack(clamp((f - i * 2) / 10)));
	const ringOut = (i: number) => 1 - ease.inQuad(clamp((f - EXIT_AT + i * 0.6) / EXIT_LEN));
	const rings = [
		{
			rotation: [1.25 + 0.034 * f + 0.9 * k15, 0.4 + 0.058 * f, 0.1] as V3,
			scale: ringIn(0) * (1 + 0.04 * h15 + 0.06 * h30) * ringOut(0),
		},
		{
			rotation: [-0.55 - 0.04 * f, 0.2 + 0.03 * f + 1.1 * k30, 0.9 + 0.01 * f] as V3,
			scale: ringIn(1) * (1 + 0.03 * h15 + 0.06 * h30) * ringOut(1),
		},
	];

	// Onda wireframe: un icosaedro che si espande dall'eroe e svanisce a ogni beat (15 e 30).
	const waveAt = f >= 30 ? 30 : f >= 15 ? 15 : -99;
	const wt = clamp((f - waveAt) / 11);
	const shell = {
		rotation: [0.3 - 0.012 * f, -0.03 * f, 0.15] as V3,
		scale: lerp(0.78, 1.75, ease.outQuint(wt)),
		opacity: waveAt < 0 ? 0 : 0.85 * Math.pow(1 - wt, 1.6) * (waveAt === 30 ? 1 : 0.75),
	};

	// Satelliti: orbite inclinate; entrano a spirale, "respirano" sui beat, vengono risucchiati in uscita.
	const satellites = SATELLITES.map((s, i) => {
		const dir = Math.sign(s.speed);
		const arrive = prog(f, i * 0.9, 12, ease.outQuint);
		const suck = ease.inQuad(clamp((f - EXIT_AT + (i % 3) * 0.5) / EXIT_LEN));
		const r = s.radius * lerp(2.4, 1, arrive) * (1 + 0.1 * h15 + 0.14 * h30) * (1 - suck);
		const th = s.phase + s.speed * f - dir * 1.5 * (1 - arrive) + dir * (0.55 * k15 + 0.7 * k30) + dir * 2.2 * suck;
		// orbita nel piano XZ, poi inclinazione (asse X) e orientamento del nodo (asse Y)
		const x0 = r * Math.cos(th);
		const z0 = r * Math.sin(th);
		const y1 = -z0 * Math.sin(s.incl);
		const z1 = z0 * Math.cos(s.incl);
		const position: V3 = [
			x0 * Math.cos(s.node) + z1 * Math.sin(s.node),
			y1,
			-x0 * Math.sin(s.node) + z1 * Math.cos(s.node),
		];
		const spin = 0.05 + 0.04 * hash(i, 7);
		return {
			kind: s.kind,
			position,
			rotation: [0.4 + spin * f + 1.2 * k15, 0.9 + spin * 1.3 * f + 1.2 * k30, 0.2] as V3,
			scale: s.size * prog(f, i * 0.7, 6, ease.outBack) * (1 + 0.16 * h15 + 0.2 * h30) * (1 - 0.7 * suck),
			glow: (0.75 + 0.5 * h15 + 0.6 * h30 + 0.25 * Math.sin(f * 0.5 + i * 2)) * prog(f, i * 0.7, 5),
		};
	});

	// Pavimento: griglia prospettica con un'onda che parte dal centro a ogni beat.
	const ripple = (at: number): [number, number] => (f < at ? [0, 0] : [0.5 + (f - at) * 0.42, Math.exp(-(f - at) / 9)]);
	const [r0, a0] = ripple(0);
	const [r1, a1] = ripple(15);
	const [r2, a2] = ripple(30);
	const floor = {
		intensity: prog(f, 0, 6) * (1 - collapse) * (0.85 + 0.25 * h15 + 0.4 * h30),
		drift: f * 0.035,
		rippleRadius: [r0, r1, r2] as V3,
		rippleAmp: [a0, a1 * 1.1, a2 * 1.3] as V3,
	};

	// Luci: l'ambiente ruota di scatto sul beat 30 (i riflessi dei softbox "spazzano" la superficie).
	const keyAz = 0.75 - 1.5 * k30 + 0.35 * k15;
	const light = {
		envRotation: 0.35 + 0.014 * f + 0.7 * k15 + 2.3 * k30,
		envIntensity: (1 + 0.25 * h0 + 0.15 * h15 + 0.3 * h30) * (1 - 0.4 * collapse),
		keyPosition: [6 * Math.sin(keyAz), 5.5, 6 * Math.cos(keyAz)] as V3,
		keyIntensity: 1.6 + 0.4 * h15 + 1.1 * h30,
		rimIntensity: 55 + 50 * h0 + 40 * h15 + 70 * h30,
	};

	const dust = {rotation: 0.012 * f + 0.25 * k15 + 0.3 * k30, opacity: prog(f, 0, 8) * (1 - collapse)};

	const fx = {
		backGlow: (0.42 + 0.5 * h0 + 0.3 * h15 + 0.45 * h30) * (1 - 0.6 * collapse),
		streak: (0.3 + 0.5 * h0 + 0.3 * h15 + 0.6 * h30) * (1 - collapse),
		veil: 0.05 + 0.1 * h0 + 0.06 * h15 + 0.12 * h30,
		collapse,
		core: ease.inQuad(clamp((f - EXIT_AT - 0.5) / (EXIT_LEN - 0.5))),
	};

	return {camera, hero, rings, shell, satellites, floor, light, dust, fx};
};

/** Posizioni fisse del pulviscolo 3D (guscio sferico attorno alla scena). */
export const dustPositions = (count: number): Float32Array => {
	const out = new Float32Array(count * 3);
	for (let i = 0; i < count; i++) {
		const r = 2.2 + hash(i, 21) * 3.4;
		const a = hash(i, 22) * TAU;
		const y = (hash(i, 23) - 0.5) * 3.6;
		out[i * 3] = Math.cos(a) * r;
		out[i * 3 + 1] = y;
		out[i * 3 + 2] = Math.sin(a) * r;
	}
	return out;
};
