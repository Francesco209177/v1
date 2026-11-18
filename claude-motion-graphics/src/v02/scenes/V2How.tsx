import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {useAbsFrame} from '../../lib/frame';
import {beatPulse, clamp, ease, hash, hit, lerp, prog} from '../../lib/math';
import {alpha, COLORS} from '../../theme';
import {NeuralNet} from '../components/NeuralNet';
import {V2_NET_AT_270, v2NetYaw} from '../timeline';
import {ChipLabel, CPU, GPU, RAM, SSD} from './how/Chips';
import {Circuit} from './how/Circuit';
import {CollapseLight} from './how/CollapseLight';
import {BOX} from './how/layout';
import {NoteCard} from './how/NoteCard';
import {AnswerBubble, LoadStatus, PromptChip} from './how/PromptAnswer';
import {camAt, diagramLevel, HUB, loadP, NET_K, outP, popIn, procP, T} from './how/timing';

const gb = (v: number): string => v.toFixed(1).replace('.', ',');

/**
 * SCENA 3 — COME FUNZIONA (abs 270–509). "Il tuo hardware esegue il modello localmente…"
 * La rete del taglio diventa il cuore di uno schema "dentro il computer": SSD → RAM (caricamento),
 * CPU/GPU (elaborazione), risposta generata in locale (150 = abs 420), poi la nota sui limiti hardware.
 */
export const V2How: React.FC = () => {
	const f = useCurrentFrame();
	const abs = useAbsFrame();
	const cam = camAt(f);
	const lvl = diagramLevel(f);
	const out = outP(f);
	const lp = loadP(f);
	const pp = procP(f);
	const beat = beatPulse(abs, 5);
	const energy = prog(f, T.cardIn, T.collapse - T.cardIn, ease.inQuad);

	// --- la rete neurale: identica alla posa del taglio su f = 0 ---
	const pull = prog(f, 0, T.pullEnd, ease.inOutCubic);
	const loaded = hit(f, T.loadEnd, 14);
	const answerHit = hit(f, T.answer, 14);
	const netOpacity =
		lerp(1, 0.5, pull) + 0.5 * lp - 0.45 * prog(f, T.cardIn - 4, 14) * (1 - 0.5 * energy) - 0.0 * out;
	const activity = clamp(
		lerp(V2_NET_AT_270.activity, 0.12, pull) + 0.38 * lp + 0.5 * pp + 0.2 * energy,
	);
	const flash = clamp(0.8 * loaded + 1.0 * answerHit + 0.45 * beat * pp + 0.5 * beat * energy + 0.25 * hit(f, T.promptSend, 10));
	const focusLayer = f >= T.promptSend && f < T.answer + 6 ? Math.min(5, Math.floor((f - T.promptSend) / 5)) : -1;
	// piccola contrazione prima del colpo e rimbalzo dopo
	const squeeze = 1 - 0.07 * prog(f, T.answer - 7, 7, ease.inQuad) * (f < T.answer ? 1 : 0) + 0.06 * answerHit;

	// --- hardware ---
	const showTop = popIn(f, T.popTop);
	const showRam = popIn(f, T.popTop + 3);
	const showCpu = popIn(f, T.popBottom);
	const showGpu = popIn(f, T.popBottom + 3);
	const read = prog(f, T.loadStart - 2, 6) * (1 - prog(f, T.loadEnd - 4, 12)) + 0.25 * pp;
	const usedGB = 1.3 + 4.7 * lp;
	const access = pp * (0.5 + 0.5 * beatPulse(abs, 3, 7.5));
	const cpuHeat = clamp(0.06 + 0.12 * read + 0.75 * pp + 0.25 * answerHit);
	const gpuHeat = clamp(0.06 + 0.2 * prog(f, 56, 40) * (1 - prog(f, T.loadEnd, 10)) + 0.85 * pp + 0.3 * answerHit);
	const cores = Array.from({length: 8}, (_, i) => {
		const ph = (abs + i * 3.7) % 7.5;
		const pulse = Math.exp(-ph / 2.2);
		const idle = 0.08 + 0.25 * read * (hash(i, Math.floor(f / 3)) > 0.6 ? 1 : 0);
		return clamp(idle + pp * (0.25 + 0.75 * pulse) + 0.6 * answerHit);
	});
	const gpuCell = (c: number, r: number): number => {
		const wave = Math.max(0, Math.sin(c * 0.55 + r * 0.42 - f * 0.62));
		const wave2 = Math.max(0, Math.sin(c * -0.3 + r * 0.7 - f * 0.41 + 1.3));
		const spark = hash(c * 13 + r, Math.floor(f / 2)) > 0.86 ? 0.6 : 0;
		const loadGlow = 0.12 * prog(f, 56, 30) * hash(c, r + 7);
		return clamp(0.05 + loadGlow + pp * (0.12 + 0.75 * wave ** 3 + 0.4 * wave2 ** 4 + spark) + 0.7 * answerHit);
	};
	const vram = prog(f, 56, T.loadEnd - 56, ease.inOutSine);
	const boardOpacity = lvl * (1 - out);
	const auraK = (0.1 + 0.2 * lp + 0.25 * pp + 0.35 * answerHit + 0.15 * loaded) * (0.4 + 0.6 * lvl) + 0.3 * energy * beat;

	return (
		<AbsoluteFill>
			{/* alone caldo dietro il cuore del diagramma */}
			<div
				style={{
					position: 'absolute',
					left: HUB.x + cam.tx - 520 * cam.s,
					top: HUB.y + cam.ty - 520 * cam.s,
					width: 1040 * cam.s,
					height: 1040 * cam.s,
					borderRadius: '50%',
					background: `radial-gradient(closest-side, ${alpha(COLORS.orange, 0.32 * auraK)} 0%, ${alpha(COLORS.orangeDeep, 0.12 * auraK)} 45%, rgba(0,0,0,0) 100%)`,
					opacity: prog(f, 2, 24) * (1 - out),
				}}
			/>
			<Circuit frame={f} abs={abs} cam={cam} />
			<NeuralNet
				frame={abs}
				camera={{
					cx: HUB.x + cam.tx,
					cy: HUB.y + cam.ty,
					scale: NET_K * cam.s * squeeze,
					yaw: v2NetYaw(abs),
					pitch: lerp(V2_NET_AT_270.pitch, -0.3, pull),
					dist: V2_NET_AT_270.dist,
				}}
				reveal={V2_NET_AT_270.reveal}
				activity={activity}
				opacity={clamp(netOpacity)}
				flash={flash}
				focusLayer={focusLayer}
			/>
			{/* piano del diagramma: stessi parametri camera del canvas */}
			<div
				style={{
					position: 'absolute',
					left: 0,
					top: 0,
					width: 1080,
					height: 1920,
					transformOrigin: `${HUB.x}px ${HUB.y}px`,
					transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.s})`,
					opacity: boardOpacity,
				}}
			>
				<SSD {...BOX.ssd} pop={showTop} on={1} read={read} scan={(f - T.loadStart) / 26} />
				<RAM {...BOX.ram} pop={showRam} on={1} usedGB={usedGB} access={access} />
				<CPU {...BOX.cpu} pop={showCpu} on={1} cores={cores} heat={cpuHeat} />
				<GPU {...BOX.gpu} pop={showGpu} on={1} cell={gpuCell} heat={gpuHeat} vram={vram} />

				<ChipLabel x={BOX.ssd.x} y={282} text="SSD" sub="Modello 8B · 4,7 GB" on={prog(f, T.popTop + 4, 8)} hot={read} />
				<ChipLabel
					x={BOX.ram.x}
					y={282}
					text={`RAM · ${gb(usedGB)} / 16 GB`}
					on={prog(f, T.popTop + 7, 8)}
					hot={clamp(0.8 * prog(f, T.loadStart, 8) * (1 - prog(f, T.loadEnd, 12)) + access * 0.6)}
				/>
				<RamMeter x={BOX.ram.x} y={330} used={usedGB} on={prog(f, T.popTop + 9, 8)} />
				<ChipLabel x={BOX.cpu.x} y={BOX.gpu.y + BOX.gpu.h / 2 + 24} text="CPU" on={prog(f, T.popBottom + 4, 8)} hot={pp} />
				<ChipLabel x={BOX.gpu.x} y={BOX.gpu.y + BOX.gpu.h / 2 + 24} text="GPU" on={prog(f, T.popBottom + 7, 8)} hot={pp} />
			</div>
			{/* richiesta / stato / risposta: stesso piano, attenuazione più morbida sotto la nota */}
			<div
				style={{
					position: 'absolute',
					left: 0,
					top: 0,
					width: 1080,
					height: 1920,
					transformOrigin: `${HUB.x}px ${HUB.y}px`,
					transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.s})`,
					opacity: (1 - 0.62 * prog(f, T.cardIn + 1, 12, ease.inOutSine)) * (1 - out),
				}}
			>
				<LoadStatus f={f} lp={lp} />
				<PromptChip f={f} />
				<AnswerBubble f={f} />
			</div>
			<CollapseLight f={f} cam={cam} />
			<NoteCard f={f} abs={abs} />
		</AbsoluteFill>
	);
};

/** Livello della RAM: quota di sistema (grigio) + modello (arancione). */
const RamMeter: React.FC<{x: number; y: number; used: number; on: number}> = ({x, y, used, on}) => {
	const w = 300;
	const sys = 1.3 / 16;
	return (
		<div style={{position: 'absolute', left: x - w / 2, top: y, width: w, height: 8, borderRadius: 4, background: alpha(COLORS.white, 0.08), opacity: on, overflow: 'hidden'}}>
			<div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: `${sys * 100}%`, background: alpha(COLORS.gray, 0.55)}} />
			<div
				style={{
					position: 'absolute',
					left: `${sys * 100}%`,
					top: 0,
					bottom: 0,
					width: `${Math.max(0, (used - 1.3) / 16) * 100}%`,
					background: `linear-gradient(90deg, ${COLORS.orange} 0%, ${COLORS.orangeHot} 100%)`,
					boxShadow: `0 0 10px ${COLORS.orange}`,
				}}
			/>
		</div>
	);
};
