import React, {useMemo} from 'react';
import {FrameCanvas} from '../../components/FrameCanvas';
import {drawGlow, withAlpha} from '../../lib/canvas';
import {clamp, hash, TAU} from '../../lib/math';
import {COLORS} from '../../theme';
import {HEIGHT, WIDTH} from '../../timeline';

/**
 * Rete neurale luminosa in pseudo-3D (canvas): strati di neuroni disposti ad anello lungo l'asse verticale,
 * connessioni tra strati consecutivi e impulsi che viaggiano dall'alto (input) verso il basso (output).
 * Tutto è funzione pura di `frame` + parametri della camera: sicuro per il render parallelo.
 */
export type NetNode = {x: number; y: number; z: number; layer: number; i: number};
export type NetEdge = {a: number; b: number; seed: number};

const LAYERS = [9, 14, 18, 18, 14, 7];

export const buildNet = (): {nodes: NetNode[]; edges: NetEdge[]} => {
	const nodes: NetNode[] = [];
	const n = LAYERS.length;
	LAYERS.forEach((count, l) => {
		const radius = 150 + 190 * Math.sin((Math.PI * (l + 0.5)) / n); // più largo al centro: silhouette a "botte"
		const y = (l - (n - 1) / 2) * 150;
		for (let i = 0; i < count; i++) {
			const a = (i / count) * TAU + l * 0.37;
			const wob = 0.86 + 0.28 * hash(l, i);
			nodes.push({x: Math.cos(a) * radius * wob, y: y + (hash(i, l + 9) - 0.5) * 40, z: Math.sin(a) * radius * wob, layer: l, i});
		}
	});
	const edges: NetEdge[] = [];
	let base = 0;
	for (let l = 0; l < n - 1; l++) {
		const cur = LAYERS[l];
		const next = LAYERS[l + 1];
		for (let i = 0; i < cur; i++) {
			const center = Math.round((i / cur) * next);
			for (const off of [-1, 0, 1, 3]) {
				const j = (((center + off) % next) + next) % next;
				edges.push({a: base + i, b: base + cur + j, seed: edges.length});
			}
		}
		base += cur;
	}
	return {nodes, edges};
};

export type NetCamera = {
	cx?: number; // centro sullo schermo
	cy?: number;
	scale?: number;
	yaw?: number; // radianti
	pitch?: number;
	/** Distanza della camera: valori bassi = dentro la rete (fly-through). */
	dist?: number;
};

export const NeuralNet: React.FC<{
	frame: number;
	camera?: NetCamera;
	/** 0..1: i neuroni si accendono dal centro verso l'esterno. */
	reveal?: number;
	/** 0..1: densità degli impulsi che attraversano la rete. */
	activity?: number;
	/** Opacità generale. */
	opacity?: number;
	/** Impulso globale (es. su un beat), 0..1. */
	flash?: number;
	/** Strato evidenziato (-1 = nessuno). */
	focusLayer?: number;
	width?: number;
	height?: number;
}> = ({frame, camera = {}, reveal = 1, activity = 0.6, opacity = 1, flash = 0, focusLayer = -1, width = WIDTH, height = HEIGHT}) => {
	const net = useMemo(buildNet, []);
	const {cx = width / 2, cy = height / 2, scale = 1, yaw = 0, pitch = -0.18, dist = 1400} = camera;

	const draw = (ctx: CanvasRenderingContext2D): void => {
		if (opacity <= 0.003) return;
		const cyw = Math.cos(yaw);
		const syw = Math.sin(yaw);
		const cp = Math.cos(pitch);
		const sp = Math.sin(pitch);
		const f = 1100;
		const proj = net.nodes.map((p) => {
			const x1 = p.x * cyw + p.z * syw;
			const z1 = -p.x * syw + p.z * cyw;
			const y2 = p.y * cp - z1 * sp;
			const z2 = p.y * sp + z1 * cp;
			const depth = dist + z2;
			const k = depth > 40 ? f / depth : 0;
			return {x: cx + x1 * k * scale, y: cy + y2 * k * scale, k, depth};
		});
		// comparsa: dal centro della rete verso l'esterno
		const vis = net.nodes.map((p) => {
			const r = Math.hypot(p.x, p.y * 0.8, p.z) / 520;
			return clamp((reveal * 1.4 - r) / 0.35);
		});
		const fog = (d: number) => clamp(1.25 - (d - dist + 300) / 900, 0.12, 1);

		ctx.globalCompositeOperation = 'lighter';
		ctx.lineCap = 'round';
		// connessioni
		for (const e of net.edges) {
			const A = proj[e.a];
			const B = proj[e.b];
			if (!A.k || !B.k) continue;
			const v = Math.min(vis[e.a], vis[e.b]);
			if (v <= 0.01) continue;
			const focus = focusLayer >= 0 && net.nodes[e.a].layer === focusLayer ? 1 : 0;
			const a = (0.16 + 0.14 * focus + 0.2 * flash) * v * fog((A.depth + B.depth) / 2) * opacity;
			ctx.strokeStyle = withAlpha(COLORS.orange, a);
			ctx.lineWidth = Math.max(0.8, 1.8 * Math.min(A.k, B.k) * scale);
			ctx.beginPath();
			ctx.moveTo(A.x, A.y);
			ctx.lineTo(B.x, B.y);
			ctx.stroke();
		}
		// impulsi lungo le connessioni (input in alto → output in basso)
		if (activity > 0) {
			for (const e of net.edges) {
				if (hash(e.seed, 3) > activity) continue;
				const A = proj[e.a];
				const B = proj[e.b];
				if (!A.k || !B.k) continue;
				const v = Math.min(vis[e.a], vis[e.b]);
				if (v <= 0.05) continue;
				const period = 26 + Math.floor(hash(e.seed, 5) * 18);
				const t = (((frame + net.nodes[e.a].layer * 7 + hash(e.seed, 7) * period) % period) + period) % period / period;
				const x = A.x + (B.x - A.x) * t;
				const y = A.y + (B.y - A.y) * t;
				const k = (A.k + B.k) / 2;
				const fade = Math.sin(Math.PI * t);
				drawGlow(ctx, x, y, 3.2 * k * scale + 0.9, COLORS.orangeBright, 0.85 * fade * v * fog((A.depth + B.depth) / 2) * opacity, COLORS.white);
			}
		}
		// neuroni (ordinati per profondità: i più lontani prima)
		const order = proj.map((p, i) => i).sort((i, j) => proj[j].depth - proj[i].depth);
		for (const i of order) {
			const P = proj[i];
			if (!P.k) continue;
			const v = vis[i];
			if (v <= 0.01) continue;
			const node = net.nodes[i];
			const pulse = 0.5 + 0.5 * Math.sin(frame / 9 + i * 1.7);
			const focus = focusLayer === node.layer ? 1 : 0;
			const rad = (7 + 2.4 * pulse + 4 * focus + 4 * flash) * P.k * scale;
			const a = (0.55 + 0.3 * pulse + 0.3 * flash) * v * fog(P.depth) * opacity;
			drawGlow(ctx, P.x, P.y, rad, node.layer % 2 ? COLORS.orange : COLORS.orangeBright, Math.min(1, a), COLORS.orangeHot);
		}
		ctx.globalCompositeOperation = 'source-over';
	};

	return <FrameCanvas frame={frame} width={width} height={height} additive draw={draw} />;
};
