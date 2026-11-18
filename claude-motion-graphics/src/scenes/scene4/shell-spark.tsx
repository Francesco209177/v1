import React, {useMemo} from 'react';
import {ClaudeSpark} from '../../components/ClaudeSpark';
import {FrameCanvas} from '../../components/FrameCanvas';
import {drawGlow, withAlpha} from '../../lib/canvas';
import {clamp, ease, hash, lerp, TAU} from '../../lib/math';
import {COLORS} from '../../theme';
import {HEIGHT, SPARK_POSE, WIDTH} from '../../timeline';
import {fadeWindow, lastCut} from './shell-timing';

const FROM = SPARK_POSE.creationEnd; // dove la scena 3 lascia lo spark (centro palco, grande)
const TO = SPARK_POSE.resultEnd; // posto da narratore, sopra il palco
const FLIGHT = 12; // frame del volo sul drop

/** outBack attenuato: arriva veloce, supera di poco (~3%) e si assesta. */
const softBack = (t: number, s = 0.9): number => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);

/** Posizione e taglia dello spark durante il volo (tempo frazionario ammesso: serve alla scia). */
const flightAt = (t: number): {x: number; y: number; size: number} => {
	const k = clamp(t / FLIGHT);
	return {
		x: lerp(FROM.x, TO.x, k),
		y: lerp(FROM.y, TO.y, softBack(k)),
		size: lerp(FROM.size, TO.size, ease.outQuint(clamp(t / 10))),
	};
};

export type NarratorPose = {x: number; y: number; size: number; rotation: number; scale: number; glow: number; stretch: number};

/**
 * Posa dello spark-narratore in funzione del frame.
 * f0 = SPARK_POSE.creationEnd (glow 1.6) · da f12 in poi = SPARK_POSE.resultEnd, salvo le reazioni
 * ai cambi shot (impulso, calcio di rotazione, lampo) che tornano ESATTAMENTE a riposo entro 24 frame.
 */
export const narratorPose = (frame: number): NarratorPose => {
	const p = flightAt(frame);
	const speed = Math.abs(p.y - flightAt(frame - 1).y); // px/frame: allunga lo spark lungo la traiettoria
	const stretch = 1 + Math.min(0.5, speed / 300);
	let glow = lerp(1.6, 1, ease.outCubic(clamp(frame / 14)));

	let rotation = 0;
	let scale = 1;
	let dip = 0;
	const cut = lastCut(frame);
	if (cut) {
		const {d} = cut;
		const dirSign = cut.index % 2 ? -1 : 1;
		rotation = dirSign * 34 * Math.exp(-d / 4.5) * Math.sin(d * 0.85) * fadeWindow(d, 20);
		scale = 1 + 0.26 * Math.exp(-d / 3.2) * fadeWindow(d, 20);
		glow += 0.9 * Math.exp(-d / 5) * fadeWindow(d, 24);
		dip = 9 * Math.exp(-d / 4) * Math.sin(d * 0.9) * fadeWindow(d, 20); // piccolo cenno verso il palco
	}
	return {x: p.x, y: p.y + dip, size: p.size, rotation, scale, glow, stretch};
};

/** Lo spark-narratore (ClaudeSpark condiviso + stiramento di velocità durante il volo). */
export const NarratorSpark: React.FC<{frame: number}> = ({frame}) => {
	const pose = narratorPose(frame);
	const spark = <ClaudeSpark x={pose.x} y={pose.y} size={pose.size} rotation={pose.rotation} scale={pose.scale} glow={pose.glow} />;
	if (pose.stretch === 1) return spark;
	return (
		<div
			style={{
				position: 'absolute',
				left: 0,
				top: 0,
				width: WIDTH,
				height: HEIGHT,
				transformOrigin: `${pose.x}px ${pose.y}px`,
				transform: `scale(${1 / Math.sqrt(pose.stretch)}, ${pose.stretch})`,
			}}
		>
			{spark}
		</div>
	);
};

type Ember = {a: number; v: number; life: number; r: number; hot: boolean; wob: number};

/**
 * Particelle e luce della shell (tutto in forma chiusa: posizione = f(indice, frame)):
 * - drop (f0): anello d'urto + braci dal centro del palco + scia e pulviscolo lungo il volo dello spark;
 * - cambi shot: piccolo anello e scintille attorno al narratore.
 */
export const ShellFX: React.FC<{frame: number}> = ({frame}) => {
	const embers = useMemo<Ember[]>(
		() =>
			Array.from({length: 150}, (_, i) => ({
				a: hash(i, 41) * TAU,
				v: 20 + Math.pow(hash(i, 42), 1.7) * 66,
				life: 13 + hash(i, 43) * 20,
				r: 1.3 + hash(i, 44) * 3.1,
				hot: hash(i, 45) > 0.62,
				wob: hash(i, 46) * TAU,
			})),
		[],
	);
	const dust = useMemo(
		() =>
			Array.from({length: 70}, (_, i) => ({
				born: hash(i, 51) * 7.5,
				ox: (hash(i, 52) - 0.5) * 0.7,
				vx: (hash(i, 53) - 0.5) * 7,
				life: 9 + hash(i, 54) * 15,
				r: 1 + hash(i, 55) * 2.4,
			})),
		[],
	);
	const sparks = useMemo(
		() =>
			Array.from({length: 16}, (_, i) => ({
				a: (i / 16) * TAU + hash(i, 61) * 0.5,
				v: 7 + hash(i, 62) * 11,
				life: 8 + hash(i, 63) * 7,
				r: 1.1 + hash(i, 64) * 1.6,
			})),
		[],
	);

	const cut = lastCut(frame);
	const dropActive = frame < 36;
	const cutActive = cut !== null && cut.d < 16;
	if (!dropActive && !cutActive) return null;

	return (
		<FrameCanvas
			frame={frame}
			additive
			draw={(ctx) => {
				ctx.globalCompositeOperation = 'lighter';

				if (dropActive) {
					const t = frame;
					// anello d'urto dal punto in cui lo spark si sgancia
					const ringP = clamp(t / 20);
					if (t > 0 && ringP < 1) {
						const radius = 110 + 640 * ease.outQuint(ringP);
						const a = (1 - ringP) ** 2;
						ctx.beginPath();
						ctx.arc(FROM.x, FROM.y, radius, 0, TAU);
						ctx.strokeStyle = withAlpha(COLORS.orange, 0.2 * a);
						ctx.lineWidth = 46 * (1 - ringP) + 8;
						ctx.stroke();
						ctx.strokeStyle = withAlpha(COLORS.orangeHot, 0.85 * a);
						ctx.lineWidth = 5 * (1 - ringP) + 1.5;
						ctx.stroke();
					}
					// braci radiali con attrito (tre campioni ravvicinati => piccola scia)
					const drag = 0.17;
					for (const e of embers) {
						if (t <= 0 || t >= e.life) continue;
						const fade = Math.pow(1 - t / e.life, 1.5);
						for (let s = 0; s < 3; s++) {
							const ts = Math.max(0, t - s * 0.3);
							const dist = 56 + (e.v * (1 - Math.exp(-drag * ts))) / drag;
							const x = FROM.x + Math.cos(e.a) * dist + Math.sin(ts * 0.3 + e.wob) * 4;
							const y = FROM.y + Math.sin(e.a) * dist - ts * ts * 0.05;
							drawGlow(ctx, x, y, e.r * (1 - s * 0.22), e.hot ? COLORS.orangeBright : COLORS.orange, fade * (0.85 - s * 0.27), e.hot ? '#FFFFFF' : COLORS.orangeHot);
						}
					}
					// scia luminosa dietro lo spark in volo
					if (t > 0 && t < 11) {
						const strength = clamp(1 - (t - 4) / 7);
						for (let i = 1; i <= 22; i++) {
							const u = i / 22;
							const p = flightAt(t - u * 2.4);
							drawGlow(ctx, p.x, p.y, p.size * 0.11 * (1 - u * 0.75), COLORS.orange, 0.22 * (1 - u) * strength, COLORS.orangeHot);
						}
					}
					// pulviscolo lasciato lungo la traiettoria
					for (const d of dust) {
						const age = t - d.born;
						if (age <= 0 || age >= d.life) continue;
						const p = flightAt(d.born);
						const x = p.x + d.ox * p.size + d.vx * (1 - Math.exp(-age * 0.2)) * 5;
						const y = p.y + age * 1.6;
						drawGlow(ctx, x, y, d.r, COLORS.orangeBright, 0.8 * Math.pow(1 - age / d.life, 1.4), COLORS.orangeHot);
					}
				}

				if (cut && cutActive) {
					const d = cut.d;
					// anello sottile attorno al narratore
					const rp = clamp(d / 10);
					if (rp < 1) {
						ctx.beginPath();
						ctx.arc(TO.x, TO.y, 62 + 78 * ease.outQuint(rp), 0, TAU);
						ctx.strokeStyle = withAlpha(COLORS.orangeHot, 0.55 * (1 - rp) ** 2);
						ctx.lineWidth = 3 * (1 - rp) + 1;
						ctx.stroke();
					}
					for (const s of sparks) {
						if (d >= s.life) continue;
						const dist = 58 + (s.v * (1 - Math.exp(-0.22 * d))) / 0.22;
						const a = s.a + cut.index * 0.7;
						drawGlow(ctx, TO.x + Math.cos(a) * dist, TO.y + Math.sin(a) * dist, s.r, COLORS.orangeBright, 0.9 * Math.pow(1 - d / s.life, 1.3), COLORS.orangeHot);
					}
				}
			}}
		/>
	);
};
