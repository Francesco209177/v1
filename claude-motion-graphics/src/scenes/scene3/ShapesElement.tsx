import React from 'react';
import {clamp, ease, hit, lerp, prog} from '../../lib/math';
import {alpha, COLORS} from '../../theme';
import {morphPath} from './shapes';
import {beatStep, BORN, IGNITE} from './timing';
import {ringSlot} from './tokenFlight';

const R = 45; // raggio delle forme (px)
/** Colore "acceso" di ciascuna forma (viaggia con la forma mentre gira sull'anello). */
const LIT_COLORS = [COLORS.orange, COLORS.orangeBright, COLORS.white, COLORS.orangeDeep];

/**
 * <Forma /> — quattro forme su un anello. Nascita (fase A): il cerchio si traccia e si riempie,
 * poi compaiono triangolo, quadrato ed esagono come contorni grigi. Dopo il tocco dello spark
 * (fase B) i contorni si riempiono di arancione e, a ogni beat, l'anello scatta di 90° con overshoot
 * mentre ogni forma si trasforma in quella dello slot successivo.
 */
export const ShapesElement: React.FC<{frame: number; lit: number; weight: number; tempo: number}> = ({frame: f, lit, weight, tempo}) => {
	const born = BORN.S;
	// passo sul beat (dopo l'accensione); `tempo` 2 = a mezzo beat (fase C, col riser)
	const every = tempo > 1 ? 7.5 : 15;
	const from = tempo > 1 ? 150 : IGNITE.S;
	const base = tempo > 1 ? 4 : 0; // 4 passi fatti tra 90 e 150
	const step = f >= IGNITE.S ? beatStep(f, from, every) : {n: 0, t: 0};
	const stepping = f >= IGNITE.S;
	const u = stepping ? clamp(step.t / (every * 0.72)) : 1;
	const n = stepping ? base + step.n : -1;
	const ringRot = stepping ? 90 * (n + ease.outBack(u)) : 0;
	const morph = stepping ? ease.outBack(clamp(step.t / (every * 0.62))) : 1;
	const bounce = stepping ? Math.sin(Math.PI * u) * (1 - u) * 0.5 : 0;
	const sw = 3.5 * weight;

	return (
		<svg
			width={360}
			height={360}
			viewBox="-180 -180 360 360"
			style={{
				position: 'absolute',
				left: -180,
				top: -180,
				overflow: 'visible',
				filter: `drop-shadow(0 0 ${10 + 12 * lit}px ${alpha(COLORS.orange, 0.25 + 0.45 * lit)})`,
			}}
		>
			{[0, 1, 2, 3].map((k) => {
				const isCircle = k === 0;
				// nascita: il cerchio si disegna sul beat, le altre saltano fuori sfalsate
				const appear = isCircle ? 1 : ease.outBack(clamp((f - (born + 1 + k * 3)) / 9));
				if (appear <= 0) return null;
				const draw = isCircle ? prog(f, born, 9, ease.outQuint) : 1;
				const fillIn = isCircle ? prog(f, born + 6, 8, ease.outCubic) : 0;
				const litK = prog(f, IGNITE.S + k * 2, 7, ease.outCubic);
				const pos = ringSlot(k, ringRot);
				const bob = 4 * Math.sin(f / 11 + k * 1.9);
				const kindFrom = stepping ? k + n : k;
				const kindTo = stepping ? k + n + 1 : k;
				const d = morphPath(kindFrom, kindTo, morph, R);
				const dir = k % 2 === 0 ? 1 : -1;
				// prima dell'accensione dondola piano (vale 0 esattamente al tocco: nessuno scatto)
				const spin = stepping ? dir * 180 * ease.inOutCubic(u) + n * 180 : dir * 8 * Math.sin(((f - IGNITE.S) * Math.PI) / 15);
				const s = appear * (1 + bounce + 0.3 * hit(f, IGNITE.S + k * 2, 8));
				const color = LIT_COLORS[k];
				const strokeColor = isCircle ? COLORS.orange : litK > 0.5 ? color : COLORS.gray;
				const fillOpacity = isCircle ? Math.max(fillIn, litK) : litK;
				return (
					<g key={k} transform={`translate(${pos.x.toFixed(2)} ${(pos.y + bob).toFixed(2)}) rotate(${spin.toFixed(2)}) scale(${s.toFixed(4)})`}>
						<path
							d={d}
							fill={color}
							fillOpacity={k === 2 ? fillOpacity * 0.92 : fillOpacity}
							stroke={strokeColor}
							strokeOpacity={lerp(isCircle ? 1 : 0.85, 1, litK)}
							strokeWidth={sw}
							strokeLinejoin="round"
							strokeLinecap="round"
							pathLength={1}
							strokeDasharray="1 1"
							strokeDashoffset={1 - draw}
						/>
					</g>
				);
			})}
		</svg>
	);
};
