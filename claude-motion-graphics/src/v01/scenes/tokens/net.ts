import {buildNet, NetCamera} from '../../../v02/components/NeuralNet';
import {clamp, ease, hash, invLerp, lerp} from '../../../lib/math';
import {V1_NET_AT_270, v1NetYaw} from '../../timeline';
import {T} from './layout';

export const NET = buildNet();

/** Inizio della convergenza finale sulla posa condivisa V1_NET_AT_270 (ultimi ~30 frame). */
const CONV = T.end - 27;

type Pose = {cx: number; cy: number; scale: number; pitch: number; dist: number};
/** Rosone lontano visto dall'alto (lungo l'asse: ingresso verso di noi), poi DENTRO il tunnel degli strati. */
const FAR: Pose = {cx: 540, cy: 1000, scale: 0.75, pitch: 1.15, dist: 1500};
const DEEP: Pose = {cx: 540, cy: 760, scale: 0.75, pitch: 1.0, dist: 330};
const mixPose = (a: Pose, b: Pose, t: number): Pose => ({
	cx: lerp(a.cx, b.cx, t),
	cy: lerp(a.cy, b.cy, t),
	scale: lerp(a.scale, b.scale, t),
	pitch: lerp(a.pitch, b.pitch, t),
	dist: lerp(a.dist, b.dist, t),
});

/**
 * Camera della rete (223–269). I token volano nel rosone lontano (strato d'ingresso), la camera li SEGUE
 * dentro la rete lungo l'asse (gli anelli di neuroni sfrecciano via ai bordi), poi una gru esce e si posa:
 * dist piccola che cresce fino a V1_NET_AT_270, raggiunta ESATTAMENTE a 269 (pendenza nulla, yaw = v1NetYaw).
 */
export const netState = (abs: number) => {
	const t = clamp((abs - (T.intoNet - 2)) / (T.end - T.intoNet + 2));
	const dive = ease.inOutSine(invLerp(232, 252, abs));
	const c = ease.inOutCubic(invLerp(CONV, T.end, abs));
	const p = mixPose(mixPose(FAR, DEEP, dive), V1_NET_AT_270, c);
	const cam: Required<NetCamera> = {...p, yaw: v1NetYaw(abs) - 0.9 * Math.pow(1 - t, 3)};
	return {
		cam,
		// dentro la rete i neuroni vicinissimi diventano enormi: li si attenua un poco (a 269 opacità piena)
		opacity: ease.inOutSine(clamp((abs - (T.intoNet - 2)) / 10)) * (1 - 0.3 * dive * (1 - c)),
		reveal: lerp(lerp(0.45, 1, ease.outCubic(invLerp(T.intoNet - 2, 242, abs))), V1_NET_AT_270.reveal, c),
		activity: lerp(0.1, V1_NET_AT_270.activity, ease.inOutSine(invLerp(236, T.end, abs))),
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
export const HOP = 4.5;
