import {buildNet, NetCamera} from '../../../v02/components/NeuralNet';
import {clamp, ease, hash, invLerp, lerp} from '../../../lib/math';
import {V1_NET_AT_270, v1NetYaw} from '../../timeline';
import {T} from './layout';

export const NET = buildNet();

/** Inizio della convergenza finale sulla posa condivisa V1_NET_AT_270 (ultimi ~30 frame). */
const CONV = T.end - 31;

/**
 * Camera della rete (225–269): parte DENTRO la rete (dist piccola, nodi enormi che sfrecciano) mentre
 * seguiamo i token; la distanza cresce e la rete si ricompone, poi converge ESATTAMENTE su V1_NET_AT_270
 * a 269 (pendenza nulla, yaw = v1NetYaw(abs)).
 */
export const netState = (abs: number) => {
	const t = clamp((abs - T.intoNet) / (T.end - T.intoNet));
	const c = ease.inOutCubic(invLerp(CONV, T.end, abs));
	const fly = ease.outCubic(t);
	const N = V1_NET_AT_270;
	const cam: Required<NetCamera> = {
		cx: lerp(lerp(540, 540, fly), N.cx, c),
		cy: lerp(lerp(980, 800, fly), N.cy, c),
		scale: lerp(lerp(0.62, 0.85, fly), N.scale, c),
		pitch: lerp(lerp(-0.78, -0.3, fly), N.pitch, c),
		dist: lerp(lerp(250, 1000, fly), N.dist, c),
		yaw: v1NetYaw(abs) - 1.15 * Math.pow(1 - t, 3),
	};
	return {
		cam,
		opacity: ease.outCubic(clamp((abs - (T.intoNet - 2)) / 9)),
		reveal: lerp(ease.outCubic(invLerp(T.intoNet - 2, 250, abs)), N.reveal, c),
		activity: lerp(0.12, N.activity, c),
		c,
	};
};

export type Proj = {x: number; y: number; k: number; depth: number};

/** Stessa proiezione del componente NeuralNet condiviso (per agganciare i token ai suoi nodi). */
export const projectNet = (cam: Required<NetCamera>): Proj[] => {
	const cyw = Math.cos(cam.yaw);
	const syw = Math.sin(cam.yaw);
	const cp = Math.cos(cam.pitch);
	const sp = Math.sin(cam.pitch);
	const f = 1100;
	return NET.nodes.map((p) => {
		const x1 = p.x * cyw + p.z * syw;
		const z1 = -p.x * syw + p.z * cyw;
		const y2 = p.y * cp - z1 * sp;
		const z2 = p.y * sp + z1 * cp;
		const depth = cam.dist + z2;
		const k = depth > 40 ? f / depth : 0;
		return {x: cam.cx + x1 * k * cam.scale, y: cam.cy + y2 * k * cam.scale, k, depth};
	});
};

/** Nodi dello strato di ingresso (0) e percorso di ogni token lungo le connessioni, strato per strato. */
const INPUT = NET.nodes.map((n, i) => ({n, i})).filter((o) => o.n.layer === 0);
const ENTRY = [4, 0, 6, 2, 8, 5, 1, 7, 3, 4, 0];

export const tokenPath = (i: number): number[] => {
	const path = [INPUT[ENTRY[i] % INPUT.length].i];
	for (let l = 0; l < 5; l++) {
		const from = path[path.length - 1];
		const out = NET.edges.filter((e) => e.a === from);
		if (!out.length) break;
		path.push(out[Math.floor(hash(i * 7 + l, 61) * out.length)].b);
	}
	return path;
};
export const PATHS = Array.from({length: 11}, (_, i) => tokenPath(i));
export const HOP = 5;
