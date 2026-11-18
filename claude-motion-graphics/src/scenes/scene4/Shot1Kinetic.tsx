import React from 'react';
import {useCurrentFrame} from 'remotion';
import {clamp, ease, hit, lerp, prog} from '../../lib/math';
import {alpha, boxGlow, COLORS, FONTS} from '../../theme';
import {HEIGHT, WIDTH} from '../../timeline';
import {STAGE} from './stage';

/**
 * SHOT 1 · TESTI CINETICI (45 frame, primo shot del drop).
 * "IDEE / IN / MOVIMENTO": ogni colpo (ritmo di mezzo beat) usa una tecnica diversa di tipografia cinetica.
 *   f0   IDEE       scala da enorme + sfocatura di zoom (sotto-campioni temporali)
 *   f7   IN         targhetta che si apre + reveal verticale a maschera, nastro contornato che scorre dietro
 *   f15  MOVIMENTO  lettere sfalsate + stiramento orizzontale che scatta indietro
 *   f22  echi       duplicati contornati che cadono a cascata, tracking di IDEE che si apre
 *   f30  scansione  fascia arancione che inverte i colori riga per riga
 *   f41  uscita     le righe schizzano via ai lati, la targhetta si chiude
 */
const HITS = {idee: 0, inWord: 7, movimento: 15, echo: 22, scan: 30, out: 41} as const;

// centri verticali delle tre righe del lockup
const ROW = {idee: 612, pill: 810, mov: 972} as const;
const PILL = {w: 252, h: 138, r: 30} as const;
// fascia visibile dello shot: bordi sfumati così nulla di luminoso esce dal palco
const BAND = {top: 396, h: 828} as const;
const EDGE_FADE = `linear-gradient(180deg, transparent 0px, #000 46px, #000 ${BAND.h - 46}px, transparent ${BAND.h}px)`;

const DISPLAY: React.CSSProperties = {
	fontFamily: FONTS.display,
	fontWeight: 700,
	lineHeight: 1,
	whiteSpace: 'nowrap',
	textTransform: 'uppercase',
};

type Tone = 'light' | 'dark'; // dark = versione invertita dentro la fascia di scansione

/** Scala di IDEE nell'impatto iniziale: da 7x a 1x con un piccolo rimbalzo di compressione. */
const slamScale = (t: number): number => {
	const land = ease.outExpo(clamp(t / 6));
	const squash = Math.sin(Math.PI * clamp((t - 2.5) / 3.5)) * 0.05;
	return 1 + 6 * (1 - land) - squash;
};

/** Uscita laterale comune: piccola anticipazione contraria (f38-40) poi frustata (f41-44). */
const exitShift = (frame: number, dir: number): {x: number; stretch: number; fade: number} => {
	const anticipation = Math.sin(Math.PI * clamp((frame - 37) / 4.5) * 0.5) * 16;
	const p = ease.inCubic(clamp((frame - (HITS.out - 1)) / 4.4));
	return {x: dir * (-anticipation + 1250 * p), stretch: 1 + 0.7 * p, fade: 1 - p * p};
};

/** IDEE — riga eroe. */
const Idee: React.FC<{frame: number; tone: Tone}> = ({frame, tone}) => {
	const rise = prog(frame, HITS.inWord - 2, 7, ease.outQuint);
	const cy = lerp(STAGE.cy, ROW.idee, rise);
	const tracking = lerp(-0.012, 0.062, prog(frame, HITS.echo - 1, 14, ease.outQuint));
	const exit = exitShift(frame, -1);
	const slamming = frame < 6;
	const samples = slamming ? 16 : 1; // sotto-campioni dell'otturatore => vera sfocatura di zoom
	const fadeIn = clamp(0.35 + frame * 0.65);
	const stretchY = 1 + 0.07 * Math.sin(Math.PI * rise); // leggero allungamento mentre sale
	const color = tone === 'light' ? COLORS.white : COLORS.black;
	return (
		<div
			style={{
				position: 'absolute',
				left: 0,
				top: cy,
				width: WIDTH,
				height: 0,
				isolation: 'isolate',
				transform: `translateX(${exit.x}px) scaleX(${exit.stretch})`,
				opacity: exit.fade,
			}}
		>
			{Array.from({length: samples}, (_, k) => {
				const t = frame - (k * 0.8) / samples;
				return (
					<div
						key={k}
						style={{
							...DISPLAY,
							position: 'absolute',
							left: 0,
							width: WIDTH,
							top: 0,
							textAlign: 'center',
							fontSize: 300,
							letterSpacing: `${tracking}em`,
							paddingLeft: `${tracking}em`, // compensa la spaziatura dopo l'ultima lettera
							boxSizing: 'border-box',
							color,
							opacity: fadeIn / samples,
							mixBlendMode: samples > 1 ? 'plus-lighter' : undefined,
							transform: `translateY(-50%) scale(${slamScale(t)}, ${slamScale(t) * stretchY})`,
							textShadow: tone === 'light' && !slamming ? `0 0 46px ${alpha(COLORS.orangeHot, 0.28)}` : undefined,
						}}
					>
						Idee
					</div>
				);
			})}
		</div>
	);
};

/** Nastro di testo contornato che scorre dietro la targhetta. */
const Ticker: React.FC<{frame: number; tone: Tone}> = ({frame, tone}) => {
	const appear = prog(frame, HITS.inWord - 1, 4, ease.outCubic);
	if (appear <= 0) return null;
	const whip = ease.outQuint(clamp((frame - (HITS.inWord - 1)) / 10));
	const exit = ease.inCubic(clamp((frame - (HITS.out - 1)) / 4.4));
	const x = 260 - frame * 9 - 620 * whip - 900 * exit;
	const stroke = tone === 'light' ? COLORS.grayDim : alpha(COLORS.black, 0.5);
	const unit = 'Idee in movimento — ';
	return (
		<div
			style={{
				position: 'absolute',
				left: 0,
				top: ROW.pill - 60,
				width: WIDTH,
				height: 120,
				overflow: 'hidden',
				opacity: appear * (1 - exit),
				WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, #000 16%, #000 84%, transparent 100%)',
				maskImage: 'linear-gradient(90deg, transparent 0%, #000 16%, #000 84%, transparent 100%)',
			}}
		>
			<div
				style={{
					...DISPLAY,
					position: 'absolute',
					left: 0,
					top: 60,
					fontSize: 96,
					letterSpacing: '-0.01em',
					whiteSpace: 'pre',
					color: 'transparent',
					WebkitTextStroke: `2px ${stroke}`,
					transform: `translate(${x}px, -50%)`,
				}}
			>
				{unit.repeat(5)}
			</div>
		</div>
	);
};

/** IN — targhetta piena con reveal verticale a maschera. */
const Pill: React.FC<{frame: number; tone: Tone}> = ({frame, tone}) => {
	const open = prog(frame, HITS.inWord - 1, 6, ease.outQuint);
	if (open <= 0) return null;
	const text = prog(frame, HITS.inWord + 0.5, 6, ease.outQuint);
	const close = ease.inCubic(clamp((frame - (HITS.out - 1)) / 4.2));
	const punch = 1 + 0.07 * (hit(frame, HITS.movimento, 5) + hit(frame, HITS.echo, 5) + hit(frame, HITS.scan, 5));
	const bg = tone === 'light' ? COLORS.orange : COLORS.black;
	const ink = tone === 'light' ? COLORS.black : COLORS.orange;
	return (
		<div
			style={{
				position: 'absolute',
				left: STAGE.cx - PILL.w / 2,
				top: ROW.pill - PILL.h / 2,
				width: PILL.w,
				height: PILL.h,
				borderRadius: PILL.r,
				background: bg,
				overflow: 'hidden',
				transform: `scale(${open * (1 - close) * punch}, ${lerp(0.55, 1, open) * punch})`,
				boxShadow: tone === 'light' ? boxGlow(COLORS.orange, 0.9) : undefined,
			}}
		>
			<div
				style={{
					...DISPLAY,
					position: 'absolute',
					left: 0,
					top: PILL.h / 2,
					width: PILL.w,
					textAlign: 'center',
					fontSize: 112,
					letterSpacing: '-0.02em',
					color: ink,
					transform: `translateY(-50%) translateY(${(1 - text) * 130 - close * 130}px)`,
				}}
			>
				In
			</div>
		</div>
	);
};

const MOV_LETTERS = 'Movimento'.split('');

/** Una riga MOVIMENTO lettera per lettera (usata per la riga piena e per gli echi contornati). */
const MovimentoRow: React.FC<{frame: number; y: number; fill: string; stroke?: string; staggered: boolean}> = ({
	frame,
	y,
	fill,
	stroke,
	staggered,
}) => {
	// stiramento orizzontale che scatta indietro con rimbalzo (outBack)
	const snap = ease.outBack(clamp((frame - (HITS.movimento - 1)) / 9));
	const stretch = 1 + 0.42 * (1 - snap);
	const exit = exitShift(frame, 1);
	return (
		<div
			style={{
				...DISPLAY,
				position: 'absolute',
				left: 0,
				top: y,
				width: WIDTH,
				display: 'flex',
				justifyContent: 'center',
				fontSize: 150,
				letterSpacing: '-0.03em',
				color: fill,
				WebkitTextStroke: stroke ? `3px ${stroke}` : undefined,
				opacity: exit.fade,
				transform: `translate(${exit.x}px, -50%) scaleX(${stretch * exit.stretch})`,
			}}
		>
			{MOV_LETTERS.map((ch, i) => {
				const p = staggered ? prog(frame, HITS.movimento - 1 + i * 0.55, 6, ease.outQuint) : 1;
				return (
					// maschera per lettera: il glifo sale da sotto la propria linea di base
					<span key={i} style={{display: 'inline-block', overflow: 'hidden', padding: '12px 6px 18px', margin: '-12px -6px -18px'}}>
						<span style={{display: 'inline-block', transform: `translateY(${(1 - p) * 165}px) rotate(${(1 - p) * 9}deg)`}}>{ch}</span>
					</span>
				);
			})}
		</div>
	);
};

/** MOVIMENTO + echi contornati che scendono a cascata. */
const Movimento: React.FC<{frame: number; tone: Tone}> = ({frame, tone}) => {
	if (frame < HITS.movimento - 1) return null;
	const light = tone === 'light';
	const ink = light ? COLORS.white : COLORS.black;
	// riempimento opaco del colore di fondo: ogni copia nasconde quella sotto (pila pulita, niente grovigli)
	const backdrop = light ? '#0B0A09' : COLORS.orange;
	const drift = Math.max(0, frame - HITS.echo) * 0.35; // gli echi continuano a scivolare piano
	const echoes = [
		{drop: prog(frame, HITS.echo + 0.5, 9, ease.outQuint), dy: 148, stroke: light ? COLORS.orangeDeep : alpha(COLORS.black, 0.5)},
		{drop: prog(frame, HITS.echo - 1, 7, ease.outQuint), dy: 74, stroke: light ? COLORS.orange : COLORS.black},
	];
	return (
		<>
			{echoes.map((e, i) =>
				e.drop > 0 ? (
					<MovimentoRow
						key={i}
						frame={frame}
						y={ROW.mov + e.drop * e.dy + drift * (i === 0 ? 1 : 0.5)}
						fill={backdrop}
						stroke={e.stroke}
						staggered={false}
					/>
				) : null,
			)}
			<MovimentoRow frame={frame} y={ROW.mov} fill={ink} staggered />
		</>
	);
};

/** L'intero lockup in una tonalità: così la fascia di scansione può ridisegnarlo invertito. */
const Lockup: React.FC<{frame: number; tone: Tone}> = ({frame, tone}) => {
	// "camera": spinta lenta in avanti + colpetto di scala a ogni colpo
	const punch = hit(frame, HITS.inWord, 5) + hit(frame, HITS.movimento, 5) + 0.8 * hit(frame, HITS.echo, 5) + 1.2 * hit(frame, HITS.scan, 5);
	const cam = 1 + frame * 0.0009 + 0.03 * punch;
	return (
		<div
			style={{
				position: 'absolute',
				left: 0,
				top: -BAND.top,
				width: WIDTH,
				height: HEIGHT,
				transform: `scale(${cam})`,
				transformOrigin: `${STAGE.cx}px ${STAGE.cy}px`,
			}}
		>
			<Ticker frame={frame} tone={tone} />
			<Idee frame={frame} tone={tone} />
			<Pill frame={frame} tone={tone} />
			<Movimento frame={frame} tone={tone} />
		</div>
	);
};

export const Shot1Kinetic: React.FC = () => {
	const frame = useCurrentFrame();

	// fascia di scansione: scende a velocità costante attraversando le righe in ordine di lettura
	const scanY = 250 + 172 * (frame - (HITS.scan - 1)) - BAND.top;
	const scanning = frame >= HITS.scan && frame <= HITS.scan + 6;
	const half = 150;
	const tilt = 84;
	const clip = `polygon(0px ${scanY - half + tilt / 2}px, ${WIDTH}px ${scanY - half - tilt / 2}px, ${WIDTH}px ${scanY + half - tilt / 2}px, 0px ${scanY + half + tilt / 2}px)`;

	return (
		<div
			style={{
				position: 'absolute',
				left: 0,
				top: BAND.top,
				width: WIDTH,
				height: BAND.h,
				overflow: 'hidden',
				WebkitMaskImage: EDGE_FADE,
				maskImage: EDGE_FADE,
			}}
		>
			<Lockup frame={frame} tone="light" />
			{scanning ? (
				<div style={{position: 'absolute', inset: 0, clipPath: clip}}>
					<div
						style={{
							position: 'absolute',
							inset: 0,
							background: `linear-gradient(180deg, ${COLORS.orangeBright} 0%, ${COLORS.orange} 100%)`,
						}}
					/>
					<Lockup frame={frame} tone="dark" />
				</div>
			) : null}
		</div>
	);
};
