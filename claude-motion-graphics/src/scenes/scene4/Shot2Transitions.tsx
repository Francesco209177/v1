import React from 'react';
import {useCurrentFrame} from 'remotion';
import {clamp, ease, hit, lerp, prog} from '../../lib/math';
import {alpha, boxGlow, COLORS} from '../../theme';
import {Panel, PANEL_BG, SCREEN} from './shot2-panels';

/**
 * SHOT 2 · TRANSIZIONI DINAMICHE (45 frame).
 * Sei pannelli pieni, cinque transizioni diverse in catena (ritmo di mezzo beat), dentro uno "schermo" arrotondato:
 *   f0   apertura   lo schermo si apre da una linea di luce (stile tubo catodico)
 *   f7   tendina    diagonale con strisce di scia
 *   f15  iride      cerchio dal centro con anello scuro in testa
 *   f22  lamelle    sei fette verticali sfalsate, a direzioni alterne
 *   f30  spinta     scorrimento laterale con vera sfocatura di movimento (sotto-campioni)
 *   f37  zoom       la camera attraversa il cerchio bianco
 *   f41  chiusura   lo schermo collassa in una linea di luce
 */
const HITS = {wipe: 7, iris: 15, slices: 22, push: 30, zoom: 37, out: 41} as const;
const HIT_LIST = [HITS.wipe, HITS.iris, HITS.slices, HITS.push, HITS.zoom];
const {w: W, h: H} = SCREEN;
const INK = COLORS.bg;
const fill: React.CSSProperties = {position: 'absolute', left: 0, top: 0, width: W, height: H};

/** Tendina diagonale: tutto ciò che sta a sinistra del bordo inclinato "/" è visibile. */
const SKEW = 210;
const wipeClip = (p: number): string => {
	const x = lerp(-SKEW, W + SKEW, p);
	return `polygon(0px 0px, ${x + SKEW}px 0px, ${x - SKEW}px ${H}px, 0px ${H}px)`;
};
const wipeProg = (frame: number, lag: number): number => prog(frame, HITS.wipe - 1 + lag, 6.5, ease.outQuart);

/** Spinta + zoom finale, valutati a un tempo frazionario `t` (serve ai sotto-campioni dell'otturatore). */
const GUTTER = 28;
const pushAt = (t: number): number => ease.outQuint(clamp((t - (HITS.push - 1)) / 7));
const zoomAt = (t: number): number => 1 + 6.6 * ease.inCubic(clamp((t - (HITS.zoom - 4.5)) / 5));
const PushZoom: React.FC<{t: number}> = ({t}) => {
	const p = pushAt(t);
	const zoom = zoomAt(t);
	const anticipation = 1 - 0.07 * Math.sin(Math.PI * clamp((t - 31.5) / 2.5)); // il cerchio si ritrae prima dello zoom
	return (
		<>
			{p < 1 ? <Panel id={3} t={t - HITS.slices} shiftX={-140 * p} style={{transform: `translateX(${-(W + GUTTER) * p}px)`}} /> : null}
			<Panel
				id={4}
				t={t - HITS.push}
				shiftX={170 * (1 - p)}
				style={{transform: `translateX(${(W + GUTTER) * (1 - p)}px) scale(${zoom * anticipation})`}}
			/>
		</>
	);
};

/**
 * Sfocatura di movimento reale: N istanti dentro l'otturatore, mediati (opacità 1, 1/2, 1/3…).
 * Funziona perché ogni campione copre tutto lo schermo con un fondo opaco.
 */
const Shutter: React.FC<{frame: number; samples: number; shutter?: number; render: (t: number) => React.ReactNode}> = ({
	frame,
	samples,
	shutter = 0.7,
	render,
}) => (
	<>
		{Array.from({length: samples}, (_, k) => (
			<div key={k} style={{...fill, background: INK, opacity: 1 / (k + 1)}}>
				{render(frame - (k * shutter) / samples)}
			</div>
		))}
	</>
);

export const Shot2Transitions: React.FC = () => {
	const frame = useCurrentFrame();

	// schermo: apertura (f0-3) e chiusura (f41-44) "a tubo catodico"
	const open = ease.outCubic(clamp((frame + 0.4) / 3.4));
	const close = ease.inQuad(clamp((frame - (HITS.out - 1)) / 4));
	const scaleY = lerp(0.02, 1, open) * lerp(1, 0.012, close);
	const scaleX = lerp(1.14, 1, open) * lerp(1, 1.1, close);
	const hot = clamp(1 - open + Math.pow(close, 1.6)); // velo incandescente quando è una linea

	// reazione dello schermo a ogni transizione: colpetto di scala + minima rotazione alternata
	let punch = 0;
	let twist = 0;
	HIT_LIST.forEach((h, i) => {
		punch += hit(frame, h, 5);
		twist += (i % 2 ? -1 : 1) * hit(frame, h, 7);
	});
	const scale = 1 + 0.026 * punch + frame * 0.0006;

	const layers: React.ReactNode[] = [];

	// pannello 0 (di partenza)
	if (frame < HITS.wipe + 7) layers.push(<Panel key="p0" id={0} t={frame} />);

	// 1 · TENDINA diagonale: due strisce in testa (bianca, scura), poi il pannello arancione
	if (frame >= HITS.wipe - 1 && frame < HITS.iris + 7) {
		const wiping = frame < HITS.wipe + 7;
		if (wiping) {
			layers.push(<div key="w-a" style={{...fill, background: COLORS.white, clipPath: wipeClip(wipeProg(frame, 0))}} />);
			layers.push(<div key="w-b" style={{...fill, background: INK, clipPath: wipeClip(wipeProg(frame, 0.32))}} />);
		}
		layers.push(<Panel key="p1" id={1} t={frame - HITS.wipe} style={wiping ? {clipPath: wipeClip(wipeProg(frame, 0.64))} : undefined} />);
	}

	// 2 · IRIDE dal centro: anello scuro in testa, poi il pannello bianco
	if (frame >= HITS.iris - 1 && frame < HITS.slices + 8) {
		const opening = frame < HITS.iris + 7;
		const ring = 640 * prog(frame, HITS.iris - 1.5, 7, ease.outQuart);
		const iris = 640 * prog(frame, HITS.iris - 1, 7, ease.outQuart);
		if (opening) layers.push(<div key="i-ring" style={{...fill, background: INK, clipPath: `circle(${ring}px at ${W / 2}px ${H / 2}px)`}} />);
		layers.push(
			<Panel key="p2" id={2} t={frame - HITS.iris} style={opening ? {clipPath: `circle(${iris}px at ${W / 2}px ${H / 2}px)`} : undefined} />,
		);
	}

	// 3 · LAMELLE: sei fette verticali che entrano sfalsate, alternando alto/basso
	if (frame >= HITS.slices - 1 && frame < HITS.push - 1) {
		const n = 6;
		const sw = W / n;
		for (let i = 0; i < n; i++) {
			const p = prog(frame, HITS.slices - 1 + i * 0.6, 5, ease.outQuart);
			const dir = i % 2 ? 1 : -1;
			layers.push(
				<div key={`s${i}`} style={{position: 'absolute', left: i * sw, top: 0, width: sw + 1, height: H, overflow: 'hidden'}}>
					<Panel id={3} t={frame - HITS.slices} style={{left: -i * sw, transform: `translateY(${dir * (1 - p) * H}px)`}} />
				</div>,
			);
		}
	}

	// 4 · SPINTA laterale  +  5 · ZOOM attraverso il cerchio (sotto-campionati per la sfocatura)
	if (frame >= HITS.push - 1 && frame < HITS.zoom) {
		const fast = (frame >= HITS.push && frame <= HITS.push + 3) || frame >= HITS.zoom - 3;
		layers.push(<Shutter key="pz" frame={frame} samples={fast ? 6 : 1} render={(t) => <PushZoom t={t} />} />);
	}

	// pannello 5 (d'arrivo): il bianco del cerchio ha riempito lo schermo
	if (frame >= HITS.zoom) layers.push(<Panel key="p5" id={5} t={frame - HITS.zoom} />);

	const glow = 0.55 + 0.5 * punch + 1.2 * hot;
	return (
		<>
			{/* cornice-fantasma dietro lo schermo: reagisce in ritardo => profondità */}
			<div
				style={{
					position: 'absolute',
					left: SCREEN.x,
					top: SCREEN.y,
					width: W,
					height: H,
					borderRadius: SCREEN.r,
					border: `3px solid ${alpha(COLORS.orange, 0.34)}`,
					boxSizing: 'border-box',
					opacity: prog(frame, 1, 5, ease.outCubic) * (1 - prog(frame, HITS.out - 2, 4, ease.inCubic)),
					transform: `scale(${1.05 + 0.05 * hit(frame, 2, 9) + 0.035 * HIT_LIST.reduce((s, h) => s + hit(frame, h + 1.5, 8), 0)})`,
				}}
			/>
			<div
				style={{
					position: 'absolute',
					left: SCREEN.x,
					top: SCREEN.y,
					width: W,
					height: H,
					borderRadius: SCREEN.r,
					transform: `rotate(${twist * 0.55}deg) scale(${scaleX * scale}, ${scaleY * scale})`,
					boxShadow: `0 44px 110px rgba(0,0,0,0.6), ${boxGlow(COLORS.orange, glow)}`,
				}}
			>
				<div style={{...fill, borderRadius: SCREEN.r, overflow: 'hidden', background: PANEL_BG[0]}}>
					{layers}
					{hot > 0.001 ? <div style={{...fill, background: COLORS.orangeHot, opacity: hot}} /> : null}
				</div>
			</div>
		</>
	);
};
