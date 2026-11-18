import React from 'react';
import {FrameCanvas} from '../../../components/FrameCanvas';
import {drawGlow} from '../../../lib/canvas';
import {clamp, ease, hash, TAU} from '../../../lib/math';
import {a4, C4} from '../../theme';
import {ThreatMessage} from '../defend/Threat';
import {IMPACT, MSG_BOX} from './handoff';

type Pt = {x: number; y: number};
type Shard = {poly: Pt[]; c: Pt; dir: Pt; speed: number; rz: number; rx: number; ry: number; fadeAt: number; ring: number};

const K = 9; // spicchi radiali
const R_FAR = 950;
const LIFE = 30;

const clampBox = (p: Pt): Pt => ({x: clamp(p.x, MSG_BOX.left, MSG_BOX.right), y: clamp(p.y, MSG_BOX.top, MSG_BOX.bottom)});

/** Frammenti deterministici: spicchi attorno al punto d'impatto, su tre anelli (vicino, medio, lontano). */
const makeShards = (): {shards: Shard[]; spokes: Pt[][]} => {
	const ang = Array.from({length: K}, (_, i) => ((i + 0.2 + hash(i, 11) * 0.6) / K) * TAU);
	const r1 = ang.map((_, i) => 92 + hash(i, 12) * 48);
	const r2 = ang.map((_, i) => 232 + hash(i, 13) * 96);
	const pt = (i: number, r: number): Pt => ({x: IMPACT.x + Math.cos(ang[i % K]) * r, y: IMPACT.y + Math.sin(ang[i % K]) * r});
	const shards: Shard[] = [];
	for (let i = 0; i < K; i++) {
		const j = (i + 1) % K;
		const rings: Pt[][] = [
			[{...IMPACT}, pt(i, r1[i]), pt(j, r1[j])],
			[pt(i, r1[i]), pt(i, r2[i]), pt(j, r2[j]), pt(j, r1[j])],
			[pt(i, r2[i]), pt(i, R_FAR), pt(j, R_FAR), pt(j, r2[j])],
		];
		rings.forEach((poly, ring) => {
			const vis = poly.map(clampBox);
			const c = {x: vis.reduce((n, p) => n + p.x, 0) / vis.length, y: vis.reduce((n, p) => n + p.y, 0) / vis.length};
			const dx = c.x - IMPACT.x;
			const dy = c.y - IMPACT.y;
			const len = Math.hypot(dx, dy) || 1;
			const seed = i * 3 + ring;
			shards.push({
				poly,
				c,
				dir: {x: dx / len, y: dy / len},
				speed: [820, 600, 430][ring] * (0.75 + 0.5 * hash(seed, 21)),
				rz: (hash(seed, 22) - 0.5) * 2 * (ring === 2 ? 50 : 110),
				rx: (hash(seed, 23) - 0.5) * 2 * 70,
				ry: (hash(seed, 24) - 0.5) * 2 * 70,
				fadeAt: 5 + hash(seed, 25) * 8 + ring * 2,
				ring,
			});
		});
	}
	const spokes = ang.map((_, i) => [{...IMPACT}, pt(i, r1[i]), pt(i, r2[i]), pt(i, R_FAR)]);
	return {shards, spokes};
};

const SHARDS = makeShards();

/** Pixel rossi in cui il messaggio si dissolve + scintille verdi dell'urto. */
const PIXELS = Array.from({length: 520}, (_, i) => {
	const x = MSG_BOX.left + hash(i, 31) * (MSG_BOX.right - MSG_BOX.left);
	const y = MSG_BOX.top + hash(i, 32) * (MSG_BOX.bottom - MSG_BOX.top);
	const dx = x - IMPACT.x;
	const dy = y - IMPACT.y;
	const len = Math.hypot(dx, dy) || 1;
	const fast = hash(i, 33) < 0.55;
	return {
		x,
		y,
		dir: {x: dx / len, y: dy / len},
		v: fast ? 9 + hash(i, 34) * 22 : 0.6 + hash(i, 34) * 2.5,
		t0: 1 + hash(i, 35) * 14 + (len / 400) * 4,
		life: 10 + hash(i, 36) * 18,
		size: 2 + Math.floor(hash(i, 37) * 4) * 2,
		col: [C4.red, C4.redBright, C4.redHot, C4.red, C4.white][Math.floor(hash(i, 38) * 5)],
	};
});
const SPARKS = Array.from({length: 70}, (_, i) => ({a: hash(i, 41) * TAU, v: 22 + hash(i, 42) * 34, life: 10 + hash(i, 43) * 12, r: 1.4 + hash(i, 44) * 2.2}));

/** Trasformazione di un frammento al frame t (0 = assemblato, sul cue). */
const shardMotion = (s: Shard, t: number) => {
	const k = ease.outCubic(clamp(t / LIFE));
	const travel = s.speed * k;
	return {
		tx: s.dir.x * travel,
		ty: s.dir.y * travel + 0.32 * t * t,
		rz: s.rz * k,
		rx: s.rx * k,
		ry: s.ry * k,
		sc: 1 - 0.3 * k,
		op: 1 - ease.inQuad(clamp((t - s.fadeAt) / 10)),
	};
};

/**
 * Distruzione del messaggio fraudolento sul cue 720: il FakeMessage condiviso è ritagliato in frammenti
 * (clip-path) che esplodono dal punto d'impatto ruotando in 3D; crepe luminose al primo frame, pixel rossi che
 * si dissolvono, scintille e onda d'urto verdi (canvas).
 */
export const Shatter: React.FC<{f: number}> = ({f}) => {
	if (f > LIFE + 14) return null;
	const t = Math.max(0, f - 1); // frame 0 = messaggio ancora intero ma incrinato
	return (
		<>
			{/* frammenti */}
			<div style={{position: 'absolute', inset: 0, perspective: 1600, perspectiveOrigin: `${IMPACT.x}px ${IMPACT.y}px`}}>
				{SHARDS.shards.map((s, i) => {
					const m = shardMotion(s, t);
					if (m.op <= 0.01) return null;
					return (
						<div
							key={i}
							style={{
								position: 'absolute',
								inset: 0,
								clipPath: `polygon(${s.poly.map((p) => `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`).join(', ')})`,
								transformOrigin: `${s.c.x}px ${s.c.y}px`,
								transform: `translate(${m.tx}px, ${m.ty}px) rotateX(${m.rx}deg) rotateY(${m.ry}deg) rotate(${m.rz}deg) scale(${m.sc})`,
								opacity: m.op,
							}}
						>
							<ThreatMessage />
						</div>
					);
				})}
			</div>
			{/* crepe, pixel, scintille, onda d'urto */}
			<FrameCanvas
				frame={f}
				additive
				draw={(ctx) => {
					// crepe luminose (solo nei primi frame, sul messaggio ancora intero)
					const crack = 1 - clamp(f / 5);
					if (crack > 0) {
						ctx.save();
						ctx.beginPath();
						ctx.rect(MSG_BOX.left, MSG_BOX.top, MSG_BOX.right - MSG_BOX.left, MSG_BOX.bottom - MSG_BOX.top);
						ctx.clip();
						ctx.lineJoin = 'round';
						for (const sp of SHARDS.spokes) {
							for (const [w, col, al] of [
								[10, C4.green, 0.3],
								[3, C4.greenHot, 0.95],
							] as const) {
								ctx.beginPath();
								ctx.moveTo(sp[0].x, sp[0].y);
								for (let k = 1; k < sp.length; k++) ctx.lineTo(sp[k].x + (hash(k, sp[1].x | 0) - 0.5) * 12, sp[k].y + (hash(k, sp[1].y | 0) - 0.5) * 12);
								ctx.strokeStyle = a4(col, al * crack);
								ctx.lineWidth = w;
								ctx.stroke();
							}
						}
						ctx.restore();
					}
					// pixel rossi che si dissolvono
					for (const p of PIXELS) {
						const age = f - p.t0;
						if (age < 0 || age > p.life) continue;
						const life = 1 - age / p.life;
						const d = p.v * age * (1 - age / (p.life * 2.2));
						const x = Math.round((p.x + p.dir.x * d) / 2) * 2;
						const y = Math.round((p.y + p.dir.y * d + 0.15 * age * age) / 2) * 2;
						ctx.globalAlpha = Math.min(1, life * 1.2);
						ctx.fillStyle = p.col;
						ctx.fillRect(x, y, p.size, p.size);
					}
					ctx.globalAlpha = 1;
					// scintille verdi radiali
					for (let i = 0; i < SPARKS.length; i++) {
						const s = SPARKS[i];
						if (f > s.life) continue;
						const k = f / s.life;
						const d = s.v * f * (1 - k * 0.45);
						drawGlow(ctx, IMPACT.x + Math.cos(s.a) * d, IMPACT.y + Math.sin(s.a) * d * 0.8, s.r * (1 - k * 0.6), C4.green, 1 - k, C4.greenHot);
					}
					// onde d'urto
					for (const [at, k, w] of [
						[0, 1, 1],
						[3, 0.75, 0.6],
					] as const) {
						const tt = f - at;
						if (tt < 0) continue;
						const p = clamp(tt / 24);
						if (p >= 1) continue;
						const R = 40 + 1150 * k * ease.outCubic(p);
						const life = Math.pow(1 - p, 1.4) * w;
						ctx.beginPath();
						ctx.ellipse(IMPACT.x, IMPACT.y, R, R * 0.92, 0, 0, TAU);
						ctx.strokeStyle = a4(C4.green, 0.3 * life);
						ctx.lineWidth = 60 * (1 - p) + 8;
						ctx.stroke();
						ctx.strokeStyle = a4(C4.greenBright, 0.7 * life);
						ctx.lineWidth = 10 * (1 - p) + 2;
						ctx.stroke();
						ctx.strokeStyle = a4(C4.greenHot, life);
						ctx.lineWidth = 2.5;
						ctx.stroke();
					}
					// lampo all'impatto
					const flash = Math.exp(-f / 2);
					if (flash > 0.04) {
						drawGlow(ctx, IMPACT.x, IMPACT.y, 70 * (1 + f * 0.25), C4.green, 0.9 * flash, C4.greenHot);
						ctx.globalAlpha = 0.7 * flash;
						const g = ctx.createLinearGradient(0, 0, 1080, 0);
						g.addColorStop(0, a4(C4.green, 0));
						g.addColorStop(0.5, a4(C4.greenHot, 1));
						g.addColorStop(1, a4(C4.green, 0));
						ctx.fillStyle = g;
						ctx.fillRect(-40, IMPACT.y - 3 - 2 * f, 1160, 6 + 4 * f);
						ctx.globalAlpha = 1;
					}
				}}
			/>
		</>
	);
};
