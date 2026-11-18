import React from 'react';
import {clamp, ease, hit, lerp, prog} from '../../lib/math';
import {alpha, boxGlow, COLORS, FONTS, textGlow} from '../../theme';
import {WIDTH} from '../../timeline';
import {HUD_IN, HUD_OUT} from './shell-timing';
import {SHOTS} from './stage';

const LABEL_Y = 418; // appena sopra il palco, sotto lo spark
const LABEL_H = 46;
const BAR = {y: 1212, seg: 116, gap: 10, h: 6} as const; // appena sotto il palco, sopra la caption
const BAR_W = SHOTS.length * BAR.seg + (SHOTS.length - 1) * BAR.gap;
const LAST = SHOTS.length - 1;

/** Etichetta "01 — TESTI CINETICI": a ogni taglio la vecchia esce verso l'alto e la nuova sale, dentro una maschera. */
export const ShotLabel: React.FC<{frame: number}> = ({frame}) => (
	<div
		style={{
			position: 'absolute',
			left: 0,
			top: LABEL_Y - LABEL_H / 2,
			width: WIDTH,
			height: LABEL_H,
			overflow: 'hidden',
			fontFamily: FONTS.mono,
			fontWeight: 500,
			fontSize: 26,
			letterSpacing: '0.16em',
			lineHeight: `${LABEL_H}px`,
			whiteSpace: 'pre',
			fontVariantLigatures: 'none',
		}}
	>
		{SHOTS.map((shot, i) => {
			const inAt = i === 0 ? HUD_IN : shot.start;
			const outAt = i === LAST ? HUD_OUT : SHOTS[i + 1].start - 3; // l'uscita anticipa il taglio di 3 frame
			if (frame < inAt || frame > outAt + 5) return null;
			const out = prog(frame, outAt, 4, ease.inCubic);
			const rise = (delay: number) => (1 - prog(frame, inAt + delay, 9, ease.outQuint)) * LABEL_H - out * LABEL_H;
			return (
				<div key={shot.id} style={{position: 'absolute', left: 0, top: 0, width: WIDTH, display: 'flex', justifyContent: 'center', paddingLeft: '0.16em', boxSizing: 'border-box'}}>
					<span style={{display: 'inline-block', color: COLORS.orange, textShadow: textGlow(COLORS.orange, 0.5), transform: `translateY(${rise(0)}px)`}}>
						{String(i + 1).padStart(2, '0')}
					</span>
					<span style={{display: 'inline-block', color: COLORS.grayDim, transform: `translateY(${rise(1)}px)`}}>{' — '}</span>
					<span style={{display: 'inline-block', color: COLORS.gray, transform: `translateY(${rise(2)}px)`}}>{shot.label}</span>
				</div>
			);
		})}
	</div>
);

/** Barra di avanzamento "a storie": cinque segmenti, quello corrente si riempie lungo la durata dello shot. */
export const ProgressBar: React.FC<{frame: number}> = ({frame}) => {
	if (frame < HUD_IN - 2 || frame > HUD_OUT + 10) return null;
	// uscita: a reel completo la barra lampeggia e si richiude verso il centro
	const collapse = prog(frame, HUD_OUT, 9, ease.inOutCubic);
	const done = hit(frame, HUD_OUT - 2, 7);
	return (
		<div
			style={{
				position: 'absolute',
				left: (WIDTH - BAR_W) / 2,
				top: BAR.y - BAR.h / 2,
				width: BAR_W,
				height: BAR.h,
				display: 'flex',
				gap: BAR.gap,
				transform: `scaleX(${1 - collapse})`,
				opacity: 1 - Math.pow(collapse, 3),
			}}
		>
			{SHOTS.map((shot, i) => {
				const appear = prog(frame, HUD_IN - 2 + i * 2, 9, ease.outQuint);
				// l'ultimo segmento si completa poco prima dell'uscita dell'HUD
				const len = i === LAST ? HUD_OUT - 2 - shot.start : shot.len;
				const fill = clamp((frame - shot.start + 1) / len);
				const current = fill > 0 && fill < 1;
				const flash = Math.max(hit(frame, shot.start + len, 7), done); // lampo quando il segmento si completa
				return (
					<div
						key={shot.id}
						style={{
							position: 'relative',
							width: BAR.seg,
							height: BAR.h,
							borderRadius: BAR.h / 2,
							background: alpha(COLORS.white, 0.16),
							transform: `scaleX(${appear})`,
							transformOrigin: '0 50%',
							opacity: appear,
						}}
					>
						<div
							style={{
								position: 'absolute',
								left: 0,
								top: 0,
								height: BAR.h,
								width: Math.max(fill > 0 ? BAR.h : 0, fill * BAR.seg),
								borderRadius: BAR.h / 2,
								background: flash > 0.02 ? `color-mix(in srgb, ${COLORS.orangeHot} ${Math.round(flash * 100)}%, ${COLORS.orange})` : COLORS.orange,
								boxShadow: boxGlow(COLORS.orange, lerp(0.35, 1, flash)),
							}}
						/>
						{current ? (
							// testina luminosa in punta al riempimento
							<div
								style={{
									position: 'absolute',
									left: fill * BAR.seg - 5,
									top: BAR.h / 2 - 5,
									width: 10,
									height: 10,
									borderRadius: 5,
									background: COLORS.orangeHot,
									boxShadow: boxGlow(COLORS.orangeBright, 0.7),
								}}
							/>
						) : null}
					</div>
				);
			})}
		</div>
	);
};
